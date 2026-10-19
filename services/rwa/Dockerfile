FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/openrouter/package.json ./shared/openrouter/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/
COPY shared/redis-events/package.json ./shared/redis-events/
COPY shared/errors/package.json ./shared/errors/
COPY shared/outbox-publisher/package.json ./shared/outbox-publisher/
COPY shared/files/package.json ./shared/files/
COPY shared/blockchain/package.json ./shared/blockchain/
COPY shared/inbox-consumer/package.json ./shared/inbox-consumer/

COPY services/rwa/package.json ./services/rwa/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/rwa ./services/rwa


EXPOSE ${PORT}


WORKDIR /app/services/rwa
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]