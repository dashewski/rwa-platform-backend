import { describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import type { RabbitMQClient as SharedRabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';

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

const { OrderedConsumerService } = await import('../src/services/orderedConsumer.service');
const { OrderedConsumerDaemon } = await import('../src/daemons/orderedConsumer.daemon');
const { createOrderedConsumerRepositoriesPlugin } = await import('../src/plugins/repositories.plugin');
const { createOrderedConsumerClientsPlugin } = await import('../src/plugins/clients.plugin');
const { createOrderedConsumerServicesPlugin } = await import('../src/plugins/services.plugin');
const { createOrderedConsumerPlugin } = await import('../src/plugin');

const RABBIT_URI = 'amqp://guest:***@rabbitmq:5672';
const EXCHANGE = 'orders.events';
const QUEUE = 'orders.stream';
const ROUTING_KEY = 'order.updated';

class TestDaemon extends OrderedConsumerDaemon {
  constructor(
    rabbitClient: SharedRabbitMQClient,
    consumerService: InstanceType<typeof OrderedConsumerService>,
  ) {
    super(rabbitClient, consumerService, EXCHANGE, { [ROUTING_KEY]: async () => {} });
  }
}

/** The real inbox repository needs Mongo; the plugin tests only verify the wiring. */
function stubProcessedRepository(plugin: ReturnType<typeof createOrderedConsumerRepositoriesPlugin>) {
  const repository = plugin.decorator.processedMessageRepository;
  repository.runOnce = async () => true;
}

describe('ordered consumer plugins (assembly in app.ts)', () => {
  it('connects rabbit and declares the exchange inside the clients layer', async () => {
    expect(rabbit.connect).not.toHaveBeenCalled();

    const clientsPlugin = await createOrderedConsumerClientsPlugin(RABBIT_URI, EXCHANGE);

    expect(constructed.uri).toBe(RABBIT_URI);
    expect(rabbit.connect).toHaveBeenCalled();
    expect(rabbit.setupExchange).toHaveBeenCalledWith(EXCHANGE, 'direct', { durable: true });
    // the queue and its bindings are the daemon's business, not the clients layer
    expect(rabbit.setupQueue).not.toHaveBeenCalled();
    expect(rabbit.bindQueue).not.toHaveBeenCalled();
    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();

    expect(clientsPlugin.decorator.rabbitMQClient).toBeDefined();
  });

  it('builds the service inside the services layer, without subscribing', async () => {
    const repositoriesPlugin = createOrderedConsumerRepositoriesPlugin();
    stubProcessedRepository(repositoriesPlugin);

    const servicesPlugin = createOrderedConsumerServicesPlugin(repositoriesPlugin, QUEUE);

    expect(servicesPlugin.decorator.orderedConsumer).toBeInstanceOf(OrderedConsumerService);
    expect(servicesPlugin.decorator.orderedConsumer.status().state).toBe('running');
    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();
  });

  it('the daemon declares the queue, binds its routing keys and starts the stream', async () => {
    const repositoriesPlugin = createOrderedConsumerRepositoriesPlugin();
    stubProcessedRepository(repositoriesPlugin);
    const clientsPlugin = await createOrderedConsumerClientsPlugin(RABBIT_URI, EXCHANGE);
    const servicesPlugin = createOrderedConsumerServicesPlugin(repositoriesPlugin, QUEUE);

    const daemon = new TestDaemon(
      clientsPlugin.decorator.rabbitMQClient as unknown as SharedRabbitMQClient,
      servicesPlugin.decorator.orderedConsumer,
    );
    await daemon.initialize();

    expect(rabbit.setupQueue).toHaveBeenCalledWith(QUEUE, { durable: true });
    expect(rabbit.bindQueue).toHaveBeenCalledWith(QUEUE, EXCHANGE, ROUTING_KEY);
    expect(rabbit.consume).toHaveBeenCalledWith(QUEUE, expect.any(Function), { prefetch: 1 });
    expect(rabbit.consumerFor(QUEUE)).toBeDefined();

    await daemon.stop();
  });

  it('disconnects the rabbit client on app stop (onStop hook)', async () => {
    const clientsPlugin = await createOrderedConsumerClientsPlugin(RABBIT_URI, EXCHANGE);

    const app = new Elysia().use(clientsPlugin);
    await app.listen(0); // a running server is required for the stop lifecycle to fire
    await app.stop();

    expect(rabbit.disconnect).toHaveBeenCalled();
  });

  it('a failed connect is not swallowed', async () => {
    rabbit.connect.mockImplementationOnce(async () => {
      throw new Error('no broker');
    });

    await expect(createOrderedConsumerClientsPlugin(RABBIT_URI, EXCHANGE)).rejects.toThrow('no broker');
  });

  it('composite plugin: one line wires the package layers — nothing subscribes without a daemon', async () => {
    const plugin = await createOrderedConsumerPlugin(RABBIT_URI, EXCHANGE, QUEUE);

    expect(plugin.decorator.orderedConsumer).toBeInstanceOf(OrderedConsumerService);
    expect(plugin.decorator.rabbitMQClient).toBeDefined();
    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();

    const app = new Elysia().use(plugin);
    await app.listen(0);
    await app.stop();

    expect(rabbit.disconnect).toHaveBeenCalled();
  });
});
