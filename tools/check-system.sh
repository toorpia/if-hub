#!/bin/bash
# 定期的な動作確認スクリプト

echo "=== IF-Hub + PI-Ingester 動作確認 ==="
echo ""

echo "コンテナ状態:"
docker ps | grep if-hub || echo "  コンテナが見つかりません"
echo ""

echo "最新のデータファイル:"
if [ -d "static_equipment_data" ]; then
    ls -lt static_equipment_data/*.csv 2>/dev/null | head -5 || echo "  CSVファイルが見つかりません"
else
    echo "  static_equipment_data ディレクトリが見つかりません"
fi
echo ""

echo "PI-Ingester状態:"
if [ -f "logs/ingester-state.json" ]; then
    cat logs/ingester-state.json | grep -E "(lastSuccessTime|errorCount)" || echo "  状態情報が見つかりません"
else
    echo "  状態ファイルが見つかりません"
fi
echo ""

echo "ディスク使用量:"
df -h . | tail -1
echo ""

echo "最近のログ（直近5行）:"
if [ -f "logs/ingester.log" ]; then
    tail -5 logs/ingester.log
else
    echo "  ログファイルが見つかりません"
fi
