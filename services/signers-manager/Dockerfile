FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/errors/package.json ./shared/errors/
COPY shared/inbox-consumer/package.json ./shared/inbox-consumer/
COPY shared/outbox-publisher/package.json ./shared/outbox-publisher/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/

COPY services/signers-manager/package.json ./services/signers-manager/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/signers-manager ./services/signers-manager


EXPOSE ${PORT}


WORKDIR /app/services/signers-manager
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]