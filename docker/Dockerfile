FROM node:18-alpine

WORKDIR /app

# アプリケーションの依存関係のためのpackage.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# 必要なディレクトリを作成し、適切な権限を設定
RUN mkdir -p /app/pi_data /app/logs /app/db \
    && chown -R node:node /app

# ユーザーをnodeに変更（nodeは既にNode.jsイメージに存在する）
USER node

# ポートをエクスポート
EXPOSE 3000

# コンテナ起動時のコマンド
CMD ["npm", "start"]
