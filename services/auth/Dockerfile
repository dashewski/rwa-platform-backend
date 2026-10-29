FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/errors/package.json ./shared/errors/
COPY shared/sessions/package.json ./shared/sessions/

COPY services/auth/package.json ./services/auth/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/auth ./services/auth


EXPOSE ${PORT}


WORKDIR /app/services/auth
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]