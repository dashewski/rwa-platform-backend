FROM oven/bun:1.4.2

WORKDIR /app

COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/errors/package.json ./shared/errors/
COPY shared/openrouter/package.json ./shared/openrouter/
COPY shared/files/package.json ./shared/files/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/
COPY shared/inbox-consumer/package.json ./shared/inbox-consumer/
COPY shared/outbox-publisher/package.json ./shared/outbox-publisher/
COPY shared/redis-events/package.json ./shared/redis-events/

COPY bun.lockb .

RUN bun install

COPY shared/ ./shared/

COPY services/ai-evaluator ./services/ai-evaluator

EXPOSE ${PORT}

WORKDIR /app/services/ai-evaluator
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]