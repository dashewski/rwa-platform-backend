FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/errors/package.json ./shared/errors/
COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/redis-events/package.json ./shared/redis-events/
COPY shared/ownership/package.json ./shared/ownership/
COPY shared/sessions/package.json ./shared/sessions/

COPY services/auth/package.json ./services/auth/
COPY services/company/package.json ./services/company/

COPY services/graphql/package.json ./services/graphql/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/graphql ./services/graphql


EXPOSE ${PORT}


WORKDIR /app/services/graphql
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]