// Sets the OTLP endpoint before any module that builds exporters is evaluated.
// Imported first in every test file of this package, so `bun test` works
// without the runner-level environment of the repo scripts.
process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= 'http://localhost:4318';
