import { describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';
import { OutboxMessageEntity } from '../src/models/entity/outboxMessage.entity';

const rabbit = createFakeRabbitMQClient();
const constructed: { uri?: string } = {};

// The clients plugin builds the real RabbitMQClient and connects it: in tests
// the class is swapped for the fake so no broker is needed. The constructor
// still records what it was given, so the uri parameter is checked.
mock.module('@shared/rabbitmq/src/rabbitmq.client', () => ({
  RabbitMQClient: class {
    constructor(options: { uri: string }) {
      constructed.uri = options.uri;
      return rabbit as unknown as object;
    }
  },
}));

const { OrderedPublisherService } = await import('../src/services/orderedPublisher.service');
const { createOrderedPublisherRepositoriesPlugin } = await import('../src/plugins/repositories.plugin');
const { createOrderedPublisherClientsPlugin } = await import('../src/plugins/clients.plugin');
const { createOrderedPublisherServicesPlugin } = await import('../src/plugins/services.plugin');
const { createOrderedPublisherDaemonsPlugin } = await import('../src/plugins/daemons.plugin');
const { createOrderedPublisherPlugin } = await import('../src/plugin');

const EXCHANGE = 'orders.events';
const RABBIT_URI = 'amqp://guest:guest@rabbitmq:5672';

/** The real outbox repository needs Mongo; the plugin tests only verify the wiring. */
function stubOutboxRepository(plugin: ReturnType<typeof createOrderedPublisherRepositoriesPlugin>) {
  const repository = plugin.decorator.outboxMessageRepository;
  repository.releaseSending = async () => {};
  repository.claimNext = async () => null;
}

describe('ordered publisher plugins (assembly in app.ts)', () => {
  it('connects rabbit and declares the exchange inside the clients layer', async () => {
    const repositoriesPlugin = createOrderedPublisherRepositoriesPlugin();
    stubOutboxRepository(repositoriesPlugin);
    expect(rabbit.connect).not.toHaveBeenCalled();

    const clientsPlugin = await createOrderedPublisherClientsPlugin(RABBIT_URI, EXCHANGE);

    expect(rabbit.connect).toHaveBeenCalled();
    expect(constructed.uri).toBe(RABBIT_URI);
    // the publisher side declares only the exchange — queues belong to the consumers
    expect(rabbit.setupExchange).toHaveBeenCalledWith(EXCHANGE, 'direct', { durable: true });
    expect(rabbit.setupQueue).not.toHaveBeenCalled();

    const servicesPlugin = createOrderedPublisherServicesPlugin(repositoriesPlugin, clientsPlugin, EXCHANGE);

    expect(servicesPlugin.decorator.orderedPublisher).toBeInstanceOf(OrderedPublisherService);

    const daemonsPlugin = await createOrderedPublisherDaemonsPlugin(servicesPlugin);

    expect(daemonsPlugin.decorator.orderedPublisherDaemon).toBeDefined();

    daemonsPlugin.decorator.orderedPublisherDaemon.stop();
  });

  it('disconnects on app stop (onStop hook)', async () => {
    const repositoriesPlugin = createOrderedPublisherRepositoriesPlugin();
    stubOutboxRepository(repositoriesPlugin);
    const clientsPlugin = await createOrderedPublisherClientsPlugin(RABBIT_URI, EXCHANGE);
    const servicesPlugin = createOrderedPublisherServicesPlugin(repositoriesPlugin, clientsPlugin, EXCHANGE);
    const daemonsPlugin = await createOrderedPublisherDaemonsPlugin(servicesPlugin);

    const app = new Elysia().use(daemonsPlugin);
    await app.listen(0); // a running server is required for the stop lifecycle to fire
    await app.stop();

    expect(rabbit.disconnect).toHaveBeenCalled();
  });

  it('stops the daemon on app stop (onStop hook)', async () => {
    const repositoriesPlugin = createOrderedPublisherRepositoriesPlugin();
    stubOutboxRepository(repositoriesPlugin);
    const clientsPlugin = await createOrderedPublisherClientsPlugin(RABBIT_URI, EXCHANGE);
    const servicesPlugin = createOrderedPublisherServicesPlugin(repositoriesPlugin, clientsPlugin, EXCHANGE);
    const daemonsPlugin = await createOrderedPublisherDaemonsPlugin(servicesPlugin);

    const daemon = daemonsPlugin.decorator.orderedPublisherDaemon;
    let stops = 0;
    const stop = daemon.stop.bind(daemon);
    daemon.stop = () => {
      stops += 1;
      stop();
    };

    const app = new Elysia().use(daemonsPlugin);
    await app.listen(0);
    await app.stop();

    expect(stops).toBe(1);
  });

  it('a failed connect is not swallowed', async () => {
    rabbit.connect.mockImplementationOnce(async () => {
      throw new Error('no broker');
    });

    await expect(createOrderedPublisherClientsPlugin(RABBIT_URI, EXCHANGE)).rejects.toThrow('no broker');
  });

  it('composite plugin: one line wires all the layers — the rabbit config lives inside', async () => {
    // The composite builds the real outbox repository: without Mongo the pass
    // would hang, so the two model calls the wiring touches are stubbed.
    const entity = OutboxMessageEntity as unknown as {
      updateMany: () => Promise<{ modifiedCount: number }>;
      findOneAndUpdate: () => { lean: () => Promise<null> };
    };
    entity.updateMany = async () => ({ modifiedCount: 0 });
    entity.findOneAndUpdate = () => ({ lean: async () => null });

    const plugin = await createOrderedPublisherPlugin(RABBIT_URI, EXCHANGE);

    expect(plugin.decorator.orderedPublisher).toBeInstanceOf(OrderedPublisherService);
    expect(plugin.decorator.orderedPublisherDaemon).toBeDefined();
    expect(rabbit.connect).toHaveBeenCalled();
    expect(rabbit.setupExchange).toHaveBeenCalledWith(EXCHANGE, 'direct', { durable: true });

    const app = new Elysia().use(plugin);
    await app.listen(0);
    await app.stop();
  });
});
