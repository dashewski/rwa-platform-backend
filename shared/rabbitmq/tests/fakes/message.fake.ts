/**
 * Minimal AMQP message for the client's ack/nack tests.
 */

import type { ConsumeMessage } from 'amqplib';

export function makeAmqpMessage(messageId?: string): ConsumeMessage {
  return {
    content: Buffer.from('{"a":1}'),
    fields: { routingKey: 'task', deliveryTag: 1, consumerTag: 'ctag', exchange: 'sign.exchange', redelivered: false },
    properties: (messageId === undefined ? {} : { messageId }) as ConsumeMessage['properties'],
  } as ConsumeMessage;
}
