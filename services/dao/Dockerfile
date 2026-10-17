FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/errors/package.json ./shared/errors/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/
COPY shared/blockchain/package.json ./shared/blockchain/
COPY shared/ordered-consumer/package.json ./shared/ordered-consumer/

COPY services/dao/package.json ./services/dao/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/dao ./services/dao


EXPOSE ${PORT}


WORKDIR /app/services/dao
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]