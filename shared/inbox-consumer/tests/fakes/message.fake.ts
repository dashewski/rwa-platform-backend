/**
 * Builders for AMQP-like consumed messages: a plain JSON body plus the x-death
 * header shape RabbitMQ writes on a retry cycle.
 */
import type { ConsumeMessage } from 'amqplib';

export type ConsumedMessage = ConsumeMessage;

export function makeMessage(
  routingKey: string,
  body: unknown,
  options: {
    messageId?: string | null;
    redelivered?: boolean;
    raw?: string;
    headers?: Record<string, unknown>;
  } = {},
): ConsumedMessage {
  const raw = options.raw ?? JSON.stringify(body);
  const messageId = options.messageId === undefined ? '31337:0xabc:3' : options.messageId;

  return {
    content: Buffer.from(raw),
    fields: {
      routingKey,
      redelivered: options.redelivered ?? false,
      deliveryTag: 1,
      exchange: 'blockchain.events',
      consumerTag: 'ctag',
    },
    properties: {
      ...(messageId === null ? {} : { messageId }),
      ...(options.headers ? { headers: options.headers } : {}),
    },
  } as unknown as ConsumeMessage;
}

/** x-death entry as RabbitMQ writes it: an array of {key, value} pairs. */
export function xDeathEntry(queue: string, reason: string, count: number): Array<[string, unknown]> {
  return [
    ['queue', queue],
    ['reason', reason],
    ['count', count],
  ];
}
