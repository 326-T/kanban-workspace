# kw-backend（Kotlin）。frontend（Vite ビルド）も同じイメージに焼き、backend が静的配信する。
#
# build context はリポジトリルート: docker build -f backend/Dockerfile .

# 1) frontend
FROM oven/bun:1.3-debian AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install
COPY frontend/ ./
# RunEvent の型定義（tsconfig の paths が参照する。型のみなので実行時依存はない）
COPY runner/src/protocol /src/runner/src/protocol
RUN bun run build

# 2) backend
FROM gradle:9-jdk25 AS build
WORKDIR /src
COPY backend/settings.gradle.kts backend/build.gradle.kts ./
COPY backend/src ./src
RUN gradle installDist --no-daemon -q

# 3) 実行イメージ（git 操作を行うため git を入れる）
FROM eclipse-temurin:25-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/build/install/kw-backend /opt/kw-backend
COPY --from=web /src/frontend/dist /opt/kw-web

ENV KW_WEB_DIR=/opt/kw-web
EXPOSE 4646

ENTRYPOINT ["/opt/kw-backend/bin/kw-backend"]
