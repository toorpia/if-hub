#!/bin/bash
# Fetcherモジュールの結合テストを実行するスクリプト

# カラー出力用の設定
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 現在のディレクトリを取得
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/.."

# テスト出力ディレクトリ
TEST_OUTPUT_DIR="./data"
mkdir -p $TEST_OUTPUT_DIR

echo -e "${BLUE}### IF-HUB Fetcherモジュール結合テスト ###${NC}"
echo -e "${BLUE}テスト環境を準備中...${NC}"

# ビルドの確認
if [ ! -d "./dist" ]; then
  echo -e "${BLUE}TypeScriptコードをビルドします...${NC}"
  npm run build
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}ビルドに失敗しました。テストを中止します。${NC}"
    exit 1
  fi
fi

# 期待値と実際の値を比較するヘルパー関数
assert_contains() {
  local file=$1
  local expected=$2
  
  if grep -q "$expected" "$file"; then
    echo -e "${GREEN}✓ $file contains '$expected'${NC}"
    return 0
  else
    echo -e "${RED}✗ $file does not contain '$expected'${NC}"
    return 1
  fi
}

# CSVファイルの行数をカウントする関数
count_csv_lines() {
  local file=$1
  # ヘッダー行を除く行数をカウント
  local count=$(wc -l < "$file")
  echo $((count - 1))
}

# テスト実行関数
run_test() {
  local test_name=$1
  local command=$2
  local check_cmd=${3:-true}
  
  echo -e "\n${BLUE}テスト実行: $test_name${NC}"
  echo -e "コマンド: $command"
  
  # コマンド実行
  eval "$command"
  local exit_code=$?
  
  if [ $exit_code -ne 0 ]; then
    echo -e "${RED}✗ テスト失敗: コマンドがエラーコード $exit_code で終了しました${NC}"
    return 1
  fi
  
  # 追加のチェックを実行
  eval "$check_cmd"
  local check_exit=$?
  
  if [ $check_exit -ne 0 ]; then
    echo -e "${RED}✗ テスト失敗: 検証に失敗しました${NC}"
    return 1
  fi
  
  echo -e "${GREEN}✓ テスト成功: $test_name${NC}"
  return 0
}

# 各種テストの実行
echo -e "\n${BLUE}結合テストを開始します...${NC}"

# テスト1: 基本的なデータ取得
run_test "基本データ取得" \
  "node ./dist/cli/index.js --equipment Pump01 --config-file ./test.config.yaml" \
  "ls $TEST_OUTPUT_DIR/Pump01/*.csv > /dev/null 2>&1"

# テスト2: 特定のタグのみ取得
run_test "特定タグのみ取得" \
  "node ./dist/cli/index.js --equipment Pump01 --tags Pump01.Temperature --config-file ./test.config.yaml" \
  "file=\$(ls -t $TEST_OUTPUT_DIR/Pump01/*.csv | head -1); assert_contains \"\$file\" \"Temperature\""

# テスト3: 温度条件付きフィルタリング
run_test "温度条件付きフィルタリング" \
  "node ./dist/cli/index.js --equipment Pump01 --only-when \"Pump01.Temperature > 48\" --config-file ./test.config.yaml" \
  "file=\$(ls -t $TEST_OUTPUT_DIR/Pump01/*.csv | head -1); count=\$(count_csv_lines \"\$file\"); [ \$count -gt 0 ] && echo \"フィルタ後のレコード数: \$count\""

# テスト4: 期間指定
run_test "期間指定データ取得" \
  "node ./dist/cli/index.js --equipment Pump01 --start \"2023-01-01 00:10:00\" --end \"2023-01-01 00:20:00\" --config-file ./test.config.yaml" \
  "file=\$(ls -t $TEST_OUTPUT_DIR/Pump01/*.csv | head -1); count=\$(count_csv_lines \"\$file\"); [ \$count -gt 0 ] && echo \"期間指定後のレコード数: \$count\""

# テスト5: gtagデータ取得
run_test "gtag取得" \
  "node ./dist/cli/index.js --equipment Pump01 --tags Pump01.EfficiencyIndex --config-file ./test.config.yaml" \
  "file=\$(ls -t $TEST_OUTPUT_DIR/Pump01/*.csv | head -1); assert_contains \"\$file\" \"EfficiencyIndex\""

# テスト結果のサマリー
echo -e "\n${BLUE}=== テスト完了 ===${NC}"
echo -e "すべてのテストが完了しました。"
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ 結合テストにパスしました。${NC}"
else
  echo -e "${RED}✗ 結合テストに失敗しました。上記のエラーを確認してください。${NC}"
  exit 1
fi
