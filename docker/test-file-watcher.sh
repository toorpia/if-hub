#!/bin/bash

# Docker環境でのファイル監視機能をテストするスクリプト

# コンテナ名
CONTAINER_NAME="datastream-hub"

# 必要なディレクトリが存在することを確認
mkdir -p pi_data
mkdir -p db

echo "=== DataStream Hub ファイル監視テスト ==="
echo "このスクリプトはDockerコンテナでのファイル監視機能をテストします"
echo ""

# Docker Compose でコンテナを起動
echo "1. Dockerコンテナを起動します..."
docker-compose up -d

# コンテナの起動を待機
echo "   コンテナの起動を待機中..."
sleep 5

# ログを表示して起動状況を確認
echo "2. 起動ログを確認します..."
docker-compose logs

echo ""
echo "3. APIが応答するまで待機します..."
for i in {1..12}; do
  echo "   試行 $i/12..."
  if curl -s "http://localhost:3001/api/status" > /dev/null; then
    echo "   API サーバーが応答しています"
    break
  fi
  
  if [ $i -eq 12 ]; then
    echo "   タイムアウト: API サーバーが応答しません"
    echo "   ログを確認してください: docker-compose logs"
    exit 1
  fi
  
  sleep 5
done

echo ""
echo "4. タグ一覧を確認します..."
curl -s "http://localhost:3001/api/tags" | jq . || echo "jqがインストールされていないため、JSON出力が整形されません"

echo ""
echo "5. テスト用CSVファイルを作成します..."
cat > ../pi_data/Test01.csv << EOL
datetime,Temperature,Pressure
2024-01-01 00:00:00,24.5,101.3
2024-01-01 01:00:00,25.1,101.5
2024-01-01 02:00:00,24.8,101.2
EOL

echo "   テストCSVファイルを作成しました: pi_data/Test01.csv"

echo ""
echo "6. ファイル監視処理を待機中 (90秒)..."
echo "   1分間隔のファイル監視が少なくとも1回実行されるまで待機します"
sleep 90

echo ""
echo "7. コンテナのログを確認します..."
docker-compose logs --tail 50

echo ""
echo "8. 新しいタグがAPIで利用可能か確認します..."
curl -s "http://localhost:3001/api/tags" | jq . || echo "jqがインストールされていないため、JSON出力が整形されません"

echo ""
echo "9. Test01.Temperatureのデータを確認します..."
curl -s "http://localhost:3001/api/data/Test01.Temperature" | jq . || echo "jqがインストールされていないため、JSON出力が整形されません"

echo ""
echo "10. さらにCSVファイルを追加します..."
cat > ../pi_data/Test02.csv << EOL
datetime,Humidity,AirQuality
2024-01-01 00:00:00,65.2,95
2024-01-01 01:00:00,67.5,92
2024-01-01 02:00:00,68.1,91
EOL

echo "   テストCSVファイル2を作成しました: pi_data/Test02.csv"

echo ""
echo "11. ファイル監視処理を待機中 (90秒)..."
echo "    1分間隔のファイル監視が少なくとも1回実行されるまで待機します"
sleep 90

echo ""
echo "12. コンテナのログを確認します..."
docker-compose logs --tail 50

echo ""
echo "13. 新しいタグがAPIで利用可能か確認します..."
curl -s "http://localhost:3001/api/tags" | jq . || echo "jqがインストールされていないため、JSON出力が整形されません"

echo ""
echo "14. Test02.Humidityのデータを確認します..."
curl -s "http://localhost:3001/api/data/Test02.Humidity" | jq . || echo "jqがインストールされていないため、JSON出力が整形されません"

echo ""
echo "15. 既存のCSVファイルを更新します..."
cat > ../pi_data/Test01.csv << EOL
datetime,Temperature,Pressure,FlowRate
2024-01-01 00:00:00,24.5,101.3,120.5
2024-01-01 01:00:00,25.1,101.5,121.2
2024-01-01 02:00:00,24.8,101.2,119.8
2024-01-01 03:00:00,25.3,101.4,120.1
EOL

echo "   Test01.csvを更新しました（新しい列とデータポイントを追加）"

echo ""
echo "16. ファイル監視処理を待機中 (90秒)..."
echo "    1分間隔のファイル監視が少なくとも1回実行されるまで待機します"
sleep 90

echo ""
echo "17. コンテナのログを確認します..."
docker-compose logs --tail 50

echo ""
echo "18. 更新されたタグデータを確認します..."
curl -s "http://localhost:3001/api/data/Test01.FlowRate" | jq . || echo "jqがインストールされていないため、JSON出力が整形されません"

echo ""
echo "19. チェックサムファイルを確認します..."
ls -la ../db/file_checksums.json || echo "チェックサムファイルが見つかりません"
cat ../db/file_checksums.json || echo "チェックサムファイルの内容を表示できません"

echo ""
echo "=== テスト完了 ==="
echo "ファイル監視機能のテストが完了しました。"
echo "必要に応じてDockerコンテナを停止してください: docker-compose down"
