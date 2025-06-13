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

# 一時ディレクトリの設定と作成
TEMP_DIR="ingester/temp"
mkdir -p "$TEMP_DIR"

# 一時ファイル用パス
TEMP_OUTPUT_BASE="${TEMP_DIR}/${EQUIPMENT_NAME}"
# 最終出力先パス
FINAL_OUTPUT_BASE="static_equipment_data/${EQUIPMENT_NAME}"

echo "=== 大量データの分割取り込み ==="
echo "設備: $EQUIPMENT_NAME"
echo "開始日: $START_DATE"
echo "期間: ${MONTHS}ヶ月"
echo "一時ディレクトリ: $TEMP_DIR"
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
        --output "${TEMP_OUTPUT_BASE}_${month_start:0:7}.csv" \
        --metadata-dir "tag_metadata"
        
    # 取り込み間隔（PI-Serverへの負荷軽減）
    sleep 60
done

# 個別ファイルを統合（一時ディレクトリ内で実行）
echo ""
echo "ファイルを統合中（一時ディレクトリ内）..."
if ls ${TEMP_OUTPUT_BASE}_20*.csv 1> /dev/null 2>&1; then
    # 一時ディレクトリ内で統合
    cat ${TEMP_OUTPUT_BASE}_20*.csv > "${TEMP_OUTPUT_BASE}.csv"
    
    # アトミック移動: 完成したファイルのみをstatic_equipment_data/に移動
    echo "完成ファイルをstatic_equipment_data/に移動中..."
    mv "${TEMP_OUTPUT_BASE}.csv" "${FINAL_OUTPUT_BASE}.csv"
    
    # 一時ファイルのクリーンアップ
    rm ${TEMP_OUTPUT_BASE}_20*.csv
    
    echo "✅ 統合完了: ${FINAL_OUTPUT_BASE}.csv"
    echo "✅ 一時ファイル削除完了"
else
    echo "❌ 統合対象ファイルが見つかりません: ${TEMP_OUTPUT_BASE}_20*.csv"
fi
