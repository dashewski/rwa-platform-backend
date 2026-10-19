import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel, ConsumeMessage, Message, Options } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { AppError } from '@shared/errors/app-errors';

type ConsumerRegistration = {
  queue: string;
  handler: (message: ConsumeMessage | null) => Promise<void>;
  noAck: boolean;
  prefetch?: number;
};


export abstract class BaseRabbitMQClient {
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly consumers = new Map<string, ConsumerRegistration>();
  private readonly pendingReturns = new Map<string, (error: Error) => void>();
  private stopped = false;
  private connecting = false;
  private initialized = false;

  constructor(
    public readonly uri: string,
    public readonly channelName: string,
    private readonly reconnectDelayMs: number = 5_000,
  ) { }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;

    await this.connect();
  }

  isExchangeRegistered(exchange: string) {
    return Object.prototype.hasOwnProperty.call(this.getTopologyDefinition().exchanges, exchange);
  }

  isConnected(): boolean {
    return this.channel !== null;
  }

  getExchanges(): Array<keyof ReturnType<this['getTopologyDefinition']>['exchanges']> {
    return Object.keys(this.getTopologyDefinition().exchanges)
  }

  getTopologyDefinition(): {
    exchanges: Record<string, {
      type: 'direct' | 'topic' | 'fanout' | 'headers';
      options?: Options.AssertExchange;
    }>;
    queues: Record<string, {
      options?: Options.AssertQueue;
      deferAfterAttempts: number;
      parkAfterCycles: number;
      bindings: Record<string, readonly string[]>;
    }>;
  } {
    return { exchanges: {}, queues: {} }
  }

  getExchange(name: keyof ReturnType<this['getTopologyDefinition']>['exchanges'] & string) {
    return name;
  }

  getQueue(name: keyof ReturnType<this['getTopologyDefinition']>['queues'] & string) {
    return name;
  }

  getQueueDeferAfterAttempts(queue: string): number {
    return this.getTopologyDefinition().queues[queue]?.deferAfterAttempts;
  }

  getQueueParkAfterCycles(queue: string): number {
    return this.getTopologyDefinition().queues[queue]?.parkAfterCycles;
  }

  private async connect(): Promise<void> {
    if (this.connection || this.connecting) return;

    this.stopped = false;
    await this.open();
  }

  async disconnect(): Promise<void> {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    await this.closeSilently();
  }

  async park(
    routingKey: string,
    content: unknown,
    options?: Options.Publish,
  ) {
    return await this.publish('', routingKey, content, options)
  }

  async publish(
    exchange: keyof ReturnType<this['getTopologyDefinition']>['exchanges'] & string,
    routingKey: string,
    content: unknown,
    options?: Options.Publish,
  ): Promise<void> {
    const channel = this.channel;

    if (!channel) {
      throw new AppError({
        message: `RabbitMQ "${this.channelName}" is not connected: message to "${exchange}" was not published`,
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    const buffer = Buffer.from(JSON.stringify(content));
    const messageId = options?.messageId;

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (error?: Error | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channel.off('close', onClose);
        if (messageId !== undefined) this.pendingReturns.delete(messageId);
        if (error) reject(error);
        else resolve();
      };

      const timer = setTimeout(
        () => finish(new Error(`RabbitMQ "${this.channelName}": message to "${exchange}" was not confirmed timeout`)),
        10_000, // PUBLISH_CONFIRM_TIMEOUT_MS
      );

      const onClose = (): void =>
        finish(new Error(`RabbitMQ "${this.channelName}": channel closed before the message to "${exchange}" was confirmed`));

      channel.once('close', onClose);

      if (messageId !== undefined) {
        this.pendingReturns.set(messageId, finish);
      }

      try {
        channel.publish(
          exchange,
          routingKey,
          buffer,
          {
            persistent: true,
            contentType: 'application/json',
            mandatory: true,
            ...options,
          },
          (error) => finish(error),
        );
      } catch (error) {
        finish(error as Error);
      }
    });
  }

  async consume(
    queue: keyof ReturnType<this['getTopologyDefinition']>['queues'] & string,
    handler: (message: ConsumeMessage | null) => Promise<void>,
    options?: { noAck?: boolean; prefetch?: number },
  ): Promise<string> {
    const consumerTag = `${this.channelName}.${queue}.${randomUUID()}`;
    const registration: ConsumerRegistration = {
      queue,
      handler,
      noAck: options?.noAck ?? false,
      prefetch: options?.prefetch,
    };

    this.consumers.set(consumerTag, registration);

    if (this.channel) {
      await this.registerConsumer(this.channel, consumerTag, registration);
    }

    return consumerTag;
  }

  async ack(message: ConsumeMessage): Promise<void> {
    try {
      this.channel?.ack(message);
    } catch (error) {
      logger.warn(`RabbitMQ "${this.channelName}": ack failed, the broker will redeliver the message`, { error });
    }
  }

  async nack(message: ConsumeMessage, requeue: boolean = true): Promise<void> {
    try {
      this.channel?.nack(message, false, requeue);
    } catch (error) {
      logger.warn(`RabbitMQ "${this.channelName}": nack failed, the broker will redeliver the message`, { error });
    }
  }

  async cancelConsumer(consumerTag: string): Promise<void> {
    if (!this.consumers.delete(consumerTag)) return;

    try {
      await this.channel?.cancel(consumerTag);
    } catch (error) {
      logger.warn(`RabbitMQ "${this.channelName}": cancel of consumer "${consumerTag}" failed`, { error });
    }
  }

  private async open(): Promise<void> {
    if (this.stopped || this.connecting) return;

    this.connecting = true;

    try {
      const connection = await connect(this.uri, { heartbeat: 5 });
      const channel = await connection.createConfirmChannel();

      channel.on('return', (message) => this.handleReturn(message));

      this.connection = connection;
      this.channel = channel;

      connection.on('error', (error: Error) =>
        logger.error(`RabbitMQ "${this.channelName}" connection error`, error),
      );
      connection.on('close', () => this.handleClose('connection closed'));
      channel.on('error', (error: Error) =>
        logger.error(`RabbitMQ "${this.channelName}" channel error`, error),
      );
      channel.on('close', () => this.handleClose('channel closed'));

      await this.assertTopology(channel);
      await this.subscribeAll(channel);

      logger.info(`RabbitMQ "${this.channelName}": connected, ${this.consumers.size} consumer(s) active`);
    } catch (error) {
      logger.error(`RabbitMQ "${this.channelName}": connect or topology setup failed`, { error });

      await this.closeSilently();
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private handleClose(reason: string): void {
    if (!this.connection && !this.channel) return;

    logger.warn(`RabbitMQ "${this.channelName}": ${reason}`);

    const connection = this.connection;

    this.connection = null;
    this.channel = null;

    // A channel-level error (e.g. 404 on consume) leaves the TCP connection
    // alive; close it so the reconnect starts from a clean state.
    void connection?.close().catch(() => undefined);

    this.scheduleReconnect();
  }

  private handleReturn(message: Message): void {
    const messageId = message.properties.messageId;
    const reject = messageId === undefined ? undefined : this.pendingReturns.get(messageId);

    if (!reject) {
      logger.warn(
        `RabbitMQ "${this.channelName}": message "${messageId ?? 'without id'}" was returned but is not awaited by any publisher`,
      );
      return;
    }

    reject(
      new Error(
        `RabbitMQ "${this.channelName}": message "${messageId}" was returned: no queue is bound to routing key "${message.fields.routingKey}" on exchange "${message.fields.exchange}"`,
      ),
    );
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, this.reconnectDelayMs);
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    const topology = this.getTopologyDefinition();

    for (const exchange of Object.keys(topology.exchanges)) {
      const definition = topology.exchanges[exchange];

      await channel.assertExchange(exchange, definition.type, definition.options);
    }

    for (const queue of Object.keys(topology.queues)) {
      const definition = topology.queues[queue];

      if (!Number.isFinite(definition.deferAfterAttempts)) {
        await channel.assertQueue(queue, definition.options);
      } else {
        const retryQueue = `${queue}.retry`;

        await channel.assertQueue(queue, {
          ...definition.options,
          arguments: {
            ...definition.options?.arguments,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': retryQueue,
          },
        });

        await channel.assertQueue(retryQueue, {
          durable: true,
          arguments: {
            'x-message-ttl': 30_000, // RETRY_QUEUE_DELAY_MS
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': queue,
          },
        });

        if (Number.isFinite(definition.parkAfterCycles)) {
          await channel.assertQueue(`${queue}.parked`, { durable: true });
        }
      }

      for (const exchange of Object.keys(definition.bindings)) {
        for (const routingKey of definition.bindings[exchange]) {
          await channel.bindQueue(queue, exchange, routingKey);
        }
      }
    }
  }

  private async subscribeAll(channel: ConfirmChannel): Promise<void> {
    for (const [consumerTag, registration] of this.consumers) {
      await this.registerConsumer(channel, consumerTag, registration);
    }
  }

  private async registerConsumer(
    channel: ConfirmChannel,
    consumerTag: string,
    registration: ConsumerRegistration,
  ): Promise<void> {
    if (typeof registration.prefetch === 'number') {
      await channel.prefetch(registration.prefetch, false);
    }

    await channel.consume(
      registration.queue,
      (message) => {
        if (!message) return;

        void registration.handler(message).catch((error) =>
          logger.error(`RabbitMQ "${this.channelName}": consumer "${consumerTag}" handler failed`, error),
        );
      },
      { consumerTag, noAck: registration.noAck },
    );
  }

  private async closeSilently(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;

    this.channel = null;
    this.connection = null;

    try {
      await channel?.close();
    } catch {
      // already closed
    }

    try {
      await connection?.close();
    } catch {
      // already closed
    }
  }
}
