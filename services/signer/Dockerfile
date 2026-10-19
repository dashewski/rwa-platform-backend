FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/errors/package.json ./shared/errors/
COPY shared/inbox-consumer/package.json ./shared/inbox-consumer/
COPY shared/outbox-publisher/package.json ./shared/outbox-publisher/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/

COPY services/signer/package.json ./services/signer/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/signer ./services/signer


EXPOSE ${PORT}


WORKDIR /app/services/signer
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]