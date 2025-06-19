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

## プラグインシステムのオフライン環境配置

IF-HUBのプラグインシステムをオフライン環境に配置する手順です。

### プラグインシステム事前準備（開発環境）

#### 仮想環境の構築

```bash
# プラグイン用仮想環境の作成
./plugins/venv_management/setup_venv_analyzer.sh {プラグイン名}

# 例: toorpia_backendプラグインの場合
./plugins/venv_management/setup_venv_analyzer.sh toorpia_backend
```

#### パッケージ作成時の自動統合

`create-package.sh` 実行時に以下が自動的に統合されます：

- プラグインシステム実行環境（`plugins/run_plugin.py`等）
- 仮想環境（`plugins/venvs/`）
- 管理スクリプト（`plugins/venv_management/`）

### オフライン環境での配置確認

#### プラグインシステムの初期化確認

```bash
# プラグインシステムのディレクトリ構造確認
ls -la plugins/
ls -la plugins/venvs/analyzers/

# 仮想環境の動作確認
plugins/venvs/analyzers/{プラグイン名}/bin/python --version
```

#### プラグイン実行テスト

```bash
# プラグイン一覧表示
python3 plugins/run_plugin.py list

# プラグイン実行テスト（例：status確認）
python3 plugins/run_plugin.py --type analyzer --name {プラグイン名} \
  --config configs/equipments/{設備名}/config.yaml --mode status
```

### プラグインシステムのトラブルシューティング

#### 仮想環境エラー

```bash
# エラー: 仮想環境が見つからない
# 解決方法: ディレクトリ構造確認
ls -la plugins/venvs/analyzers/
chmod +x plugins/venvs/analyzers/*/bin/python
```

#### プラグイン実行エラー

```bash
# エラー: プラグインメタデータ読み込み失敗
# 解決方法: メタデータファイル確認
cat plugins/analyzers/{プラグイン名}/plugin_meta.yaml

# エラー: プラグイン実行タイムアウト
# 解決方法: ログ確認
cat plugins/logs/{プラグイン名}.log
```

## 完了確認

以下が確認できれば移行完了です：

1. **コンテナ起動**: `docker ps | grep if-hub` で2つのコンテナが Up
2. **WebUI表示**: ブラウザで http://localhost:3001 にアクセス可能  
3. **データ取得**: `static_equipment_data/` にCSVファイル生成
4. **プラグインシステム**: `python3 plugins/run_plugin.py list` でプラグイン一覧が表示される

---

**サポート**: 問題が発生した場合は、エラーメッセージとともに開発チームまでご連絡ください。
