FROM node:20-alpine

# 作業ディレクトリを設定
WORKDIR /app

# Alpineに必要なパッケージをインストール
RUN apk add --no-cache tzdata

# タイムゾーンを設定
ENV TZ=Asia/Tokyo

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 全ての依存関係をインストール（ビルド用）
RUN npm ci

# ソースコードをコピー
COPY . .

# TypeScriptをビルド
RUN npm run build

# 本番用の依存関係のみ再インストール
RUN npm ci --only=production && npm cache clean --force

# 必要なディレクトリを作成
RUN mkdir -p /app/logs /app/static_equipment_data

# ログディレクトリの権限を設定
RUN chmod 755 /app/logs /app/static_equipment_data

# 非rootユーザーを作成
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ingester -u 1001 -G nodejs

# ディレクトリの所有者を変更
RUN chown -R ingester:nodejs /app

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check: OK')" || exit 1

# アプリケーションを起動
CMD ["node", "dist/index.js"]
