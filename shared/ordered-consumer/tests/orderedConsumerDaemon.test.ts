import { describe, expect, it } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import type { RabbitMQClient as SharedRabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedConsumerService } from '../src/services/orderedConsumer.service';
import { OrderedConsumerDaemon } from '../src/daemons/orderedConsumer.daemon';
import type { ProcessedMessageRepository } from '../src/repositories/processedMessage.repository';
import { createFakeRabbitMQClient, type FakeConsumeMessage } from './fakes/rabbitmq.client.fake';
import { createFakeProcessedMessageRepository } from './fakes/processedMessage.repository.fake';

const QUEUE = 'orders.stream';
const EXCHANGE = 'orders.events';
const EVENT_NAME = 'order.updated';

async function waitFor(check: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function message(messageId: string, payload: Record<string, unknown> = { seq: 1 }): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify({ name: EVENT_NAME, ...payload })),
    properties: { messageId },
  } as unknown as ConsumeMessage;
}

class TestDaemon extends OrderedConsumerDaemon {
  handler: (event: any) => Promise<void> = async () => {};

  constructor(
    rabbitClient: SharedRabbitMQClient,
    consumerService: OrderedConsumerService,
    probeIntervalMs = 60_000,
  ) {
    super(
      rabbitClient,
      consumerService,
      EXCHANGE,
      { [EVENT_NAME]: (event: any) => this.handler(event) },
      probeIntervalMs,
    );
  }
}

function createDaemon(handler: (event: any) => Promise<void>, probeIntervalMs = 60_000) {
  const rabbit = createFakeRabbitMQClient();
  const processed = createFakeProcessedMessageRepository();
  const consumer = new OrderedConsumerService(
    QUEUE,
    processed as unknown as ProcessedMessageRepository,
    3,
    1,
    2,
  );
  const daemon = new TestDaemon(
    rabbit as unknown as SharedRabbitMQClient,
    consumer,
    probeIntervalMs,
  );
  daemon.handler = handler;

  return { rabbit, processed, consumer, daemon };
}

const deliver = async (rabbit: ReturnType<typeof createFakeRabbitMQClient>, msg: ConsumeMessage) => {
  const handler = rabbit.consumerFor(QUEUE)!;
  await handler(msg as unknown as FakeConsumeMessage);
};

describe('OrderedConsumerDaemon — positive', () => {
  it('declares the queue and the bindings from the routing, then subscribes with prefetch 1', async () => {
    const { rabbit, consumer, daemon } = createDaemon(async () => {});
    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();

    await daemon.initialize();

    expect(rabbit.setupQueue).toHaveBeenCalledWith(QUEUE, { durable: true });
    expect(rabbit.bindQueue).toHaveBeenCalledWith(QUEUE, EXCHANGE, EVENT_NAME);
    expect(rabbit.consume).toHaveBeenCalledWith(QUEUE, expect.any(Function), { prefetch: 1 });
    expect(rabbit.consumerFor(QUEUE)).toBeDefined();
    expect(consumer.status().state).toBe('running');
  });

  it('acks what the routing applied and never nacks it', async () => {
    let calls = 0;
    const { rabbit, daemon } = createDaemon(async () => {
      calls += 1;
    });
    await daemon.initialize();

    await deliver(rabbit, message('msg-1'));

    expect(calls).toBe(1);
    expect(rabbit.ack).toHaveBeenCalledTimes(1);
    expect(rabbit.nack).not.toHaveBeenCalled();
  });

  it('an unknown event name is skipped without touching the routing handler', async () => {
    let calls = 0;
    const { rabbit, daemon } = createDaemon(async () => {
      calls += 1;
    });
    await daemon.initialize();

    const unknown = {
      content: Buffer.from(JSON.stringify({ name: 'Unknown_Event', seq: 1 })),
      properties: { messageId: 'msg-1' },
    } as unknown as ConsumeMessage;

    await deliver(rabbit, unknown);

    expect(calls).toBe(0);
    expect(rabbit.ack).toHaveBeenCalledTimes(1); // dropped, not retried
    expect(rabbit.nack).not.toHaveBeenCalled();
  });

  it('ignores an empty delivery (the broker cancelled the consumer)', async () => {
    let calls = 0;
    const { rabbit, daemon } = createDaemon(async () => {
      calls += 1;
    });
    await daemon.initialize();

    const handler = rabbit.consumerFor(QUEUE)!;
    await handler(null);

    expect(calls).toBe(0);
    expect(rabbit.ack).not.toHaveBeenCalled();
    expect(rabbit.nack).not.toHaveBeenCalled();
  });

  it('delivers strictly one at a time, in order', async () => {
    const seen: number[] = [];
    let active = 0;
    let maxActive = 0;
    const { rabbit, daemon } = createDaemon(async (event) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      seen.push(event.seq as number);
      active -= 1;
    });
    await daemon.initialize();

    const handler = rabbit.consumerFor(QUEUE)!;
    await Promise.all([
      handler(message('msg-1', { seq: 1 }) as unknown as FakeConsumeMessage),
      handler(message('msg-2', { seq: 2 }) as unknown as FakeConsumeMessage),
      handler(message('msg-3', { seq: 3 }) as unknown as FakeConsumeMessage),
    ]);

    expect(seen).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
  });

  it('after a halt the daemon resubscribes on its own after probeIntervalMs', async () => {
    let broken = true;
    const { rabbit, consumer, daemon } = createDaemon(async () => {
      if (broken) {
        throw new Error('broken');
      }
    }, 5);
    await daemon.initialize();

    await deliver(rabbit, message('msg-1'));
    expect(consumer.status().state).toBe('halted');
    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();

    await waitFor(() => rabbit.consumerFor(QUEUE) !== undefined); // the probe timer resubscribed us
    expect(consumer.status().state).toBe('running');

    broken = false;
    await deliver(rabbit, message('msg-1')); // the broker redelivers the head message

    expect(rabbit.ack).toHaveBeenCalledTimes(1);
    expect(consumer.status().state).toBe('running');

    await daemon.stop();
  });

  it('a running stream is never probed', async () => {
    const { rabbit, daemon } = createDaemon(async () => {}, 5);
    await daemon.initialize();

    await deliver(rabbit, message('msg-1'));
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(rabbit.consume).toHaveBeenCalledTimes(1); // only the initial subscription

    await daemon.stop();
  });

  it('stop() unsubscribes', async () => {
    const { rabbit, daemon } = createDaemon(async () => {});
    await daemon.initialize();

    await daemon.stop();

    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();
    expect(rabbit.cancelConsumer).toHaveBeenCalledTimes(1);
  });
});

describe('OrderedConsumerDaemon — negative', () => {
  it('on halt: unsubscribes and requeues the failed message', async () => {
    let calls = 0;
    const { rabbit, consumer, daemon } = createDaemon(async () => {
      calls += 1;
      throw new Error('order #3 not found in orders');
    });
    await daemon.initialize();

    await deliver(rabbit, message('msg-1'));

    expect(calls).toBe(3);
    expect(rabbit.ack).not.toHaveBeenCalled();
    expect(rabbit.nack).toHaveBeenCalledTimes(1);
    expect(rabbit.nack.mock.calls[0][1]).toBe(true); // requeue: the message goes back to the head
    expect(rabbit.cancelConsumer).toHaveBeenCalledTimes(1);
    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();
    expect(consumer.status().state).toBe('halted');

    await daemon.stop();
  });

  it('an invalid payload halts the stream instead of being acked', async () => {
    const { rabbit, consumer, daemon } = createDaemon(async () => {});
    await daemon.initialize();

    const invalid = {
      content: Buffer.from('not-json'),
      properties: { messageId: 'msg-1' },
    } as unknown as ConsumeMessage;

    await deliver(rabbit, invalid);

    expect(rabbit.ack).not.toHaveBeenCalled();
    expect(rabbit.nack).toHaveBeenCalledTimes(1); // requeued for the retry cycle
    expect(consumer.status().state).toBe('halted');

    await daemon.stop();
  });

  it('a failing release does not crash the daemon', async () => {
    const { rabbit, consumer, daemon } = createDaemon(async () => {
      throw new Error('broken');
    });
    await daemon.initialize();

    rabbit.cancelConsumer.mockImplementationOnce(async () => {
      throw new Error('broker is down');
    });

    await deliver(rabbit, message('msg-1'));

    expect(rabbit.nack).not.toHaveBeenCalled();
    expect(consumer.status().state).toBe('halted');

    await daemon.stop();
  });

  it('the probe still brings the stream back when the release failed', async () => {
    let broken = true;
    const { rabbit, consumer, daemon } = createDaemon(async () => {
      if (broken) {
        throw new Error('broken');
      }
    }, 5);
    await daemon.initialize();

    rabbit.cancelConsumer.mockImplementationOnce(async () => {
      throw new Error('broker is down');
    });

    await deliver(rabbit, message('msg-1')); // halt, but the release failed (no nack)
    expect(consumer.status().state).toBe('halted');
    expect(rabbit.nack).not.toHaveBeenCalled();

    await waitFor(() => consumer.status().state === 'running'); // the probe brought the stream back

    broken = false;
    await deliver(rabbit, message('msg-1'));

    expect(rabbit.ack).toHaveBeenCalledTimes(1);

    await daemon.stop();
  });

  it('a failed probe retries on the next interval', async () => {
    const { rabbit, consumer, daemon } = createDaemon(async () => {
      throw new Error('broken');
    }, 5);
    await daemon.initialize();

    await deliver(rabbit, message('msg-1')); // halt
    expect(consumer.status().state).toBe('halted');

    rabbit.consume.mockImplementationOnce(async () => {
      throw new Error('broker is down');
    });

    await waitFor(() => rabbit.consume.mock.calls.length >= 2); // the first probe fired and failed
    expect(consumer.status().state).toBe('halted');
    expect(rabbit.consumerFor(QUEUE)).toBeUndefined();

    await waitFor(() => rabbit.consumerFor(QUEUE) !== undefined); // the next probe resubscribed
    expect(consumer.status().state).toBe('running');

    await daemon.stop();
  });
});

describe('OrderedConsumerDaemon — boundary', () => {
  it('stop() clears the probe timer', async () => {
    const { rabbit, daemon } = createDaemon(async () => {
      throw new Error('broken');
    }, 5);
    await daemon.initialize();

    await deliver(rabbit, message('msg-1')); // halt — the probe timer is armed
    await daemon.stop();

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(rabbit.consumerFor(QUEUE)).toBeUndefined(); // the timer was cleared
  });

  it('a failing ack does not break the following deliveries', async () => {
    let calls = 0;
    const { rabbit, daemon } = createDaemon(async () => {
      calls += 1;
    });
    await daemon.initialize();

    rabbit.ack.mockImplementationOnce(async () => {
      throw new Error('broker is down');
    });

    await deliver(rabbit, message('msg-1')).catch(() => undefined);
    await deliver(rabbit, message('msg-2'));

    expect(calls).toBe(2);
    expect(rabbit.ack).toHaveBeenCalledTimes(2);
  });

  it('stop() twice and stop() without initialize() do not throw', async () => {
    const { daemon } = createDaemon(async () => {});

    await daemon.stop();
    await daemon.stop();
    await daemon.initialize();
    await daemon.stop();
  });
});
