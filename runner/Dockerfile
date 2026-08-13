# kw-runner（bun）。Agent SDK は CLI をプラットフォーム別のネイティブ依存として配布するため、
# node_modules はコンテナ内で install してイメージに焼く（ホストの darwin 用は使えない）。
#
# build context はリポジトリルート: docker build -f runner/Dockerfile .
FROM oven/bun:1.3-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git ca-certificates curl python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY runner/package.json runner/bun.lock* ./
RUN bun install

COPY runner/tsconfig.json ./
COPY runner/src ./src

ENV KW_ENGINE_PORT=4647
EXPOSE 4647

CMD ["bun", "src/engine/server.ts"]
