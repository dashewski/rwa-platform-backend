/**
 * Harness for the protocol scenarios.
 *
 * A scenario runs the real service classes (real daemons, real inbox service,
 * real outbox service, real business services where they are cheap) over the
 * real broker and the real Mongo replica set, but on copies of the topology
 * whose names are prefixed per run:
 *
 *   blockchain.events            -> it.<run>.blockchain.events
 *   blockchain.events.rwa        -> it.<run>.blockchain.events.rwa
 *   blockchain.events.rwa.retry  -> it.<run>.blockchain.events.rwa.retry
 *
 * Types, options, routing keys, retry/park policies and prefetch values are
 * taken verbatim from the service client (its `getTopologyDefinition()`), so a
 * scenario exercises the routing table of the real code without ever touching
 * the queues of the running stack.
 */
import type { ConsumeMessage, Options } from 'amqplib';
import mongoose from 'mongoose';
import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import { InboxConsumerService } from '@shared/inbox-consumer/src/services/inboxConsumer.service';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer/src/repositories/inboxConsumerMessage.repository';
import { InboxConsumerMessageEntity } from '@shared/inbox-consumer/src/models/entity/inboxConsumerMessage.entity';

export const RABBIT_USER = process.env.RABBITMQ_DEFAULT_USER;
export const RABBIT_PASSWORD = process.env.RABBITMQ_PASSWORD;
export const RABBIT_HOST = process.env.RABBITMQ_HOST ?? '127.0.0.1';
export const RABBIT_PORT = process.env.RABBITMQ_PORT ?? '5672';
export const MONGO_HOST = process.env.MONGODB_HOST ?? '127.0.0.1';

if (!RABBIT_USER || !RABBIT_PASSWORD) {
  throw new Error(
    'RABBITMQ_DEFAULT_USER / RABBITMQ_PASSWORD are not set — run the scenario with ' +
      'bun --env-file=infrastructure/docker/.env test <file>',
  );
}

export const RABBIT_URI = `amqp://${encodeURIComponent(RABBIT_USER)}:${encodeURIComponent(
  RABBIT_PASSWORD,
)}@${RABBIT_HOST}:${RABBIT_PORT}`;
export const MONGO_URI = `mongodb://${MONGO_HOST}:27017`;

export function scenarioPrefix(name: string): string {
  return `it.scn.${name}.${process.pid}.${Date.now()}`;
}

export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`waitFor: the condition was not met within ${timeoutMs}ms`);
    await Bun.sleep(25);
  }
}

type RealTopology = ReturnType<BaseRabbitMQClient['getTopologyDefinition']>;

function scopeName(prefix: string, name: string): string {
  return `${prefix}.${name}`;
}

/** Clones a topology under a prefix: exchange names, queue names and bindings. */
export function scopeTopology(topology: RealTopology, prefix: string): RealTopology {
  const exchanges = Object.fromEntries(
    Object.entries(topology.exchanges).map(([exchange, definition]) => [
      scopeName(prefix, exchange),
      definition,
    ]),
  );

  const queues = Object.fromEntries(
    Object.entries(topology.queues).map(([queue, definition]) => [
      scopeName(prefix, queue),
      {
        ...definition,
        bindings: Object.fromEntries(
          Object.entries(definition.bindings).map(([exchange, routingKeys]) => [
            scopeName(prefix, exchange),
            routingKeys,
          ]),
        ),
      },
    ]),
  );

  return { exchanges, queues } as RealTopology;
}

/**
 * The real client, but every name it declares, publishes to, consumes from or
 * parks into is prefixed. Service-level code keeps using the production names,
 * so nothing in the services knows it runs against a sandbox topology.
 */
export class ScopedClient extends BaseRabbitMQClient {
  private readonly scoped: RealTopology;

  constructor(
    channelName: string,
    private readonly prefix: string,
    realTopology: RealTopology,
  ) {
    super(RABBIT_URI, channelName, 200);
    this.scoped = scopeTopology(realTopology, prefix);
  }

  getTopologyDefinition(): RealTopology {
    return this.scoped;
  }

  /** Service code asks about the production name; the sandbox has it under the prefix. */
  isExchangeRegistered(exchange: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.scoped.exchanges, this.exchangeName(exchange));
  }

  override async publish(
    exchange: string,
    routingKey: string,
    content: unknown,
    options?: Options.Publish,
  ): Promise<void> {
    return super.publish(this.exchangeName(exchange), routingKey, content, options);
  }

  override async consume(
    queue: string,
    handler: (message: ConsumeMessage | null) => Promise<void>,
    options?: { noAck?: boolean; prefetch?: number },
  ): Promise<string> {
    /**
     * The broker writes the *sandbox* queue names into `x-death`, while the
     * daemon compares them with the production name it subscribed to (that is
     * how it counts retry cycles). Strip the prefix on delivery so the sandbox
     * behaves exactly like the real topology.
     */
    const deprefix = (message: any): void => {
      const deaths = message?.properties?.headers?.['x-death'];
      if (!Array.isArray(deaths)) return;

      const prefixDot = `${this.prefix}.`;

      for (const entry of deaths) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

        for (const key of ['queue', 'exchange']) {
          const value = entry[key];
          if (typeof value === 'string' && value.startsWith(prefixDot)) entry[key] = value.slice(prefixDot.length);
        }
      }
    };

    const wrapped = async (message: ConsumeMessage | null): Promise<void> => {
      deprefix(message);
      await handler(message);
    };

    return super.consume(this.queueName(queue), wrapped, options);
  }

  override async park(queue: string, content: unknown, options?: Options.Publish): Promise<void> {
    return super.park(this.queueName(queue), content, options);
  }

  getQueueDeferAfterAttempts(queue: string): number {
    return this.scoped.queues[this.queueName(queue)]?.deferAfterAttempts;
  }

  getQueueParkAfterCycles(queue: string): number {
    return this.scoped.queues[this.queueName(queue)]?.parkAfterCycles;
  }

  queueName(queue: string): string {
    return scopeName(this.prefix, queue);
  }

  exchangeName(exchange: string): string {
    // the default exchange is not a name, it must never be prefixed
    return exchange === '' ? '' : scopeName(this.prefix, exchange);
  }
}

export type Recorder = {
  calls: Array<{ method: string; args: any[] }>;
  callsOf(method: string): any[][];
  reset(): void;
};

/**
 * Catch-all double for a service the daemon dispatches into: records the call
 * and resolves. Business behaviour is out of scope for a protocol scenario and
 * is covered by the unit tests of the service itself.
 */
export function recorder(): Recorder & Record<string, any> {
  const calls: Array<{ method: string; args: any[] }> = [];

  const target = {
    calls,
    callsOf(method: string) {
      return calls.filter((call) => call.method === method).map((call) => call.args);
    },
    reset() {
      calls.length = 0;
    },
  };

  return new Proxy(target, {
    get(object, property) {
      if (property in object) return (object as Record<string, any>)[property as string];
      if (property === 'then') return undefined;

      return async (...args: any[]) => {
        calls.push({ method: String(property), args });

        const commitInbox = args.find((argument) => typeof argument === 'function');
        if (commitInbox) await commitInbox();
      };
    },
  }) as Recorder & Record<string, any>;
}

/**
 * One inbox service per consumer, each with its own marker collection.
 *
 * In production every service has its own MONGODB_DBNAME, so two services that
 * receive the same event (rwa and charts both consume Pool_ReservesUpdated) keep
 * separate markers, and the three signers each keep their own marker for the
 * same taskId. A single shared collection in the sandbox would silently turn the
 * second delivery into a "duplicate" and hide the bug the scenario looks for.
 */
export function createInboxService(name: string): InboxConsumerService {
  const modelName = `InboxConsumerMessage_${name}`;
  const collectionName = `inbox_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

  const model =
    mongoose.models[modelName] ??
    mongoose.model(modelName, InboxConsumerMessageEntity.schema, collectionName);

  return new InboxConsumerService(new InboxConsumerMessageRepository(model as never));
}

/** The marker model of a consumer created by createInboxService(), for assertions. */
export function inboxModel(name: string) {
  return mongoose.models[`InboxConsumerMessage_${name}`];
}

/** Fresh database per scenario: dropped on connect, dropped on disconnect. */
export async function connectMongo(database: string): Promise<void> {
  await mongoose.connect(`${MONGO_URI}/${database}?directConnection=true`);
  await mongoose.connection.dropDatabase();
}

export async function dropMongo(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

/** Declares everything the scenario wrote and removes it; never touches real names. */
export async function deleteScopedTopology(
  prefix: string,
  topology: RealTopology,
  channel: { deleteQueue: (queue: string) => Promise<unknown>; deleteExchange: (exchange: string) => Promise<unknown> },
): Promise<void> {
  const scoped = scopeTopology(topology, prefix);

  for (const queue of Object.keys(scoped.queues)) {
    // the client synthesises the retry/parked companions from the queue name
    await channel.deleteQueue(`${queue}.retry`).catch(() => undefined);
    await channel.deleteQueue(`${queue}.parked`).catch(() => undefined);
    await channel.deleteQueue(queue).catch(() => undefined);
  }

  for (const exchange of Object.keys(scoped.exchanges)) {
    // allowUnrouted makes the base client declare <exchange>.unrouted (fanout + queue)
    await channel.deleteQueue(`${exchange}.unrouted`).catch(() => undefined);
    await channel.deleteExchange(`${exchange}.unrouted`).catch(() => undefined);
    await channel.deleteExchange(exchange).catch(() => undefined);
  }
}
