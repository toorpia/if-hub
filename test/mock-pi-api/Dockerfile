FROM node:20-alpine

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonをコピーして依存関係をインストール
COPY package.json ./
RUN npm install

# アプリケーションコードをコピー
COPY server.js ./

# ポートを公開
EXPOSE 3011

# ヘルスチェック
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3011/health || exit 1

# アプリケーションを起動
CMD ["node", "server.js"]
