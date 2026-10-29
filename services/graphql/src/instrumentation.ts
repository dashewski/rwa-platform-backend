import { opentelemetry } from '@elysiajs/opentelemetry';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://alloy:4320/v1/traces',
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : {},
});

export const instrumentation = opentelemetry({
  serviceName: process.env.OTEL_SERVICE_NAME || 'graphql',
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        applyCustomAttributesOnSpan: (span, request) => {
          span.setAttribute('http.service', 'graphql');
          span.setAttribute('service.name', 'graphql');
        },
      },
      '@opentelemetry/instrumentation-graphql': {
        enabled: true,
      },
    }),
  ],
});
