import { connect } from 'amqp-connection-manager';
import type { AmqpConnectionManager, Channel, ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { AppError } from '@shared/errors/app-errors';

export interface RabbitMQConfig {
  uri: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

type ChannelSetup = (channel: Channel) => Promise<unknown>;

/**
 * RabbitMQ client built on amqp-connection-manager.
 *
 * - reconnects automatically and replays every registered setup (exchanges,
 *   queues, bindings) and consumer after a connection loss;
 * - publishes in confirm mode: `publish()`/`sendToQueue()` resolve only after
 *   the broker has confirmed the message;
 * - messages published while disconnected are queued in memory and sent after
 *   the connection is restored.
 */
export class RabbitMQClient {
  private connection: AmqpConnectionManager | null = null;
  private channelWrapper: ChannelWrapper | null = null;
  private currentChannel: Channel | null = null;
  private processingSetup = false;
  private readonly setups: ChannelSetup[] = [];

  constructor(private config: RabbitMQConfig) {
    this.config.reconnectAttempts = this.config.reconnectAttempts || 5;
    this.config.reconnectInterval = this.config.reconnectInterval || 5000;
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    const reconnectTimeInSeconds = Math.max(1, Math.round((this.config.reconnectInterval || 5000) / 1000));

    this.connection = connect([this.config.uri], { reconnectTimeInSeconds });

    this.connection.on('connect', () => logger.info('Connected to RabbitMQ'));
    this.connection.on('disconnect', ({ err }) => {
      this.currentChannel = null;
      logger.warn(`RabbitMQ connection closed: ${err?.message ?? 'unknown reason'}`);
    });
    this.connection.on('connectFailed', ({ err }) => logger.error('Failed to connect to RabbitMQ:', err));

    this.channelWrapper = this.connection.createChannel({
      name: 'shared-rabbitmq-client',
      json: false,
      // Runs on every (re)connect. Setups are replayed sequentially so that
      // assertions and bindings happen in the same order they were registered.
      setup: async (channel: Channel) => {
        this.currentChannel = channel;
        this.processingSetup = true;
        try {
          for (const setup of this.setups) {
            try {
              await setup(channel);
            } catch (error) {
              logger.error('RabbitMQ: setup registration failed', error);
            }
          }
        } finally {
          this.processingSetup = false;
        }
      },
    });

    // The ChannelWrapper typings promise an info object, but some runtime
    // paths emit 'error' with the error only (e.g. `this.emit('error', err)`
    // in consumer reconnects), so the context must stay optional to avoid an
    // unhandled TypeError inside the listener.
    this.channelWrapper.on('error', (error: Error, info?: { name?: string }) =>
      logger.error(`RabbitMQ channel error (${info?.name ?? 'unknown'}): ${error?.message ?? error}`),
    );
  }

  async disconnect(): Promise<void> {
    this.currentChannel = null;

    if (this.channelWrapper) {
      await this.channelWrapper.close();
      this.channelWrapper = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  async setupQueue(queue: string, options?: any): Promise<void> {
    await this.registerSetup((channel) => channel.assertQueue(queue, options));
  }

  async setupExchange(exchange: string, type: string, options?: any): Promise<void> {
    await this.registerSetup((channel) => channel.assertExchange(exchange, type, options));
  }

  async bindQueue(queue: string, exchange: string, pattern: string): Promise<void> {
    await this.registerSetup((channel) => channel.bindQueue(queue, exchange, pattern));
  }

  async publish(exchange: string, routingKey: string, content: any, options?: any): Promise<void> {
    const buffer = Buffer.from(JSON.stringify(content));
    await this.getWrapper().publish(exchange, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
      ...options,
    });
  }

  async sendToQueue(queue: string, content: any, options?: any): Promise<void> {
    const buffer = Buffer.from(JSON.stringify(content));
    await this.getWrapper().sendToQueue(queue, buffer, {
      persistent: true,
      contentType: 'application/json',
      ...options,
    });
  }

  async consume(
    queue: string,
    handler: (msg: ConsumeMessage | null) => Promise<void>,
    options?: { noAck?: boolean; prefetch?: number },
  ): Promise<string> {
    const { prefetch, noAck = false } = options ?? {};

    // ChannelWrapper re-establishes consumers on reconnect and re-applies prefetch.
    const { consumerTag } = await this.getWrapper().consume(queue, handler, {
      noAck,
      ...(typeof prefetch === 'number' ? { prefetch } : {}),
    });

    return consumerTag;
  }

  async ack(message: ConsumeMessage): Promise<void> {
    this.getWrapper().ack(message);
  }

  async nack(message: ConsumeMessage, requeue: boolean = true): Promise<void> {
    this.getWrapper().nack(message, false, requeue);
  }

  /** Cancels one consumer by tag; the channel stays open and in-flight messages remain unacknowledged. */
  async cancelConsumer(consumerTag: string): Promise<void> {
    await this.getWrapper().cancel(consumerTag);
  }

  private async registerSetup(setup: ChannelSetup): Promise<void> {
    this.setups.push(setup);

    // Apply the registration immediately when the broker is already connected
    // and no setup run is in flight; otherwise it is applied on the next connect.
    if (this.currentChannel && !this.processingSetup) {
      await setup(this.currentChannel);
    }
  }

  private getWrapper(): ChannelWrapper {
    if (!this.channelWrapper) {
      throw new AppError({
        message: 'RabbitMQ channel not initialized',
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
    }
    return this.channelWrapper;
  }
}
