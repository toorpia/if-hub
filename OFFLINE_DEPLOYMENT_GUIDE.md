# IF-Hub オフライン環境移行

IF-Hubシステムをネットワーク接続のない顧客環境に移行するためのツールです。

## 必要な環境

**開発環境（作業開始場所）:**
- Docker稼働中
- IF-Hubコンテナ起動済み

**顧客環境（移行先）:**
- Docker利用可能
- ネットワーク接続不要

## 作業手順

### ステップ1: パッケージ作成（開発環境）

```bash
./offline-deployment/deployment-tools/create-package.sh
```

**実行結果:**
- `offline-deployment/if-hub-container.tgz` または `offline-deployment/if-hub-application.tgz` が生成
- ファイルサイズにより自動判定（28MB〜250MB）

### ステップ2: ファイル転送

生成されたパッケージファイル（.tgz）を顧客環境に転送してください。

### ステップ3: 顧客環境でのセットアップ

#### 3-1. パッケージ展開

```bash
tar -xzf if-hub-*.tgz
cd if-hub
```

#### 3-2. PI接続設定

```bash
./configure-pi.sh
```

**対話で設定する項目:**
- PI-API-Serverのホスト（IPアドレス）
- PI-API-Serverのポート番号
- 設備設定（必要に応じて）

#### 3-3. システム起動

```bash
./setup.sh
```

**起動時の処理:**
- Dockerコンテナのインポート
- データベース初期化（新規環境の場合）
- サービス起動

#### 3-4. 動作確認

```bash
# コンテナ状態確認
docker ps | grep if-hub

# ブラウザアクセス
# http://localhost:3001
```

## 追加作業（必要に応じて）

### 初期データ取り込み

```bash
# 過去データの一括取り込み（例：30日分）
./tools/pi-batch-ingester.py \
  --config configs/equipments/{設備名}/config.yaml \
  --host {PI-API-ServerのIP} \
  --port {PI-API-Serverのポート} \
  --start "$(date -d '30 days ago' '+%Y-%m-%d')" \
  --end "$(date '+%Y-%m-%d')"
```

### システム監視

```bash
./tools/check-system.sh
```

## トラブルシューティング

### コンテナが起動しない

```bash
# ログ確認
docker logs if-hub
docker logs if-hub-pi-ingester

# 手動起動テスト
docker compose up
```

### PI接続エラー

```bash
# 設定再実行
./configure-pi.sh

# 接続テスト
ping {PI-API-ServerのIP}
```

### データが表示されない

```bash
# 状態確認
ls -la static_equipment_data/
cat logs/ingester-state.json

# サービス再起動
docker compose restart
```

## 詳細情報

### バッチツールの使用方法
[`tools/README.md`](offline-deployment/if-hub/tools/README.md) を参照

### 設定ファイルの編集
- **PI接続**: `configs/common.yaml`
- **設備設定**: `configs/equipments/{設備名}/config.yaml`

### 運用スクリプト
- `tools/check-system.sh` - 動作確認
- `tools/monitor-system.sh` - システム監視
- `tools/initial-data-import.sh` - 初期データ取り込み

## プラグインシステムの運用

IF-HUBプラグインシステムは、設備固有のデータ解析や外部システム連携を行うための拡張機能です。オフライン環境での完全動作を前提として設計されています。

### プラグインシステムの初期確認

#### ディレクトリ構造の確認

```bash
# プラグインシステムのディレクトリ構造確認
ls -la plugins/
ls -la plugins/venvs/analyzers/

# 仮想環境の動作確認
plugins/venvs/analyzers/toorpia_backend/bin/python --version

# 実行権限の確認
test -x plugins/venvs/analyzers/toorpia_backend/bin/python && echo "実行可能" || echo "権限エラー"
```

#### 利用可能プラグインの確認

```bash
# 利用可能なプラグインの一覧表示
python3 plugins/run_plugin.py list

# スケジュール機能対応プラグインの確認
python3 plugins/schedule_plugin.py --list

# 特定タイプのプラグインのみ表示
python3 plugins/run_plugin.py list --type analyzer
```

### プラグインの基本操作

#### 設定ファイルの検証

プラグインを実行する前に、設定ファイルの妥当性を確認します。

```bash
# 設定ファイルのバリデーション
python3 plugins/run_plugin.py validate \
  --type analyzer \
  --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml
```

#### プラグインの実行

プラグインを実行する際は、実行モードの指定が必須です。

##### 基盤マップ更新（basemap_update）

設備の正常状態パターンを学習するモードです。

```bash
# 基盤マップ更新の実行
python3 plugins/run_plugin.py run \
  --type analyzer \
  --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode basemap_update
```

**用途**: 
- 基盤マップの生成・更新
- 設備の正常状態パターンの学習

**実行頻度**: 
- 低頻度（週1回程度）
- データが蓄積された後の実行推奨

**データ範囲**: 
- 過去10日〜30日分のデータを使用

##### 追加プロット・異常検知（addplot_update）

現在のデータを基盤マップと比較して異常度を算出するモードです。

```bash
# 異常検知の実行
python3 plugins/run_plugin.py run \
  --type analyzer \
  --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode addplot_update
```

**用途**: 
- リアルタイム異常検知
- 現在データの評価

**実行頻度**: 
- 高頻度（10分〜1時間間隔）
- 継続監視に適している

**データ範囲**: 
- 過去2時間分のデータを使用

#### 詳細ログ付き実行

```bash
# 詳細ログを出力して実行
python3 plugins/run_plugin.py run \
  --type analyzer \
  --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode addplot_update \
  --verbose
```

### プラグイン自動実行の設定

#### スケジュール管理ツールの使用（推奨）

プラグインの自動実行は、スケジュール管理ツールを使用することを推奨します。

##### スケジュールの初期セットアップ

```bash
# プラグインスケジュールの自動セットアップ
python3 plugins/schedule_plugin.py --setup --type analyzer --name toorpia_backend
```

##### スケジュール状況の確認

```bash
# スケジュール状況の表示
python3 plugins/schedule_plugin.py --status --type analyzer --name toorpia_backend
```

##### 新規設備のスケジュール追加

```bash
# 新しい設備のスケジュール追加
python3 plugins/schedule_plugin.py --add --config configs/equipments/new-equipment/config.yaml
```

##### スケジュールの有効化・無効化

```bash
# スケジュールの無効化
python3 plugins/schedule_plugin.py --disable --type analyzer --name toorpia_backend

# スケジュールの有効化
python3 plugins/schedule_plugin.py --enable --type analyzer --name toorpia_backend

# スケジュールの削除
python3 plugins/schedule_plugin.py --remove --type analyzer --name toorpia_backend
```

#### 手動cron設定

スケジュール管理ツールを使用しない場合の手動設定方法です。

```bash
# crontab の編集
crontab -e

# 基盤マップ更新：毎週日曜日の午前2時に実行
0 2 * * 0 cd /path/to/if-hub && python3 plugins/run_plugin.py run \
  --type analyzer --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode basemap_update >> logs/plugin_cron.log 2>&1

# 異常検知：10分間隔で実行
*/10 * * * * cd /path/to/if-hub && python3 plugins/run_plugin.py run \
  --type analyzer --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode addplot_update >> logs/plugin_cron.log 2>&1
```

#### 複数設備の一括実行スクリプト

```bash
#!/bin/bash
# 全設備に対してプラグイン実行
for config in configs/equipments/*/config.yaml; do
  equipment_name=$(basename $(dirname "$config"))
  echo "$(date): Processing equipment: $equipment_name"
  
  python3 plugins/run_plugin.py run \
    --type analyzer \
    --name toorpia_backend \
    --config "$config" \
    --mode addplot_update \
    >> "logs/batch_plugin_${equipment_name}.log" 2>&1
    
  if [ $? -eq 0 ]; then
    echo "$(date): $equipment_name - SUCCESS"
  else
    echo "$(date): $equipment_name - FAILED"
  fi
done
```

### 実行結果の確認

#### ログの確認

```bash
# プラグイン実行ログの確認
tail -f logs/7th-untan/toorpia_analyzer.log

# cron実行ログの確認
tail -f logs/plugin_cron.log

# 異常検知結果の確認
grep -E "(ABNORMAL|abnormal)" logs/7th-untan/toorpia_analyzer.log
```

#### 実行状況の監視

```bash
# プラグイン実行状況をリアルタイム監視
watch -n 30 'tail -5 logs/plugin_cron.log'

# システムリソースの確認
top -p $(pgrep -f "run_plugin.py")
```

### トラブルシューティング

#### 「pandasライブラリが足りない」エラー

**症状**: `ModuleNotFoundError: No module named 'pandas'`

**原因**: システムのpythonを直接使用している

**解決方法**: プラグインランナーを使用する

```bash
# ❌ 間違った実行方法（エラーが発生）
python plugins/analyzers/toorpia_backend/run.py configs/equipments/7th-untan/config.yaml

# ✅ 正しい実行方法（自動的に仮想環境を使用）
python3 plugins/run_plugin.py run \
  --type analyzer \
  --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode addplot_update
```

#### 実行モード指定エラー

**症状**: `run.py: error: the following arguments are required: --mode`

**原因**: 実行モードが指定されていない

**解決方法**: 適切なモードを指定する

```bash
# エラーの例
python3 plugins/run_plugin.py run \
  --type analyzer \
  --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml
# ↑ --mode が不足

# 正しい実行方法
python3 plugins/run_plugin.py run \
  --type analyzer \
  --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode addplot_update  # または basemap_update
```

#### 仮想環境関連エラー

**症状**: `Permission denied` または `No such file or directory`

**解決方法**: 仮想環境の確認と権限設定

```bash
# 仮想環境の存在確認
ls -la plugins/venvs/analyzers/toorpia_backend/

# 実行権限の設定
chmod +x plugins/venvs/analyzers/toorpia_backend/bin/python
chmod +x plugins/venvs/analyzers/toorpia_backend/bin/pip

# パッケージインストール状況の確認
plugins/venvs/analyzers/toorpia_backend/bin/pip list | grep -E "(pandas|requests|yaml)"
```

#### スケジュール管理エラー

**症状**: スケジュール設定やcron関連エラー

**解決方法**: スケジュール管理ツールの確認

```bash
# スケジュール対応プラグインの確認
python3 plugins/schedule_plugin.py --list

# スケジュール状況の確認
python3 plugins/schedule_plugin.py --status --type analyzer --name toorpia_backend

# 手動でのcron確認
crontab -l | grep toorpia_backend
```

#### プラグイン設定エラー

**症状**: 設定ファイル関連エラー

**解決方法**: 設定ファイルの確認と修正

```bash
# 設定ファイルの構文チェック
python3 -c "import yaml; yaml.safe_load(open('configs/equipments/7th-untan/config.yaml'))"

# プラグインメタデータの確認
cat plugins/analyzers/toorpia_backend/plugin_meta.yaml

# 設定ファイルの内容確認
cat configs/equipments/7th-untan/config.yaml
```

#### API接続エラー

**症状**: toorPIA Backend API接続失敗

**解決方法**: API設定の確認

```bash
# API設定の確認
grep -A 10 "toorpia_integration" configs/equipments/7th-untan/config.yaml

# API接続テスト（手動確認）
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your-api-key"}'
```

### 運用のベストプラクティス

#### 推奨運用スケジュール

1. **基盤マップ更新**: 
   - 頻度: 週1回（日曜日深夜）
   - 条件: 十分なデータが蓄積された後

2. **異常検知**: 
   - 頻度: 10分〜30分間隔
   - 条件: 基盤マップ作成後

3. **ログ確認**: 
   - 頻度: 日次
   - 確認項目: エラー、異常検知結果

#### データ管理

- **ログローテーション**: 自動設定済み（10MB、5世代保持）
- **設定バックアップ**: 定期的なconfig.yamlのバックアップ推奨
- **結果保存**: toorPIA Backend APIサーバーで一元管理

#### 監視ポイント

- プラグイン実行成功率の監視
- 異常検知結果の傾向分析
- システムリソース使用量の確認
- toorPIA Backend API接続状況の監視
- スケジュール実行状況の確認

## 完了確認

以下が確認できれば移行完了です：

1. **コンテナ起動**: `docker ps | grep if-hub` で2つのコンテナが Up
2. **WebUI表示**: ブラウザで http://localhost:3001 にアクセス可能  
3. **データ取得**: `static_equipment_data/` にCSVファイル生成
4. **プラグインシステム**: `python3 plugins/run_plugin.py list` でプラグイン一覧が表示される

---

**サポート**: 問題が発生した場合は、エラーメッセージとともに開発チームまでご連絡ください。
