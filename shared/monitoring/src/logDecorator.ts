import { logger } from './monitoring.plugin';
import { camelToSnakeCase } from './decorator-utils';
import { AppError } from '@shared/errors/app-errors';

export interface LogOptions {
  args?: (args: any[]) => Record<string, any>;
}

/**
 * Runs the user-provided `args` mapper in isolation.
 *
 * The mapper is diagnostic-only: it must never be able to fail the decorated
 * method. A broken mapping (an index that does not exist, a field that was
 * renamed, a throwing getter) therefore drops the log fields and is reported
 * as its own log line instead of bubbling up as a TypeError.
 */
function buildLogArgs(options: LogOptions | undefined, args: any[], fullName: string) {
  if (!options?.args) {
    return undefined;
  }

  try {
    const mapped = options.args(args);

    // Spread inside the try as well: property reads of a lazy mapping happen here.
    return mapped === undefined ? undefined : { ...mapped };
  } catch (error: any) {
    logger.error(`${fullName} — log_args_failed`, {
      error: error?.message,
      stack: error?.stack,
    });

    return undefined;
  }
}

export function LogDecorator(options?: LogOptions) {
  return function (originalMethod: any, context: ClassMethodDecoratorContext) {
    const methodName = String(context.name);

    return function replacementMethod(this: any, ...args: any[]) {
      const className = camelToSnakeCase(this.constructor.name);
      const fullName = `${className}.${camelToSnakeCase(methodName)}`;
      const logArgs = buildLogArgs(options, args, fullName);

      logger.debug(`${fullName} — called`, logArgs);

      try {
        const result = originalMethod.apply(this, args);

        if (result && typeof result.then === 'function') {
          return result
            .then((value: any) => {
              logger.debug(`${fullName} — ok`);
              return value;
            })
            .catch((error: any) => {
              if (error instanceof AppError) {
                logger.warn(`${fullName} — failed`, {
                  error: error.message,
                  code: error.code,
                  statusCode: error.statusCode,
                });
              } else {
                logger.error(`${fullName} — system_error`, {
                  error: error.message,
                  stack: error.stack,
                });
              }
              throw error;
            });
        }

        logger.debug(`${fullName} — ok`);
        return result;
      } catch (error: any) {
        if (error instanceof AppError) {
          logger.warn(`${fullName} — failed`, {
            error: error.message,
            code: error.code,
            statusCode: error.statusCode,
          });
        } else {
          logger.error(`${fullName} — system_error`, {
            error: error.message,
            stack: error.stack,
          });
        }
        throw error;
      }
    };
  };
}
