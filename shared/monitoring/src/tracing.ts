import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { AppError } from '@shared/errors/app-errors';
import { recordExceptionWithCause } from './decorator-utils';

export const tracer = trace.getTracer(String(process.env.SERVICE_NAME), '1.0.0');

/** Finds active span (if any) and sets attributes on it. No-op if no active span. */
export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

export interface SpanContext {
  span: Span;
  setAttributes: (attributes: Record<string, string | number | boolean>) => void;
  setStatus: (status: { code: SpanStatusCode; message?: string }) => void;
  addEvent: (name: string, attributes?: Record<string, string | number | boolean>) => void;
  end: () => void;
}

function createSpanContext(span: Span): {
  spanCtx: SpanContext;
  isEnded: () => boolean;
} {
  let spanEnded = false;

  const spanCtx: SpanContext = {
    span,
    setAttributes: (attrs) => span.setAttributes(attrs),
    setStatus: (status) => span.setStatus(status),
    addEvent: (name, attrs) => span.addEvent(name, attrs),
    end: () => {
      if (!spanEnded) {
        spanEnded = true;
        span.end();
      } else {
        throw new AppError({
          message: 'Span already ended',
          statusCode: 500,
          code: 'INTERNAL_ERROR',
        });
      }
    },
  };

  return { spanCtx, isEnded: () => spanEnded };
}

export function withTraceSync<T>(spanName: string, fn: (ctx: SpanContext) => T): T;
export function withTraceSync<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (ctx: SpanContext) => T,
): T;
export function withTraceSync<T>(
  spanName: string,
  attributesOrFn: Record<string, string | number | boolean> | ((ctx: SpanContext) => T),
  fn?: (ctx: SpanContext) => T,
): T {
  const actualFn = typeof attributesOrFn === 'function' ? attributesOrFn : fn!;
  const attributes = typeof attributesOrFn === 'object' ? attributesOrFn : undefined;

  const parentContext = context.active();
  const span = tracer.startSpan(spanName);

  if (attributes) {
    span.setAttributes(attributes);
  }

  const { spanCtx, isEnded } = createSpanContext(span);

  return context.with(trace.setSpan(parentContext, span), () => {
    try {
      const result = actualFn(spanCtx);
      if (!isEnded()) {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return result;
    } catch (error) {
      if (!isEnded()) {
        recordExceptionWithCause(span, error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof AppError) {
          span.setAttribute('error.code', error.code);
        }
      }
      throw error;
    } finally {
      if (!isEnded()) {
        span.end();
      }
      context.with(parentContext, () => {});
    }
  });
}

export function withTraceAsync<T>(spanName: string, fn: (ctx: SpanContext) => Promise<T>): Promise<T>;
export function withTraceAsync<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (ctx: SpanContext) => Promise<T>,
): Promise<T>;
export async function withTraceAsync<T>(
  spanName: string,
  attributesOrFn: Record<string, string | number | boolean> | ((ctx: SpanContext) => Promise<T>),
  fn?: (ctx: SpanContext) => Promise<T>,
): Promise<T> {
  const actualFn = typeof attributesOrFn === 'function' ? attributesOrFn : fn!;
  const attributes = typeof attributesOrFn === 'object' ? attributesOrFn : undefined;

  const parentContext = context.active();
  const span = tracer.startSpan(spanName);

  if (attributes) {
    span.setAttributes(attributes);
  }

  const { spanCtx, isEnded } = createSpanContext(span);

  return context.with(trace.setSpan(parentContext, span), async () => {
    try {
      const result = await actualFn(spanCtx);
      if (!isEnded()) {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return result;
    } catch (span_error) {
      if (!isEnded()) {
        recordExceptionWithCause(span, span_error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: span_error instanceof Error ? span_error.message : String(span_error),
        });
        if (span_error instanceof AppError) {
          span.setAttribute('error.code', span_error.code);
        }
      }
      throw span_error;
    } finally {
      if (!isEnded()) {
        span.end();
      }
      context.with(parentContext, () => {});
    }
  });
}
