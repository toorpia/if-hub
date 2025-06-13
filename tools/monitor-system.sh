#!/bin/bash
# システム監視スクリプト

LOG_FILE="system_monitor.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] システム監視開始" >> $LOG_FILE

# コンテナ状態確認
if ! docker ps | grep -q "if-hub.*Up"; then
  echo "[$TIMESTAMP] 警告: IF-Hubコンテナが停止しています" >> $LOG_FILE
fi

if ! docker ps | grep -q "if-hub-pi-ingester.*Up"; then
  echo "[$TIMESTAMP] 警告: PI-Ingesterコンテナが停止しています" >> $LOG_FILE
fi

# ディスク使用量確認
DISK_USAGE=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
  echo "[$TIMESTAMP] 警告: ディスク使用量が ${DISK_USAGE}% です" >> $LOG_FILE
fi

# 最新データファイル確認
LATEST_FILE=$(ls -t static_equipment_data/*.csv 2>/dev/null | head -1)
if [ -n "$LATEST_FILE" ]; then
  LAST_MODIFIED=$(stat -c %Y "$LATEST_FILE")
  CURRENT_TIME=$(date +%s)
  AGE_HOURS=$(( (CURRENT_TIME - LAST_MODIFIED) / 3600 ))
  
  if [ $AGE_HOURS -gt 2 ]; then
    echo "[$TIMESTAMP] 警告: 最新データが ${AGE_HOURS} 時間前です" >> $LOG_FILE
  fi
fi

# PI-Ingester状態確認
if [ -f "logs/ingester-state.json" ]; then
  ERROR_COUNT=$(grep -o '"errorCount":[0-9]*' logs/ingester-state.json | cut -d':' -f2 | head -1)
  if [ "$ERROR_COUNT" -gt 5 ]; then
    echo "[$TIMESTAMP] 警告: PI-Ingesterエラー数が ${ERROR_COUNT} です" >> $LOG_FILE
  fi
fi

echo "[$TIMESTAMP] システム監視完了" >> $LOG_FILE
