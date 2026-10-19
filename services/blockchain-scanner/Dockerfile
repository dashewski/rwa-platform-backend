FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/rabbitmq/package.json ./shared/rabbitmq/
COPY shared/errors/package.json ./shared/errors/
COPY shared/blockchain/package.json ./shared/blockchain/
COPY shared/outbox-publisher/package.json ./shared/outbox-publisher/

COPY services/blockchain-scanner/package.json ./services/blockchain-scanner/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/



# COPY services/ai/src/ ./services/ai/src/
# COPY services/chat/src/ ./services/chat/src/
# COPY services/virtual-balance/src/ ./services/virtual-balance/src/


COPY services/blockchain-scanner ./services/blockchain-scanner


EXPOSE ${PORT}


WORKDIR /app/services/blockchain-scanner
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]