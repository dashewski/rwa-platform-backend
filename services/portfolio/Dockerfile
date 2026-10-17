FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/errors/package.json ./shared/errors/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/
COPY shared/blockchain/package.json ./shared/blockchain/
COPY shared/ordered-consumer/package.json ./shared/ordered-consumer/

COPY services/portfolio/package.json ./services/portfolio/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/portfolio ./services/portfolio


EXPOSE ${PORT}

WORKDIR /app/services/portfolio
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]