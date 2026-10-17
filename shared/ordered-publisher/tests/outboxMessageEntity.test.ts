import { describe, expect, it } from 'bun:test';
import { OutboxMessageEntity } from '../src/models/entity/outboxMessage.entity';

const schema = OutboxMessageEntity.schema as any;

describe('outboxMessage entity (shape and defaults)', () => {
  it('status: three states, pending by default, indexed', () => {
    const status = schema.path('status');

    expect(status.defaultValue).toBe('pending');
    expect(status.enumValues).toEqual(['pending', 'sending', 'sent']);
    expect(status.options.index).toBe(true);
  });

  it('sentAt starts empty', () => {
    expect(schema.path('sentAt').defaultValue).toBe(null);
  });

  it('messageId is required', () => {
    expect(schema.path('messageId').isRequired).toBe(true);
  });

  it('routingKey and payload are required', () => {
    expect(schema.path('routingKey').isRequired).toBe(true);
    expect(schema.path('payload').isRequired).toBe(true);
  });

  it('no claimedAt column: the leftovers of a dead pass are a status, not a timestamp', () => {
    expect(schema.path('claimedAt')).toBeUndefined();
  });

  it('createdAt / updatedAt come from a default function, in whole seconds', () => {
    for (const field of ['createdAt', 'updatedAt']) {
      const defaultValue = schema.path(field).defaultValue;

      expect(typeof defaultValue).toBe('function');

      const value = defaultValue();
      expect(Number.isInteger(value)).toBe(true);
      expect(Math.abs(value - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(2);
    }
  });

  it('timestamps are written in whole seconds', () => {
    const currentTime = schema.get('timestamps').currentTime;

    expect(typeof currentTime).toBe('function');

    const value = currentTime();
    expect(Number.isInteger(value)).toBe(true);
    expect(Math.abs(value - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(2);
  });
});
