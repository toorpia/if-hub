#!/bin/bash
# Fetcherモジュール実行スクリプト

# 現在のディレクトリを取得
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# カラー出力用の設定
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ビルドチェック
if [ ! -d "$DIR/dist" ]; then
  echo -e "${BLUE}Fetcherモジュールをビルドします...${NC}"
  cd "$DIR" && npm run build
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}ビルドに失敗しました。${NC}"
    exit 1
  fi
fi

# データディレクトリの作成
mkdir -p "$DIR/data"

# Fetcherモジュールの実行
echo -e "${BLUE}Fetcherモジュールを実行します...${NC}"
node "$DIR/dist/cli/index.js" "$@"

# 実行結果のチェック
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo -e "${RED}実行中にエラーが発生しました。終了コード: $EXIT_CODE${NC}"
  exit $EXIT_CODE
fi

echo -e "${GREEN}処理が完了しました。${NC}"
