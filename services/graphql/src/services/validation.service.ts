import { GraphQLError } from 'graphql';

import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';

const SOCIAL_URL_PATTERNS: Record<string, RegExp> = {
  twitter: /^https?:\/\/(x\.com|twitter\.com)\/.+/i,
  instagram: /^https?:\/\/(www\.)?instagram\.com\/.+/i,
  facebook: /^https?:\/\/(www\.)?facebook\.com\/.+/i,
  youtube: /^https?:\/\/(www\.)?youtube\.com\/.+/i,
};

const VALID_SOCIAL_TYPES = new Set(Object.keys(SOCIAL_URL_PATTERNS).concat(['webpage']));

export class ValidationService {
  /**
   * Validates ISO 3166-1 alpha-2 country code
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ country: a[0] }),
  })
  validateCountry(country: string | null | undefined): void {
    if (country == null) return;
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new GraphQLError(`Invalid country code: "${country}". Must be ISO 3166-1 alpha-2 (e.g. "US", "AE", "GB")`);
    }
  }

  /**
   * Validates array of social links — checks type is known and URL matches the pattern
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ socials: a[0] }),
  })
  validateSocials(socials: Array<{ type: string; url: string }> | null | undefined): void {
    if (socials == null) return;
    if (!Array.isArray(socials)) {
      throw new GraphQLError('socials must be an array');
    }

    for (const link of socials) {
      if (!link.type || !link.url) {
        throw new GraphQLError('Each social link must have "type" and "url"');
      }

      if (!VALID_SOCIAL_TYPES.has(link.type)) {
        throw new GraphQLError(
          `Unknown social type: "${link.type}". Allowed: ${Array.from(VALID_SOCIAL_TYPES).join(', ')}`,
        );
      }

      // webpage — any URL is fine
      if (link.type === 'webpage') {
        try {
          new URL(link.url);
        } catch {
          throw new GraphQLError(`Invalid URL for webpage: "${link.url}"`);
        }
        continue;
      }

      const pattern = SOCIAL_URL_PATTERNS[link.type];
      if (pattern && !pattern.test(link.url)) {
        throw new GraphQLError(
          `Invalid URL for ${link.type}: "${link.url}". Must match ${link.type === 'twitter' ? 'x.com or twitter.com' : link.type + '.com'}`,
        );
      }
    }
  }
}
