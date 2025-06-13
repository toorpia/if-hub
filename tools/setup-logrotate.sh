#!/bin/bash
# ログローテーション設定作成スクリプト

CURRENT_DIR=$(pwd)

cat > if-hub-logrotate << LOGROTATE_EOF
${CURRENT_DIR}/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    copytruncate
    create 644 root root
}

${CURRENT_DIR}/system_monitor.log {
    weekly
    missingok
    rotate 12
    compress
    delaycompress
    copytruncate
    create 644 root root
}
LOGROTATE_EOF

echo "✅ ログローテーション設定を作成しました: if-hub-logrotate"
echo ""
echo "システムのlogrotateに追加するには:"
echo "sudo cp if-hub-logrotate /etc/logrotate.d/"
echo ""
echo "手動でテストするには:"
echo "sudo logrotate -d if-hub-logrotate"
