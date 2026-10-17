import { describe, expect, it } from 'bun:test';
import { ProcessedMessageEntity } from '../src/models/entity/processedMessage.entity';

const schema = ProcessedMessageEntity.schema as any;

describe('processedMessage entity (shape and defaults)', () => {
  it('key is required and unique', () => {
    expect(schema.path('key').isRequired).toBe(true);

    const uniqueIndex = schema.indexes().find(([index]: [Record<string, unknown>, Record<string, unknown>]) => {
      return index.key === 1;
    });
    expect(uniqueIndex?.[1].unique).toBe(true);
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

  it('the marker carries nothing but the key and the timestamps', () => {
    const fields = Object.keys(schema.paths).filter((field) => field !== '_id' && field !== '__v');

    expect(fields.sort()).toEqual(['createdAt', 'key', 'updatedAt']);
    expect(schema.path('processedAt')).toBeUndefined();
  });
});
