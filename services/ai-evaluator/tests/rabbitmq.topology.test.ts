/**
 * Contract tests for the ai-evaluator RabbitMQ topology.
 *
 * The evaluator is both a consumer (evaluation.requests) and a producer
 * (evaluation results through the outbox). The queue belongs to the evaluator,
 * the results queue belongs to rwa — these tests pin down both sides so the
 * routing keys cannot drift apart.
 *
 * No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import { RabbitMQClient as RwaClient } from '../../rwa/src/clients/rabbitmq.client';

type ExchangeConfig = { isSync: boolean; concurrency: number; maxAttempts: number };

const EVALUATION_RESULT_KEYS = ['poolResult', 'businessResult'];

const client = new RabbitMQClient('amqp://guest:***@localhost:5672');
const topology = client.getTopologyDefinition();
const outbox = new OutboxPublisherDaemon({} as never);
const config = (outbox as unknown as { exchangesConfig: Record<string, ExchangeConfig> }).exchangesConfig;
const routing = (
  new InboxConsumerDaemon({} as never, {} as never, {} as never) as unknown as {
    eventRouting: Record<string, { prefetch: number; isSync: boolean; handlers: Record<string, unknown> }>;
  }
).eventRouting;

describe('ai-evaluator RabbitMQ topology', () => {
  test('declares the evaluation exchange and its own requests queue', () => {
    expect(topology.exchanges).toEqual({ evaluation: { type: 'direct', options: { durable: true } } });
    expect(Object.keys(topology.queues)).toEqual(['evaluation.requests']);
    expect(topology.queues['evaluation.requests'].bindings).toEqual({
      evaluation: ['evaluatePool', 'evaluateBusiness'],
    });
  });

  test('the requests queue is bounded: 3 attempts in process, 3 retry cycles, then parked', () => {
    expect(topology.queues['evaluation.requests']).toMatchObject({
      deferAfterAttempts: 3,
      parkAfterCycles: 3,
    });
  });

  test('the requests queue runs up to 5 evaluations in parallel', () => {
    expect(routing['evaluation.requests']).toMatchObject({ prefetch: 5, isSync: false });
    expect(Object.keys(routing['evaluation.requests'].handlers)).toEqual(['evaluatePool', 'evaluateBusiness']);
  });

  test('the outbox polls a registered exchange', () => {
    expect(Object.keys(config)).toEqual(['evaluation']);

    for (const exchange of Object.keys(config)) {
      expect(client.isExchangeRegistered(exchange)).toBe(true);
    }
  });

  test('parallel publishing: 5 in flight, 10 attempts', () => {
    expect(config['evaluation']).toEqual({ isSync: false, concurrency: 5, maxAttempts: 10 });
  });

  test('the exchange and both result keys exist on the consumer side', () => {
    const rwa = new RwaClient('amqp://guest:***@localhost:5672').getTopologyDefinition();

    expect(rwa.exchanges.evaluation).toEqual(topology.exchanges.evaluation);
    expect(rwa.queues['evaluation.results'].bindings.evaluation as readonly string[]).toEqual(EVALUATION_RESULT_KEYS);
  });
});
