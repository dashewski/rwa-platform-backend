import { describe, expect, it } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { OrderedConsumerService } from '../src/services/orderedConsumer.service';
import type { ProcessedMessageRepository } from '../src/repositories/processedMessage.repository';
import { createFakeProcessedMessageRepository } from './fakes/processedMessage.repository.fake';

const QUEUE = 'orders.stream';

function message(messageId: string | undefined, payload: unknown = { seq: 1 }): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(payload)),
    ...(messageId === undefined ? {} : { properties: { messageId } }),
  } as unknown as ConsumeMessage;
}

function createConsumer(maxAttempts = 3) {
  const processed = createFakeProcessedMessageRepository();
  const consumer = new OrderedConsumerService(
    QUEUE,
    processed as unknown as ProcessedMessageRepository,
    maxAttempts,
    1, // initialDelayMs: the retry loop stays instant in tests
    2, // maxDelayMs
  );

  return { processed, consumer };
}

describe('OrderedConsumerService — positive', () => {
  it('applies the message once and acks it', async () => {
    let calls = 0;
    const { processed, consumer } = createConsumer();

    expect(
      await consumer.handle(message('msg-1'), async () => {
        calls += 1;
      }),
    ).toBe('acked');

    expect(calls).toBe(1);
    expect(processed.keys.has('msg-1')).toBe(true);
    expect(consumer.status()).toEqual({ queue: QUEUE, state: 'running' });
  });

  it('a duplicate delivery is skipped by the inbox and still acked', async () => {
    let calls = 0;
    const { processed, consumer } = createConsumer();
    const apply = async () => {
      calls += 1;
    };

    expect(await consumer.handle(message('msg-1'), apply)).toBe('acked');
    expect(await consumer.handle(message('msg-1'), apply)).toBe('acked');

    expect(calls).toBe(1);
    expect(processed.keys.size).toBe(1);
  });

  it('a transient failure is retried and then acked', async () => {
    let calls = 0;
    const { processed, consumer } = createConsumer();
    const apply = async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('transient failure');
      }
    };

    expect(await consumer.handle(message('msg-1'), apply)).toBe('acked');

    expect(calls).toBe(2);
    expect(processed.keys.has('msg-1')).toBe(true);
    expect(consumer.status().state).toBe('running');
  });

  it('a redelivered head message after a halt is processed again and acked', async () => {
    let broken = true;
    let calls = 0;
    const { consumer } = createConsumer();
    const apply = async () => {
      calls += 1;
      if (broken) {
        throw new Error('broken');
      }
    };

    expect(await consumer.handle(message('msg-1'), apply)).toBe('halted');
    expect(consumer.status().state).toBe('halted');

    broken = false;

    expect(await consumer.handle(message('msg-1'), apply)).toBe('acked');
    expect(calls).toBe(4); // three attempts in the halted cycle + the redelivery
    expect(consumer.status().state).toBe('running');
  });

  it('markProbed() brings a halted stream back to running', async () => {
    const { consumer } = createConsumer();

    await consumer.handle(message('msg-1'), async () => {
      throw new Error('broken');
    });
    expect(consumer.status().state).toBe('halted');

    consumer.markProbed();

    expect(consumer.status().state).toBe('running');
  });

  it('the inbox marker is written only after the handler succeeds', async () => {
    let calls = 0;
    const { processed, consumer } = createConsumer();

    await consumer.handle(message('msg-1'), async () => {
      calls += 1;
      throw new Error('broken');
    });

    expect(calls).toBe(3);
    expect(processed.keys.size).toBe(0);
  });
});

describe('OrderedConsumerService — negative', () => {
  it('halts after maxAttempts', async () => {
    let calls = 0;
    const { consumer } = createConsumer();

    expect(
      await consumer.handle(message('msg-1'), async () => {
        calls += 1;
        throw new Error('order #3 not found in orders');
      }),
    ).toBe('halted');

    expect(calls).toBe(3);
    expect(consumer.status().state).toBe('halted');
  });

  it('halts after a single attempt when maxAttempts is 1', async () => {
    let calls = 0;
    const { consumer } = createConsumer(1);

    expect(
      await consumer.handle(message('msg-1'), async () => {
        calls += 1;
        throw new Error('broken');
      }),
    ).toBe('halted');
    expect(calls).toBe(1);
  });

  it('a message without messageId cannot be deduplicated and halts the stream', async () => {
    let calls = 0;
    const { processed, consumer } = createConsumer();

    expect(
      await consumer.handle(message(undefined), async () => {
        calls += 1;
      }),
    ).toBe('halted');

    expect(calls).toBe(0); // the handler never ran
    expect(processed.runOnce).not.toHaveBeenCalled();
    expect(consumer.status().state).toBe('halted');
  });

  it('an inbox failure counts as a failed attempt', async () => {
    const { processed, consumer } = createConsumer();
    processed.runOnce.mockImplementation(async () => {
      throw new Error('mongo is down');
    });

    expect(await consumer.handle(message('msg-1'), async () => {})).toBe('halted');

    expect(processed.runOnce).toHaveBeenCalledTimes(3);
    expect(consumer.status().state).toBe('halted');
  });

  it('a non-Error rejection still halts the stream', async () => {
    const { consumer } = createConsumer();

    expect(
      await consumer.handle(message('msg-1'), async () => {
        throw 'boom';
      }),
    ).toBe('halted');
    expect(consumer.status().state).toBe('halted');
  });
});

describe('OrderedConsumerService — boundary', () => {
  it('an empty messageId is treated as missing and halts', async () => {
    let calls = 0;
    const { consumer } = createConsumer();

    expect(
      await consumer.handle(message(''), async () => {
        calls += 1;
      }),
    ).toBe('halted');
    expect(calls).toBe(0);
  });

  it('a very long messageId is accepted as the inbox key', async () => {
    const longId = 'x'.repeat(50_000);
    let calls = 0;
    const { processed, consumer } = createConsumer();

    expect(
      await consumer.handle(message(longId), async () => {
        calls += 1;
      }),
    ).toBe('acked');

    expect(calls).toBe(1);
    expect(processed.keys.has(longId)).toBe(true);
  });

  it('two messages with different messageIds both run', async () => {
    let calls = 0;
    const { consumer } = createConsumer();
    const apply = async () => {
      calls += 1;
    };

    expect(await consumer.handle(message('msg-1'), apply)).toBe('acked');
    expect(await consumer.handle(message('msg-2'), apply)).toBe('acked');

    expect(calls).toBe(2);
  });

  it('the service never parses the payload', async () => {
    let calls = 0;
    const { consumer } = createConsumer();

    const raw = { content: Buffer.from('not-json at all'), properties: { messageId: 'msg-1' } } as unknown as ConsumeMessage;

    expect(
      await consumer.handle(raw, async () => {
        calls += 1;
      }),
    ).toBe('acked');
    expect(calls).toBe(1);
  });
});
