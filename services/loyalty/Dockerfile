FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/errors/package.json ./shared/errors/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/
COPY shared/blockchain/package.json ./shared/blockchain/
COPY shared/inbox-consumer/package.json ./shared/inbox-consumer/

COPY services/loyalty/package.json ./services/loyalty/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/loyalty ./services/loyalty


EXPOSE ${PORT}


WORKDIR /app/services/loyalty
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]