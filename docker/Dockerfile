FROM node:18-alpine

WORKDIR /app

# アプリケーションの依存関係のためのpackage.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# 必要なディレクトリを作成し、適切な権限を設定
RUN mkdir -p /app/pi_data /app/logs /app/db \
    && chown -R node:node /app

# ユーザー権限の設定を削除して、rootとして実行できるようにする
# USER node の行を削除

# ポートをエクスポート
EXPOSE 3000

# コンテナ起動時のコマンド
CMD ["npm", "start"]
