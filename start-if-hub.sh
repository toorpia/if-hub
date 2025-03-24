#!/bin/bash

# 外部サービスPORT
EXTERNAL_PORT=3001

# ホストのタイムゾーンを取得（複数のOSで対応）
if command -v timedatectl &> /dev/null; then
  # Linux (systemdがある場合)
  TZ=$(timedatectl show --property=Timezone --value)
elif [ -f /etc/timezone ]; then
  # Debian系
  TZ=$(cat /etc/timezone)
elif [ -h /etc/localtime ]; then
  # リンクからの取得を試みる
  TZ=$(readlink /etc/localtime | grep -o '[^/]*$')
else
  # デフォルト値
  TZ="Asia/Tokyo"
fi

echo "検出されたホストタイムゾーン: $TZ"

# 取得したタイムゾーンで環境変数をセット
export TZ

# 開発環境か本番環境かを指定
if [ "$1" == "prod" ]; then
  echo "本番環境を起動しています..."
  docker compose -f docker/docker-compose.prod.yml down
  docker compose -f docker/docker-compose.prod.yml up -d --build
else
  echo "開発環境を起動しています..."
  docker compose -f docker/docker-compose.yml down
  docker compose -f docker/docker-compose.yml up -d --build
fi
