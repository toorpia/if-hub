# PI Batch Ingester 手動テストガイド

PI Batch Ingesterの機能をMock PI-APIサーバーを使用して手動テストする手順です。

## 🎯 テスト目標

1. PI Batch Ingesterが正常に動作することを確認
2. Mock PI-APIからのデータ取得を検証
3. CSV出力が正しいフォーマットで生成されることを確認

## 📋 事前準備

### 必要な環境

- Python 3.7以上
- Node.js（Mock PI-APIサーバー用）
- 2つのターミナル

### ディレクトリ構成確認

```
test/
├── configs/
│   └── equipments/7th-untan/config.yaml     # 設備設定
├── mock-pi-api/
│   ├── server.js                            # Mock PI-APIサーバー
│   └── package.json
└── manual-test-guide.md                     # このファイル

ingester/tools/
├── pi-batch-ingester.py                     # テスト対象スクリプト
├── equipment.yaml                           # スタンドアロン用設備設定
└── README.md
```

## 🚀 テスト実行手順

### ステップ1: Mock PI-APIサーバーの起動

**ターミナル1で実行:**

```bash
# Mock PI-APIサーバーのディレクトリに移動
cd test/mock-pi-api

# 依存関係の確認（初回のみ）
npm install

# Mock PI-APIサーバーを起動
npm start
```

**期待される出力:**
```
============================================================
🏭 Mock PI-API Server Started
📡 Listening on port 3011
🌐 Health check: http://localhost:3011/health
📋 API info: http://localhost:3011/
============================================================
```

### ステップ2: Mock PI-APIサーバーの動作確認

**ターミナル2で実行:**

```bash
# ヘルスチェック
curl http://localhost:3011/health

# API情報の確認
curl http://localhost:3011/

# サンプルデータ取得テスト
curl "http://localhost:3011/PIData?TagNames=POW:711034.PV,POW:7T105B1.PV&StartDate=20250604120000&EndDate=20250604130000"
```

**期待される結果:**
- ヘルスチェック: JSON レスポンス `{"status":"OK",...}`
- APIサンプル: CSV形式のデータが返される

### ステップ3: PI Batch Ingesterの実行

**ターミナル2で実行:**

```bash
# PI Batch Ingesterのディレクトリに移動
cd ingester/tools

# テスト実行（1時間分のデータ）
python3 pi-batch-ingester.py \
  -c ../../test/configs/equipments/7th-untan/config.yaml \
  --host 127.0.0.1 \
  --port 3011 \
  -s "2025-06-04 12:00:00" \
  -e "2025-06-04 13:00:00" \
  -o "./test-output.csv" \
  -v

# 短期間テスト（10分間）
python3 pi-batch-ingester.py \
  -c ../../test/configs/equipments/7th-untan/config.yaml \
  --host 127.0.0.1 \
  --port 3011 \
  -s "2025-06-04 12:00:00" \
  -e "2025-06-04 12:10:00" \
  -o "./test-short.csv"
```

**期待される出力:**
```
🏭 PI Batch Ingester
   Equipment: 7th-untan
   Period: 2025-06-04 12:00:00 to 2025-06-04 13:00:00
   Output: ./test-output.csv
   Tags: 2 tags

🔄 PI-API Request:
   URL: http://127.0.0.1:3011/PIData
   TagNames: POW:711034.PV,POW:7T105B1.PV
   StartDate: 20250604120000
   EndDate: 20250604130000
   Attempt 1/2...
✅ PI-API fetch successful: X data rows

💾 CSV saved: ./test-output.csv
   Data rows: X
   File size: XXX bytes

✅ Batch processing completed successfully!
```

### ステップ4: 結果の確認

```bash
# 出力ファイルの確認
ls -la *.csv

# ファイル内容の表示（先頭10行）
head -10 test-output.csv

# ファイル内容の表示（CSV形式として）
cat test-output.csv
```

**期待されるCSVフォーマット:**
```csv
Timestamp,POW:711034.PV,POW:7T105B1.PV
2025-06-04 12:00:00,60.45,125.67
2025-06-04 12:10:00,61.23,126.89
...
```

## ✅ テスト成功の判定基準

### 1. Mock PI-APIサーバー
- [x] ポート3011でリッスン開始
- [x] ヘルスチェックが成功
- [x] サンプルデータ取得が成功

### 2. PI Batch Ingester
- [x] 設定ファイルの読み込み成功
- [x] PI-APIへのリクエスト成功
- [x] CSVファイルの生成成功
- [x] エラーなく完了

### 3. CSV出力
- [x] 正しいファイル名で出力
- [x] CSVヘッダーが存在（Timestamp + タグ名）
- [x] データ行が存在
- [x] 数値データが適切な形式

## 🔧 トラブルシューティング

### Mock PI-APIサーバーが起動しない

```bash
# ポート使用状況の確認
lsof -i :3011

# Node.jsの確認
node --version
npm --version
```

### PI Batch Ingesterでエラーが発生

```bash
# Pythonバージョンの確認
python3 --version

# 詳細エラー表示
python3 pi-batch-ingester.py [...] -v
```

### 設定ファイルエラー

```bash
# 設定ファイルの確認
cat ../../test/configs/equipments/7th-untan/config.yaml

# スタンドアロン設定ファイルの確認
cat equipment.yaml
```

## 🧹 テスト後のクリーンアップ

```bash
# Mock PI-APIサーバーの停止（ターミナル1でCtrl+C）

# テスト用出力ファイルの削除
rm -f ingester/tools/test-*.csv
```

## 📊 追加テストケース

### エラーハンドリングテスト

```bash
# Mock PI-APIを停止した状態でのテスト（接続エラー）
python3 pi-batch-ingester.py \
  -c ../../test/configs/equipments/7th-untan/config.yaml \
  --host 127.0.0.1 \
  --port 3011 \
  -s "2025-06-04 12:00:00" \
  -e "2025-06-04 13:00:00"
```

### 大量データテスト

```bash
# 1日分のデータ取得テスト（大量データ警告の確認）
python3 pi-batch-ingester.py \
  -c ../../test/configs/equipments/7th-untan/config.yaml \
  --host 127.0.0.1 \
  --port 3011 \
  -s "2025-01-01" \
  -e "2025-12-31"
```

### スタンドアロン設定ファイルのテスト

```bash
# equipment.yamlを使用したテスト
python3 pi-batch-ingester.py \
  -c equipment.yaml \
  --host 127.0.0.1 \
  --port 3011 \
  -s "2025-06-04 14:00:00" \
  -e "2025-06-04 14:10:00" \
  -o "./standalone-test.csv"
```

---

このテストガイドに従って、PI Batch Ingesterの基本機能を包括的に検証できます。
