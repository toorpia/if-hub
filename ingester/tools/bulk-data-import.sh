#!/bin/bash
# 大量データの分割取り込みスクリプト

set -e

if [ $# -lt 4 ]; then
    echo "使用方法: $0 <config_file> <pi_host> <pi_port> <start_date> [months]"
    echo "例: $0 configs/equipments/7th-untan/config.yaml 10.255.234.21 3011 2025-01-01 3"
    exit 1
fi

CONFIG_FILE="$1"
PI_HOST="$2"
PI_PORT="$3"
START_DATE="$4"
MONTHS="${5:-3}"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ 設定ファイルが見つかりません: $CONFIG_FILE"
    exit 1
fi

# 設備名を抽出
EQUIPMENT_NAME=$(basename $(dirname $CONFIG_FILE))
OUTPUT_BASE="static_equipment_data/${EQUIPMENT_NAME}"

echo "=== 大量データの分割取り込み ==="
echo "設備: $EQUIPMENT_NAME"
echo "開始日: $START_DATE"
echo "期間: ${MONTHS}ヶ月"
echo ""

# 月単位で分割取り込み
for month in $(seq 1 $MONTHS); do
    month_start=$(date -d "$START_DATE +$((month-1)) month" '+%Y-%m-01')
    # 修正: 月末の最後まで確実にデータを取得するため、翌月の1日を終了日に設定
    # これにより月末日の23:59:59までのデータが含まれる
    month_end=$(date -d "$month_start +1 month" '+%Y-%m-%d')
    
    echo "取り込み中: $month_start から $month_end (月末まで完全取得)"
    
    python3 "$(dirname "$0")/pi-batch-ingester.py" \
        --config "$CONFIG_FILE" \
        --host "$PI_HOST" \
        --port "$PI_PORT" \
        --start "$month_start" \
        --end "$month_end" \
        --output "${OUTPUT_BASE}_${month_start:0:7}.csv" \
        --metadata-dir "tag_metadata"
        
    # 取り込み間隔（PI-Serverへの負荷軽減）
    sleep 60
done

# 個別ファイルを統合
echo ""
echo "ファイルを統合中..."
if ls ${OUTPUT_BASE}_20*.csv 1> /dev/null 2>&1; then
    cat ${OUTPUT_BASE}_20*.csv > ${OUTPUT_BASE}.csv
    rm ${OUTPUT_BASE}_20*.csv
    echo "✅ 統合完了: ${OUTPUT_BASE}.csv"
else
    echo "❌ 統合対象ファイルが見つかりません"
fi
