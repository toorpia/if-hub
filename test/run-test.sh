#!/bin/bash

# PI-Ingesterテスト実行スクリプト

set -e

# カラー出力用の設定
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 現在のディレクトリを取得
TEST_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}🧪 PI-Ingester Test Environment${NC}"
echo -e "${BLUE}============================================================${NC}"

# 関数定義
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up test environment...${NC}"
    cd "$TEST_DIR"
    docker compose -f docker-compose.test.yml down -v
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Ctrl+Cでクリーンアップ
trap cleanup EXIT

# テスト環境の起動
start_test() {
    echo -e "${BLUE}🚀 Starting test environment...${NC}"
    cd "$TEST_DIR"
    
    # 既存のコンテナを停止・削除
    docker compose -f docker-compose.test.yml down -v
    
    # 出力ディレクトリをクリア
    rm -rf logs/* output/*
    
    # テスト環境を起動
    echo -e "${BLUE}📦 Building and starting containers...${NC}"
    docker compose -f docker-compose.test.yml up --build -d
    
    echo -e "${GREEN}✅ Test environment started${NC}"
    echo ""
    echo -e "${BLUE}📊 Container Status:${NC}"
    docker compose -f docker-compose.test.yml ps
    echo ""
}

# ログ監視
monitor_logs() {
    echo -e "${BLUE}📋 Monitoring logs (Press Ctrl+C to stop)...${NC}"
    echo -e "${YELLOW}⏰ Waiting 10 seconds for containers to initialize...${NC}"
    sleep 10
    
    echo ""
    echo -e "${BLUE}=== Mock PI-API Server Logs ===${NC}"
    docker logs mock-pi-api-test --tail=20
    
    echo ""
    echo -e "${BLUE}=== PI-Ingester Logs ===${NC}"
    docker logs pi-ingester-test --tail=20
    
    echo ""
    echo -e "${BLUE}📊 Following real-time logs...${NC}"
    docker compose -f docker-compose.test.yml logs -f
}

# テスト結果の確認
check_results() {
    echo -e "${BLUE}🔍 Checking test results...${NC}"
    
    # 出力ファイルの確認（新仕様: {設備名}.csv）
    if [ -f "./output/7th-untan.csv" ]; then
        echo -e "${GREEN}✅ CSV output file created: 7th-untan.csv${NC}"
        echo -e "${BLUE}📄 File contents (first 10 lines):${NC}"
        head -n 10 "./output/7th-untan.csv"
        echo ""
        echo -e "${BLUE}📊 File stats:${NC}"
        wc -l "./output/7th-untan.csv"
    else
        echo -e "${RED}❌ CSV output file not found (expected: 7th-untan.csv)${NC}"
    fi
    
    # 状態ファイルの確認
    if [ -f "./logs/ingester-state.json" ]; then
        echo -e "${GREEN}✅ State file created: ingester-state.json${NC}"
        echo -e "${BLUE}📄 State file contents:${NC}"
        cat "./logs/ingester-state.json" | python3 -m json.tool 2>/dev/null || cat "./logs/ingester-state.json"
    else
        echo -e "${RED}❌ State file not found${NC}"
    fi
    
    # ログファイルの確認
    if [ -f "./logs/ingester-test.log" ]; then
        echo -e "${GREEN}✅ Log file created: ingester-test.log${NC}"
        echo -e "${BLUE}📄 Recent log entries:${NC}"
        tail -n 20 "./logs/ingester-test.log"
    else
        echo -e "${RED}❌ Log file not found${NC}"
    fi
}

# メイン処理
case "${1:-run}" in
    "start")
        start_test
        ;;
    "logs")
        monitor_logs
        ;;
    "check")
        check_results
        ;;
    "stop")
        cleanup
        ;;
    "run")
        start_test
        echo -e "${YELLOW}⏰ Running test for 3 minutes...${NC}"
        echo -e "${BLUE}   (The ingester should fetch data every 30 seconds)${NC}"
        sleep 180
        check_results
        ;;
    *)
        echo "Usage: $0 {start|logs|check|stop|run}"
        echo ""
        echo "Commands:"
        echo "  start  - Start test environment"
        echo "  logs   - Monitor logs in real-time"
        echo "  check  - Check test results"
        echo "  stop   - Stop test environment"
        echo "  run    - Run complete test (default)"
        exit 1
        ;;
esac
