// Sets the OTLP endpoint before any module that builds exporters is evaluated.
process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= 'http://localhost:4318';
