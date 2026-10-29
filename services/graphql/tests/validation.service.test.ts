/**
 * Unit tests for the gateway ValidationService (pure logic, no dependencies).
 * Validation failures are GraphQLErrors (not AppError) — that is asserted here.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { GraphQLError } from 'graphql';
import { ValidationService } from '../src/services/validation.service';

describe('ValidationService (unit, pure)', () => {
  let service: ValidationService;

  beforeEach(() => {
    service = new ValidationService();
  });

  test('validateCountry: accepts null/undefined and valid ISO alpha-2 codes', () => {
    expect(() => service.validateCountry(null)).not.toThrow();
    expect(() => service.validateCountry(undefined)).not.toThrow();
    expect(() => service.validateCountry('US')).not.toThrow();
    expect(() => service.validateCountry('AE')).not.toThrow();
  });

  test('validateCountry: rejects lowercase/overlong/empty codes with GraphQLError', () => {
    expect(() => service.validateCountry('us')).toThrow(GraphQLError);
    expect(() => service.validateCountry('USA')).toThrow('Invalid country code');
    expect(() => service.validateCountry('')).toThrow('Invalid country code');
  });

  test('validateSocials: accepts null/undefined and an empty array', () => {
    expect(() => service.validateSocials(null)).not.toThrow();
    expect(() => service.validateSocials(undefined)).not.toThrow();
    expect(() => service.validateSocials([])).not.toThrow();
  });

  test('validateSocials: rejects a non-array value', () => {
    expect(() => service.validateSocials('twitter' as never)).toThrow('socials must be an array');
  });

  test('validateSocials: rejects links missing type or url', () => {
    expect(() => service.validateSocials([{ type: 'twitter' } as never])).toThrow('Each social link must have');
    expect(() => service.validateSocials([{ url: 'https://x.com/abc' } as never])).toThrow(
      'Each social link must have',
    );
  });

  test('validateSocials: rejects unknown social types', () => {
    expect(() => service.validateSocials([{ type: 'tiktok', url: 'https://tiktok.com/@a' }])).toThrow(
      'Unknown social type',
    );
  });

  test('validateSocials: webpage accepts any valid URL and rejects invalid ones', () => {
    expect(() => service.validateSocials([{ type: 'webpage', url: 'https://example.com/page' }])).not.toThrow();
    expect(() => service.validateSocials([{ type: 'webpage', url: 'not-a-url' }])).toThrow('Invalid URL for webpage');
  });

  test('validateSocials: twitter/instagram/facebook/youtube enforce their domains', () => {
    expect(() => service.validateSocials([{ type: 'twitter', url: 'https://x.com/abc' }])).not.toThrow();
    expect(() => service.validateSocials([{ type: 'twitter', url: 'https://twitter.com/abc' }])).not.toThrow();
    expect(() => service.validateSocials([{ type: 'twitter', url: 'https://facebook.com/abc' }])).toThrow(
      'Invalid URL for twitter',
    );
    expect(() => service.validateSocials([{ type: 'instagram', url: 'https://www.instagram.com/abc' }])).not.toThrow();
    expect(() => service.validateSocials([{ type: 'facebook', url: 'https://facebook.com/page' }])).not.toThrow();
    expect(() =>
      service.validateSocials([{ type: 'youtube', url: 'https://www.youtube.com/watch?v=1' }]),
    ).not.toThrow();
    expect(() => service.validateSocials([{ type: 'youtube', url: 'https://youtu.be/abc' }])).toThrow(
      'Invalid URL for youtube',
    );
  });

  test('validateSocials: a valid link after an invalid one still fails on the invalid link', () => {
    expect(() =>
      service.validateSocials([
        { type: 'twitter', url: 'https://x.com/ok' },
        { type: 'instagram', url: 'https://not-instagram.example/abc' },
      ]),
    ).toThrow('Invalid URL for instagram');
  });
});
