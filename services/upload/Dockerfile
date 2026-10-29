FROM oven/bun:1.4.2

WORKDIR /app


COPY package.json .

COPY shared/errors/package.json ./shared/errors/
COPY shared/monitoring/package.json ./shared/monitoring/
COPY shared/ownership/package.json ./shared/ownership/
COPY shared/sessions/package.json ./shared/sessions/

COPY services/auth/package.json ./services/auth/
COPY services/company/package.json ./services/company/

COPY services/upload/package.json ./services/upload/

COPY bun.lockb .


RUN bun install


COPY shared/ ./shared/


COPY services/upload ./services/upload


EXPOSE ${PORT}


WORKDIR /app/services/upload
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]
