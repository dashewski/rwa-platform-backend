import { describe, expect, it } from 'bun:test';
import type { RabbitMQClient as SharedRabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedPublisherService } from '../src/services/orderedPublisher.service';
import type { OutboxMessageRepository } from '../src/repositories/outboxMessage.repository';
import { createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';
import { createFakeOutboxMessageRepository } from './fakes/outboxMessage.repository.fake';

function createPublisher() {
  const rabbit = createFakeRabbitMQClient();
  const outbox = createFakeOutboxMessageRepository();
  const publisher = new OrderedPublisherService(
    rabbit as unknown as SharedRabbitMQClient,
    'orders.events',
    outbox as unknown as OutboxMessageRepository,
  );

  return { rabbit, outbox, publisher };
}

const seqs = (rabbit: ReturnType<typeof createFakeRabbitMQClient>) =>
  rabbit.publish.mock.calls.map((call: any[]) => call[2].seq);

const statuses = (outbox: ReturnType<typeof createFakeOutboxMessageRepository>) =>
  outbox.messages.map((doc) => doc.status);

describe('OrderedPublisherService — positive', () => {
  it('publish() only records the message — nothing reaches the broker without the pass', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    await publisher.publish('order.created', { seq: 1 }, 'chain-1');

    expect(outbox.messages[0]?.status).toBe('pending');
    expect(outbox.messages[0]?.messageId).toBe('chain-1');
    expect(rabbit.publish).not.toHaveBeenCalled();

    await publisher.processOutbox();

    expect(outbox.messages[0]?.status).toBe('sent');
    expect(rabbit.publish).toHaveBeenCalledTimes(1);
    expect(rabbit.publish).toHaveBeenCalledWith('orders.events', 'order.created', { seq: 1 }, {
      messageId: 'chain-1',
    });
  });

  it('sends the whole pending outbox in one pass, strictly in order', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await publisher.publish('order.created', { seq: 2 }, 'msg-2');
    await publisher.publish('order.updated', { seq: 3 }, 'msg-3');

    await publisher.processOutbox();

    expect(seqs(rabbit)).toEqual([1, 2, 3]);
    expect(rabbit.publish.mock.calls.map((call: any[]) => call[3].messageId)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    expect(outbox.messages.every((doc) => doc.status === 'sent')).toBe(true);
  });

  it('returns the leftovers of a dead pass before every pass', async () => {
    const { outbox, publisher } = createPublisher();

    await publisher.processOutbox();

    expect(outbox.releaseSending).toHaveBeenCalled();
  });

  it('a second pass does not touch what is already sent', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await publisher.processOutbox();
    await publisher.processOutbox();

    expect(rabbit.publish).toHaveBeenCalledTimes(1);
    expect(outbox.messages[0]?.status).toBe('sent');
  });

  it('an empty outbox costs one claim and nothing else', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    await publisher.processOutbox();

    expect(outbox.claimNext).toHaveBeenCalledTimes(1);
    expect(rabbit.publish).not.toHaveBeenCalled();
  });

  it('a batch of 500 goes out in one pass, in order', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    for (let i = 1; i <= 500; i += 1) {
      await publisher.publish('order.created', { seq: i }, `msg-${i}`);
    }
    await publisher.processOutbox();

    expect(rabbit.publish).toHaveBeenCalledTimes(500);
    expect(seqs(rabbit)).toEqual(Array.from({ length: 500 }, (_value, index) => index + 1));
    expect(outbox.messages.every((doc) => doc.status === 'sent')).toBe(true);
  });

  it('payload passes through as is: null, empty object, a large body', async () => {
    const { rabbit, publisher } = createPublisher();
    const large = { rows: Array.from({ length: 1000 }, (_value, index) => index) };

    await publisher.publish('a.events', null, 'msg-1');
    await publisher.publish('b.events', {}, 'msg-2');
    await publisher.publish('c.events', large, 'msg-3');

    await publisher.processOutbox();

    expect(rabbit.publish.mock.calls.map((call: any[]) => call[2])).toEqual([null, {}, large]);
  });

  it('messageId goes as is: an empty string and a very long one', async () => {
    const { rabbit, publisher } = createPublisher();
    const long = 'x'.repeat(50_000);

    await publisher.publish('a.events', { seq: 1 }, '');
    await publisher.publish('b.events', { seq: 2 }, long);

    await publisher.processOutbox();

    expect(rabbit.publish.mock.calls.map((call: any[]) => call[3].messageId)).toEqual(['', long]);
  });

  it('two messages with the same messageId both go out', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    await publisher.publish('a.events', { seq: 1 }, 'same-id');
    await publisher.publish('b.events', { seq: 2 }, 'same-id');

    await publisher.processOutbox();

    expect(rabbit.publish).toHaveBeenCalledTimes(2);
    expect(statuses(outbox)).toEqual(['sent', 'sent']);
  });

  it('a batch that is already sent costs one claim and no publishes', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    await publisher.publish('a.events', { seq: 1 }, 'msg-1');
    outbox.messages[0].status = 'sent';

    await publisher.processOutbox();

    expect(outbox.claimNext).toHaveBeenCalledTimes(1);
    expect(rabbit.publish).not.toHaveBeenCalled();
  });

  it('leftovers of a dead pass come back and go out first', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    await publisher.publish('a.events', { seq: 1 }, 'msg-1');
    await publisher.publish('b.events', { seq: 2 }, 'msg-2');
    outbox.messages[0].status = 'sending'; // the process died between claim and markSent

    await publisher.processOutbox();

    expect(seqs(rabbit)).toEqual([1, 2]);
    expect(statuses(outbox)).toEqual(['sent', 'sent']);
  });
});

describe('OrderedPublisherService — negative', () => {
  it('publish() rejects when the record cannot be stored', async () => {
    const { outbox, publisher } = createPublisher();
    outbox.create.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });

    await expect(publisher.publish('a.events', { seq: 1 }, 'msg-1')).rejects.toThrow('mongo is down');
  });

  it('a failed send puts the message back to pending and the next pass retries it', async () => {
    const { rabbit, outbox, publisher } = createPublisher();
    rabbit.publish.mockImplementationOnce(async () => {
      throw new Error('rabbit is down');
    });

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await publisher.processOutbox();

    expect(outbox.release).toHaveBeenCalledTimes(1);
    expect(outbox.messages[0]?.status).toBe('pending');

    await publisher.processOutbox();

    expect(outbox.messages[0]?.status).toBe('sent');
    expect(rabbit.publish).toHaveBeenCalledTimes(2);
  });

  it('the failed message stays first — the ones behind it do not overtake it', async () => {
    const { rabbit, outbox, publisher } = createPublisher();
    rabbit.publish.mockImplementationOnce(async () => {
      throw new Error('rabbit is down');
    });

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await publisher.publish('order.created', { seq: 2 }, 'msg-2');
    await publisher.processOutbox();

    expect(statuses(outbox)).toEqual(['pending', 'pending']);
    expect(rabbit.publish).toHaveBeenCalledTimes(1);

    await publisher.processOutbox();

    expect(seqs(rabbit)).toEqual([1, 1, 2]);
    expect(statuses(outbox)).toEqual(['sent', 'sent']);
  });

  it('a failed claim does not break the pass', async () => {
    const { rabbit, outbox, publisher } = createPublisher();
    outbox.claimNext.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await publisher.processOutbox();

    expect(outbox.messages[0]?.status).toBe('pending');
    expect(rabbit.publish).not.toHaveBeenCalled();

    await publisher.processOutbox();

    expect(outbox.messages[0]?.status).toBe('sent');
  });

  it('a failed release is swallowed: the pass ends cleanly and the next pass recovers the record', async () => {
    const { rabbit, outbox, publisher } = createPublisher();
    rabbit.publish.mockImplementationOnce(async () => {
      throw new Error('rabbit is down');
    });
    outbox.release.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');

    await publisher.processOutbox(); // must resolve, not reject

    expect(outbox.messages[0]?.status).toBe('sending');

    await publisher.processOutbox();

    expect(outbox.messages[0]?.status).toBe('sent');
    expect(rabbit.publish).toHaveBeenCalledTimes(2);
  });

  it('markSent failing after a successful send means the message goes out again', async () => {
    const { rabbit, outbox, publisher } = createPublisher();
    outbox.markSent.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await publisher.processOutbox();

    expect(rabbit.publish).toHaveBeenCalledTimes(1);
    expect(outbox.messages[0]?.status).toBe('pending');

    await publisher.processOutbox();

    expect(rabbit.publish).toHaveBeenCalledTimes(2);
    expect(outbox.messages[0]?.status).toBe('sent');
  });

  it('a failed releaseSending aborts the pass and is not swallowed', async () => {
    const { outbox, publisher } = createPublisher();
    outbox.releaseSending.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');

    await expect(publisher.processOutbox()).rejects.toThrow('mongo is down');
    expect(outbox.messages[0]?.status).toBe('pending');
  });

  it('a crash in the middle of a batch: everything behind the failed one waits, then all go in order', async () => {
    const { rabbit, outbox, publisher } = createPublisher();
    let calls = 0;
    rabbit.publish.mockImplementation(async () => {
      calls += 1;
      if (calls === 3) {
        throw new Error('rabbit is down');
      }
    });

    for (let i = 1; i <= 5; i += 1) {
      await publisher.publish('order.created', { seq: i }, `msg-${i}`);
    }

    await publisher.processOutbox();

    expect(statuses(outbox)).toEqual(['sent', 'sent', 'pending', 'pending', 'pending']);

    await publisher.processOutbox();

    expect(statuses(outbox)).toEqual(['sent', 'sent', 'sent', 'sent', 'sent']);
    expect(seqs(rabbit)).toEqual([1, 2, 3, 3, 4, 5]);
  });

  it('several leftovers of a dead pass all come back, in order', async () => {
    const { rabbit, outbox, publisher } = createPublisher();

    for (let i = 1; i <= 3; i += 1) {
      await publisher.publish('order.created', { seq: i }, `msg-${i}`);
    }
    outbox.messages[0].status = 'sending';
    outbox.messages[1].status = 'sending';

    await publisher.processOutbox();

    expect(seqs(rabbit)).toEqual([1, 2, 3]);
    expect(statuses(outbox)).toEqual(['sent', 'sent', 'sent']);
  });
});
