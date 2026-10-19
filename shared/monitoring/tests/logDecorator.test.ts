/**
 * Unit tests for LogDecorator.
 *
 * Focus: the `args` mapper is diagnostic-only. Whatever it does — a missing
 * argument, a field renamed by a signature change, a throwing getter — the
 * decorated method must still run and its result/error must be untouched; the
 * mapper failure is reported as its own log line.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { LogDecorator } from '../src/logDecorator';
import { logger } from '../src/monitoring.plugin';
import { AppError } from '@shared/errors/app-errors';

let logs: Array<{ level: string; message: string; fields?: unknown }> = [];
let originalDebug: typeof logger.debug;
let originalInfo: typeof logger.info;
let originalWarn: typeof logger.warn;
let originalError: typeof logger.error;

function captureLogger() {
  logs = [];
  originalDebug = logger.debug;
  originalInfo = logger.info;
  originalWarn = logger.warn;
  originalError = logger.error;

  logger.debug = ((message: string, fields?: unknown) => {
    logs.push({ level: 'debug', message, fields });
  }) as typeof logger.debug;
  logger.info = ((message: string, fields?: unknown) => {
    logs.push({ level: 'info', message, fields });
  }) as typeof logger.info;
  logger.warn = ((message: string, fields?: unknown) => {
    logs.push({ level: 'warn', message, fields });
  }) as typeof logger.warn;
  logger.error = ((message: string, fields?: unknown) => {
    logs.push({ level: 'error', message, fields });
  }) as typeof logger.error;
}

function restoreLogger() {
  logger.debug = originalDebug;
  logger.info = originalInfo;
  logger.warn = originalWarn;
  logger.error = originalError;
}

function messages(level: string): string[] {
  return logs.filter((entry) => entry.level === level).map((entry) => entry.message);
}

describe('LogDecorator (unit, logger replaced)', () => {
  beforeEach(captureLogger);
  afterEach(restoreLogger);

  test('a working mapper feeds the log fields and the method result is returned as-is', () => {
    class Service {
      @LogDecorator({ args: (a) => ({ poolAddress: a[0].poolAddress, startTime: a[0].startTime }) })
      getRawPriceData(params: { poolAddress: string; startTime: number; endTime: number }) {
        return `ok:${params.poolAddress}`;
      }
    }

    const result = new Service().getRawPriceData({ poolAddress: '0xpool', startTime: 1, endTime: 2 });

    expect(result).toBe('ok:0xpool');
    const called = logs.find((entry) => entry.message.endsWith('— called'));
    expect(called?.fields).toEqual({ poolAddress: '0xpool', startTime: 1 });
    expect(messages('error')).toEqual([]);
  });

  test('a mapper reading a non-existent argument no longer fails the method', () => {
    class Service {
      // Exactly the shape that used to throw: the method takes one object, the
      // mapper reads a[1]/a[2] as if the arguments were positional.
      @LogDecorator({ args: (a) => ({ startTime: a[1].startTime, endTime: a[2].endTime }) })
      getRawPriceData(params: { poolAddress: string; startTime: number; endTime: number }) {
        return params.startTime + params.endTime;
      }
    }

    const result = new Service().getRawPriceData({ poolAddress: '0xpool', startTime: 20, endTime: 22 });

    expect(result).toBe(42);
    expect(messages('error').some((message) => message.includes('log_args_failed'))).toBe(true);
    const called = logs.find((entry) => entry.message.endsWith('— called'));
    expect(called?.fields).toBeUndefined();
  });

  test('a mapper that throws outright is contained too', () => {
    class Service {
      @LogDecorator({
        args: () => {
          throw new TypeError("Cannot read properties of undefined (reading 'startTime')");
        },
      })
      async find(params: { id: string }) {
        return `found:${params.id}`;
      }
    }

    return new Service().find({ id: '7' }).then((value) => {
      expect(value).toBe('found:7');
      expect(messages('error').some((message) => message.includes('log_args_failed'))).toBe(true);
    });
  });

  test('a throwing getter inside the returned mapping is contained', () => {
    class Service {
      @LogDecorator({
        args: () => ({
          get amount(): string {
            throw new Error('lazy field blew up');
          },
        }),
      })
      pay(amount: number) {
        return amount * 2;
      }
    }

    expect(new Service().pay(21)).toBe(42);
    expect(messages('error').some((message) => message.includes('log_args_failed'))).toBe(true);
  });

  test('an async method with a broken mapper still resolves and logs its own ok line', async () => {
    class Service {
      @LogDecorator({ args: (a) => ({ id: a[0].missing.deep }) })
      async load(params: { id: string }) {
        return `loaded:${params.id}`;
      }
    }

    await expect(new Service().load({ id: '9' })).resolves.toBe('loaded:9');
    expect(messages('debug').some((message) => message.endsWith('— ok'))).toBe(true);
    expect(messages('error').some((message) => message.includes('log_args_failed'))).toBe(true);
  });

  test('without options nothing is mapped and the method is untouched', async () => {
    class Service {
      @LogDecorator()
      async load(params: { id: string }) {
        return params.id;
      }
    }

    await expect(new Service().load({ id: '1' })).resolves.toBe('1');
    const called = logs.find((entry) => entry.message.endsWith('— called'));
    expect(called?.fields).toBeUndefined();
    expect(messages('error')).toEqual([]);
  });

  test('a real method failure is still reported and rethrown unchanged', async () => {
    const failure = new AppError({ message: 'not found', statusCode: 404, code: 'NOT_FOUND' });

    class Service {
      @LogDecorator({ args: (a) => ({ id: a[0].id }) })
      async load(_params: { id: string }) {
        throw failure;
      }
    }

    await expect(new Service().load({ id: '404' })).rejects.toBe(failure);
    expect(messages('warn').some((message) => message.endsWith('— failed'))).toBe(true);
  });

  test('positional arguments keep working as before', () => {
    class Service {
      @LogDecorator({ args: (a) => ({ poolAddress: a[0], interval: a[1] }) })
      getVolumeData(poolAddress: string, interval: string, startTime: number) {
        return `${poolAddress}:${interval}:${startTime}`;
      }
    }

    expect(new Service().getVolumeData('0xpool', '1h', 10)).toBe('0xpool:1h:10');
    const called = logs.find((entry) => entry.message.endsWith('— called'));
    expect(called?.fields).toEqual({ poolAddress: '0xpool', interval: '1h' });
  });
});
