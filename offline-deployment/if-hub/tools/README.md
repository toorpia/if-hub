# PI Batch Ingester

PI SystemからのプロセスデータをCSV形式で一括取得する独立したバッチ処理ツールです。

## 概要

PI Batch IngesterはIF-Hub PI-Ingesterサービスとは独立して動作し、指定した期間のプロセスデータを一度に取得できます。顧客先での初期データ移行や、運用中のデータ補完に活用できます。

## 特徴

- **独立動作**: PI-Ingesterサービスを停止することなく実行可能
- **設定ファイル共通**: 既存のconfig.yamlファイルを再利用
- **柔軟な期間指定**: 日付のみから詳細な時刻まで対応
- **出力先指定**: デフォルトまたはカスタムパスに出力可能
- **エラーハンドリング**: リトライ機能と詳細なエラー表示

## インストール

### 前提条件

- Python 3.7以上（Ubuntu 22.04 LTS標準）
- PI-API-Serverへのアクセス

### 依存関係

**外部ライブラリは不要です！** Python標準ライブラリのみで動作します。

ネットワーク隔絶環境でも即座に利用可能です。

## 使用方法

### 基本的な使用例

```bash
# 基本的なデータ取得（デフォルト出力: ./equipment.csv）
python pi-batch-ingester.py -c equipment.yaml --host 10.255.234.21 --port 3011 -s "2025-01-01" -e "2025-01-31"

# 時刻を含む詳細指定
python pi-batch-ingester.py -c equipment.yaml --host 10.255.234.21 --port 3011 -s "2025-01-01 08:00:00" -e "2025-01-01 17:00:00"

# カスタム出力ファイル
python pi-batch-ingester.py -c equipment.yaml --host 10.255.234.21 --port 3011 -s "2025-01-01" -e "2025-01-31" -o "./backup/historical-data.csv"

# 詳細設定（タイムアウト・リトライ）
python pi-batch-ingester.py -c equipment.yaml --host 10.255.234.21 --port 3011 --timeout 60000 --retries 5 -s "2025-01-01" -e "2025-01-31"
```

### コマンドラインオプション

| オプション | 短縮形 | 必須 | 説明 |
|-----------|--------|-----|------|
| `--config` | `-c` | ✅ | 設備設定ファイルのパス（相対パス/絶対パス） |
| `--host` | | ✅ | PI-API-Serverのホスト名またはIPアドレス |
| `--port` | | ✅ | PI-API-Serverのポート番号 |
| `--start` | `-s` | ✅ | 開始日時 |
| `--end` | `-e` | ✅ | 終了日時 |
| `--output` | `-o` | ❌ | 出力CSVファイルパス（デフォルト: `./{設備名}.csv`） |
| `--timeout` | | ❌ | リクエストタイムアウト（ミリ秒、デフォルト: 30000） |
| `--retries` | | ❌ | 最大リトライ回数（デフォルト: 3） |
| `--retry-interval` | | ❌ | リトライ間隔（ミリ秒、デフォルト: 5000） |
| `--verbose` | `-v` | ❌ | 詳細ログ出力 |

### 日時形式

以下の形式がサポートされています：

- `2025-01-01`（日付のみ、時刻は00:00:00）
- `2025-01-01 12:30:00`（日付と時刻）
- `2025-01-01T12:30:00`（ISO形式）
- `2025-01-01 12:30`（秒省略）
- `2025-01-01T12:30`（ISO形式、秒省略）

## 運用シナリオ

### 1. 初期データ移行（推奨運用フロー）

**IF-Hub + PI-Ingesterサービス起動前の初期データ取り込み**

顧客先でのシステム導入時の推奨手順：

```bash
# ステップ1: 過去30日分の初期データを取得
python pi-batch-ingester.py \
  --config ../configs/equipments/7th-untan/config.yaml \
  --host 10.255.234.21 \
  --port 3011 \
  --start "$(date -d '30 days ago' '+%Y-%m-%d')" \
  --end "$(date '+%Y-%m-%d')" \
  --output ../static_equipment_data/7th-untan.csv

# ステップ2: データ確認
head -5 ../static_equipment_data/7th-untan.csv
wc -l ../static_equipment_data/7th-untan.csv

# ステップ3: サービス起動（親ディレクトリで実行）
cd .. && ./setup.sh
```

**複数設備の一括初期データ取り込み**

```bash
#!/bin/bash
# 全設備の初期データ取り込みスクリプト

PI_HOST="10.255.234.21"
PI_PORT="3011"
START_DATE="$(date -d '30 days ago' '+%Y-%m-%d')"
END_DATE="$(date '+%Y-%m-%d')"

echo "初期データ取り込み開始: $START_DATE から $END_DATE"

for config_file in ../configs/equipments/*/config.yaml; do
  equipment_name=$(basename $(dirname $config_file))
  echo "処理中: $equipment_name"
  
  python pi-batch-ingester.py \
    --config "$config_file" \
    --host "$PI_HOST" \
    --port "$PI_PORT" \
    --start "$START_DATE" \
    --end "$END_DATE" \
    --output "../static_equipment_data/${equipment_name}.csv"
  
  # PI-Serverへの負荷軽減のため間隔をあける
  sleep 5
done

echo "全設備の初期データ取り込み完了"
ls -la ../static_equipment_data/
```

### 2. 大量データの分割処理

長期間のデータを安全に取り込む場合：

```bash
#!/bin/bash
# 3ヶ月分のデータを月単位で分割取り込み

CONFIG_FILE="../configs/equipments/7th-untan/config.yaml"
PI_HOST="10.255.234.21"
PI_PORT="3011"
START_DATE="2025-01-01"

for month in {1..3}; do
  month_start=$(date -d "$START_DATE +$((month-1)) month" '+%Y-%m-01')
  month_end=$(date -d "$month_start +1 month -1 day" '+%Y-%m-%d')
  
  echo "取り込み中: $month_start から $month_end"
  
  python pi-batch-ingester.py \
    --config "$CONFIG_FILE" \
    --host "$PI_HOST" \
    --port "$PI_PORT" \
    --start "$month_start" \
    --end "$month_end" \
    --output "../static_equipment_data/7th-untan_${month_start:0:7}.csv"
    
  sleep 10  # PI-Serverへの負荷軽減
done

# 個別ファイルを統合
cd ../static_equipment_data
cat 7th-untan_20*.csv > 7th-untan.csv
rm 7th-untan_20*.csv
```

### 3. データ補完

運用中にデータ欠損が発生した場合の補完：

```bash
# 特定期間のデータを補完
python pi-batch-ingester.py \
  --config ../configs/equipments/7th-untan/config.yaml \
  --host 10.255.234.21 \
  --port 3011 \
  --start "2025-02-15 10:00:00" \
  --end "2025-02-15 14:00:00" \
  --output "./補完/7th-untan-0215.csv"
```

### 4. 定期バックアップ

月次や週次でのデータバックアップ：

```bash
# 月次バックアップ
python pi-batch-ingester.py \
  --config ../configs/equipments/7th-untan/config.yaml \
  --host 10.255.234.21 \
  --port 3011 \
  --start "2025-01-01" \
  --end "2025-01-31" \
  --output "./backup/202501/7th-untan.csv"
```

### 5. データ品質確認

取り込み後のデータ品質チェック：

```bash
#!/bin/bash
# データ品質確認スクリプト

CSV_FILE="../static_equipment_data/7th-untan.csv"

if [ -f "$CSV_FILE" ]; then
  echo "=== データ品質確認: $CSV_FILE ==="
  echo "行数: $(wc -l < "$CSV_FILE")"
  echo "サイズ: $(du -h "$CSV_FILE" | cut -f1)"
  
  # 時刻範囲確認
  echo "時刻範囲:"
  echo "  開始: $(head -2 "$CSV_FILE" | tail -1 | cut -d',' -f1)"
  echo "  終了: $(tail -1 "$CSV_FILE" | cut -d',' -f1)"
  
  # 欠損値チェック
  empty_count=$(grep -c ',,\|^,\|,$' "$CSV_FILE" 2>/dev/null || echo 0)
  echo "空データ: $empty_count 箇所"
  
  # ヘッダー確認
  echo "ヘッダー:"
  head -1 "$CSV_FILE"
else
  echo "ファイルが存在しません: $CSV_FILE"
fi
```

## 設定ファイル

### 設備設定ファイル

設備設定ファイル1つだけで完結します：

```yaml
basemap:
  source_tags:              # 取得対象のPIタグ
    - "POW:711034.PV"
    - "POW:7T105B1.PV"

pi_integration:
  enabled: true             # PI連携が有効である必要があります
```

### PI-API接続情報

PI-API接続情報はコマンドラインオプションで指定します：

```bash
# 基本的な接続設定
--host 10.255.234.21       # PI-API-Serverのホスト
--port 3011                # PI-API-Serverのポート

# オプション設定（デフォルト値あり）
--timeout 30000            # タイムアウト（ミリ秒）
--retries 3                # 最大リトライ回数
--retry-interval 5000      # リトライ間隔（ミリ秒）
```

## 出力形式

取得したデータはCSV形式で出力されます：

```csv
Timestamp,POW:711034.PV,POW:7T105B1.PV
2025-01-01 00:00:00,54.83,136.08
2025-01-01 00:10:00,55.12,137.45
...
```

## エラーハンドリング

### よくあるエラーと対処法

#### 1. 設定ファイルが見つからない

```
❌ Error: Equipment config file not found: ../configs/equipments/plant01/config.yaml
```

**対処法**: 設定ファイルのパスを確認してください。

#### 2. PI連携が無効

```
❌ Error: PI integration is disabled in ../configs/equipments/plant01/config.yaml
```

**対処法**: 設定ファイルで `pi_integration.enabled: true` を設定してください。

#### 3. PI-API接続エラー

```
❌ Attempt 3 failed: No response from server: Connection error
```

**対処法**: 
- PI-API-Serverが起動しているか確認
- `configs/common.yaml`のホスト・ポート設定を確認
- ネットワーク接続を確認

#### 4. 日時形式エラー

```
❌ Error: Invalid datetime format: 2025/01/01
```

**対処法**: サポートされている日時形式を使用してください（例: `2025-01-01`）。

## 安全機能

### 大量データ警告

365日を超える期間を指定した場合、確認プロンプトが表示されます：

```
Large date range detected (400 days). Continue? [y/N]:
```

### データ検証

- 開始日時が終了日時より後の場合はエラー
- 設定ファイルの構文チェック
- PI-API応答の妥当性チェック

## パフォーマンス

### 推奨事項

- **期間**: 大量データ取得時は期間を分割することを推奨
- **タグ数**: 多数のタグを同時取得する場合は、PI-API-Serverの負荷に注意
- **ネットワーク**: 安定したネットワーク環境での実行を推奨

### ベンチマーク例

- **1日分（2タグ）**: 約5秒
- **1週間分（2タグ）**: 約15秒
- **1ヶ月分（2タグ）**: 約45秒

※実際の時間は、PI-API-Serverの性能とネットワーク環境によって変動します。

## トラブルシューティング

### デバッグモード

詳細なログが必要な場合は、Pythonの`-v`オプションを使用：

```bash
python -v pi-batch-ingester.py --config ../configs/equipments/7th-untan/config.yaml --start "2025-01-01" --end "2025-01-02"
```

### 接続テスト

PI-API-Serverへの接続をテスト：

```bash
curl "http://10.255.234.21:3011/PIData?TagNames=POW:711034.PV&StartDate=20250101000000&EndDate=20250101010000"
```

---

# IF-Hub Fetcher

IF-Hubからプロセスデータを抽出してCSV形式で保存するスタンドアロンツールです。

## 概要

IF-Hub Fetcherは、稼働中のIF-Hubサーバーからデータを抽出する下流処理ツールです。IF-Hubに蓄積されたデータをCSV形式で出力し、バックアップや外部システム連携に活用します。

## ツールの位置づけ

```
PI System → [PI Ingester] → IF-Hub → [IF-Hub Fetcher] → CSV
    ↑           上流処理         ↑         下流処理        ↓
 データ源     データ投入      データ蓄積    データ抽出    外部出力
```

| ツール | データの流れ | 用途 |
|--------|-------------|------|
| **PI Batch Ingester** | PI System → CSV | PI Systemからの直接データ取得 |
| **PI Ingester** | PI System → IF-Hub | 継続的なデータ投入（上流処理） |
| **IF-Hub Fetcher** | IF-Hub → CSV | データ抽出・バックアップ（下流処理） |

## 使用方法

### 基本的な使用例

```bash
# IF-Hubからデータを抽出
./if-hub-fetcher --equipment Pump01 --start-date 202501010900

# 期間指定でデータを抽出
./if-hub-fetcher --equipment Pump01 --start-date 202501010900 --end-date 202501011700

# 複数設備の一括取得
./if-hub-fetcher --equipment Pump01,Tank01 --start-date 202501010900 --end-date 202501011700

# リモートIF-Hubサーバーからの取得
./if-hub-fetcher --equipment Pump01 --start-date 202501010900 --host 192.168.1.100 --port 3001

# カスタム出力先
./if-hub-fetcher --equipment Pump01 --start-date 202501010900 --output-dir ./backup
```

### コマンドラインオプション

| オプション | 短縮形 | 必須 | 説明 |
|-----------|--------|-----|------|
| `--equipment` | `-e` | ✅ | 設備名（カンマ区切りで複数指定可能） |
| `--start-date` | `-s` | ✅ | 開始日時（YYYYMMDDHHmm形式） |
| `--end-date` | `-n` | ❌ | 終了日時（省略時は最新データまで） |
| `--host` | | ❌ | IF-HubのホストIP/ドメイン（デフォルト: localhost） |
| `--port` | `-p` | ❌ | IF-Hubのポート番号（デフォルト: 3001） |
| `--output-dir` | `-o` | ❌ | CSV出力先ディレクトリ（デフォルト: .） |
| `--verbose` | `-v` | ❌ | 詳細ログを出力 |

### 日時形式

YYYYMMDDHHmm形式（12桁）で指定します：

- `202501010900` = 2025年1月1日 09:00
- `202501311700` = 2025年1月31日 17:00

## 運用シナリオ

### 1. データバックアップ

IF-Hubからの定期バックアップ：

```bash
# 月次バックアップ
./if-hub-fetcher --equipment Pump01 \
  --start-date 202501010000 \
  --end-date 202501312359 \
  --output-dir ./backup/202501
```

### 2. 外部システム連携

他システムへのデータ提供：

```bash
# 分析システム向けデータ抽出
./if-hub-fetcher --equipment Pump01,Tank01 \
  --start-date 202501150800 \
  --end-date 202501151800 \
  --output-dir ./export_data
```

### 3. レポート作成

定期レポート用データの抽出：

```bash
# 日次レポート用データ
./if-hub-fetcher --equipment Pump01 \
  --start-date $(date -d 'yesterday' '+%Y%m%d0000') \
  --end-date $(date -d 'yesterday' '+%Y%m%d2359') \
  --output-dir ./reports
```

## 出力形式

データはCSV形式で出力され、ファイル名は自動生成されます：

```
{設備名}_{開始日時}-{終了日時}.csv
```

例：
- `Pump01_20250101_000000-20250131_235900.csv`
- `Tank01_20250115_080000-20250115_180000.csv`

## エラーハンドリング

### よくあるエラーと対処法

#### 1. IF-Hub接続エラー

```
❌ Error: Failed to connect to IF-Hub server
```

**対処法**:
- IF-Hubコンテナが起動しているか確認
- ホスト・ポート設定を確認

#### 2. 設備が見つからない

```
❌ Error: Equipment 'Plant01' not found
```

**対処法**:
- 設備名を確認
- IF-Hubに該当設備のデータが存在するか確認

#### 3. 日時形式エラー

```
❌ Error: Invalid datetime format
```

**対処法**:
- YYYYMMDDHHmm形式（12桁）で指定

## ヘルプとバージョン

```bash
# ヘルプ表示
./if-hub-fetcher --help

# バージョン確認
./if-hub-fetcher --version
```

## 注意事項

1. **IF-Hub起動必須**: IF-Hubサーバーが稼働している必要があります
2. **下流処理**: IF-Hubに蓄積済みのデータを抽出します
3. **ローカル時間**: 入力・出力ともにローカル時間を使用します

## ライセンス

このツールはIF-HUBプロジェクトの一部です。
