FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY server.mjs db.mjs seed.mjs ./
COPY public ./public

# 데이터베이스 파일은 반드시 영구 볼륨에 둔다. 컨테이너 안에 두면 재배포할 때 사라진다.
ENV ISTY_DB=/data/isty.db
VOLUME ["/data"]

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
