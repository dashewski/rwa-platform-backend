import { describe, expect, it } from 'bun:test';
import type { RabbitMQClient as SharedRabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedPublisherService } from '../src/services/orderedPublisher.service';
import { OrderedPublisherDaemon } from '../src/daemons/orderedPublisher.daemon';
import type { OutboxMessageRepository } from '../src/repositories/outboxMessage.repository';
import { createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';
import { createFakeOutboxMessageRepository } from './fakes/outboxMessage.repository.fake';

async function waitFor(check: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createDaemon(pollIntervalMs = 10) {
  const rabbit = createFakeRabbitMQClient();
  const outbox = createFakeOutboxMessageRepository();
  const publisher = new OrderedPublisherService(
    rabbit as unknown as SharedRabbitMQClient,
    'orders.events',
    outbox as unknown as OutboxMessageRepository,
  );
  const daemon = new OrderedPublisherDaemon(publisher, pollIntervalMs);

  return { rabbit, outbox, publisher, daemon };
}

describe('OrderedPublisherDaemon', () => {
  it('drains what is already pending on the first pass', async () => {
    const { outbox, publisher, daemon } = createDaemon();
    await publisher.publish('order.created', { seq: 1 }, 'msg-1');

    daemon.initialize();

    await waitFor(() => outbox.messages[0]?.status === 'sent');

    daemon.stop();
  });

  it('picks up messages recorded later on the next pass', async () => {
    const { rabbit, outbox, publisher, daemon } = createDaemon();
    daemon.initialize();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    expect(rabbit.publish).not.toHaveBeenCalled();

    await waitFor(() => outbox.messages[0]?.status === 'sent');
    expect(rabbit.publish).toHaveBeenCalledTimes(1);

    daemon.stop();
  });

  it('keeps passing after a failed one', async () => {
    const { rabbit, outbox, publisher, daemon } = createDaemon();
    rabbit.publish.mockImplementationOnce(async () => {
      throw new Error('rabbit is down');
    });
    daemon.initialize();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');

    await waitFor(() => outbox.messages[0]?.status === 'sent');
    expect(rabbit.publish.mock.calls.length).toBeGreaterThanOrEqual(2);

    daemon.stop();
  });

  it('a pass that throws does not kill the daemon', async () => {
    const { rabbit, outbox, publisher, daemon } = createDaemon();
    outbox.releaseSending.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });
    daemon.initialize();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');

    await waitFor(() => outbox.messages[0]?.status === 'sent');
    expect(rabbit.publish).toHaveBeenCalledTimes(1);

    daemon.stop();
  });

  it('passes never overlap even when a pass outlives the interval', async () => {
    const { rabbit, outbox, publisher, daemon } = createDaemon(5);
    let active = 0;
    let maxActive = 0;
    rabbit.publish.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
    });

    for (let i = 1; i <= 6; i += 1) {
      await publisher.publish('order.created', { seq: i }, `msg-${i}`);
    }

    daemon.initialize();

    await waitFor(() => outbox.messages.every((doc) => doc.status === 'sent'), 2000);

    expect(maxActive).toBe(1); // one pass lives ~150ms while the interval is 5ms — yet never two at once
    expect(rabbit.publish).toHaveBeenCalledTimes(6);

    daemon.stop();
  });

  it('initialize() after stop() starts the passing again', async () => {
    const { rabbit, outbox, publisher, daemon } = createDaemon();
    daemon.initialize();
    daemon.stop();
    daemon.initialize();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await waitFor(() => outbox.messages[0]?.status === 'sent');

    expect(rabbit.publish).toHaveBeenCalledTimes(1);

    daemon.stop();
  });

  it('pollIntervalMs of 1ms: an empty pass does not get stuck and picks the next message at once', async () => {
    const { outbox, publisher, daemon } = createDaemon(1);
    daemon.initialize();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');

    await waitFor(() => outbox.messages[0]?.status === 'sent', 300);

    daemon.stop();
  });

  it('a message recorded between passes goes out within one interval', async () => {
    const { outbox, publisher, daemon } = createDaemon(20);
    daemon.initialize();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');

    await waitFor(() => outbox.messages[0]?.status === 'sent', 300);

    daemon.stop();
  });

  it('stop() ends the interval — nothing is sent after it', async () => {
    const { rabbit, outbox, publisher, daemon } = createDaemon();
    daemon.initialize();
    daemon.stop();

    await publisher.publish('order.created', { seq: 1 }, 'msg-1');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(outbox.messages[0]?.status).toBe('pending');
    expect(rabbit.publish).not.toHaveBeenCalled();
  });

  it('stop() during a pass: the pass finishes, no new ones start', async () => {
    const { rabbit, outbox, publisher, daemon } = createDaemon(5);
    rabbit.publish.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    for (let i = 1; i <= 3; i += 1) {
      await publisher.publish('order.created', { seq: i }, `msg-${i}`);
    }

    daemon.initialize();
    await waitFor(() => rabbit.publish.mock.calls.length >= 1, 300);
    daemon.stop();

    await new Promise((resolve) => setTimeout(resolve, 200)); // the running pass plays out (3 x 20ms)

    await publisher.publish('order.created', { seq: 4 }, 'msg-4');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // releaseSending is the first line of every pass: its count is the number of passes
    expect(outbox.releaseSending).toHaveBeenCalledTimes(1);
    expect(rabbit.publish.mock.calls.map((call: any[]) => call[2].seq)).toEqual([1, 2, 3]);
    expect(outbox.messages[3]?.status).toBe('pending');
  });

  it('stop() twice and stop() without initialize() do not throw', () => {
    const { daemon } = createDaemon();

    daemon.stop();
    daemon.stop();
    daemon.initialize();
    daemon.stop();
  });
});
