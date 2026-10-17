FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/
COPY shared/redis-events/package.json ./shared/redis-events/
COPY shared/errors/package.json ./shared/errors/
COPY services/charts/package.json ./services/charts/
COPY shared/blockchain/package.json ./shared/blockchain/
COPY shared/ordered-consumer/package.json ./shared/ordered-consumer/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/charts ./services/charts


EXPOSE ${PORT}


WORKDIR /app/services/charts
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]