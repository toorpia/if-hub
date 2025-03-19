# Docker環境でのDataStream Hub実行ガイド

このディレクトリには、DataStream HubをDocker環境で実行するための設定ファイルが含まれています。

## Docker構成ファイル

- `docker-compose.yml` - 開発環境用のDocker Compose設定
- `docker-compose.prod.yml` - 本番環境用のDocker Compose設定
- `Dockerfile` - DataStream Hubコンテナのビルド定義

## コンテナ構成

コンテナは以下の構成要素を含みます：

- Node.js 18ベースのアプリケーション
- SQLiteデータベース（ボリュームマウントで永続化）
- ホストとコンテナ間で共有されるCSVデータディレクトリ
- ホストとコンテナ間で共有されるログディレクトリ

## クイックスタート

```bash
# コンテナをビルドして起動
docker-compose up -d

# ログを確認
docker-compose logs

# コンテナを停止
docker-compose down
```

## ボリュームマウント

Docker Composeでは、以下のホストディレクトリがコンテナにマウントされます：

- `../src` → `/app/src`（ソースコード）
- `../pi_data` → `/app/pi_data`（CSVデータファイル）
- `../logs` → `/app/logs`（ログファイル）
- `../db` → `/app/db`（データベースファイルとチェックサム情報）
- `../package.json` → `/app/package.json`（依存関係定義）

## ファイル監視機能のテスト

このディレクトリには、Docker環境でのファイル監視機能をテストするためのスクリプト `test-file-watcher.sh` が含まれています。このスクリプトは以下の手順を自動的に実行します：

1. Docker Composeでコンテナを起動
2. APIサーバーが応答するまで待機
3. テスト用のCSVファイルを作成
4. ファイル監視機能が動作するまで待機
5. 新しいCSVファイルが検出され、データがインポートされたことを確認
6. 既存のCSVファイルを更新し、変更が検出されることを確認
7. チェックサム情報ファイルの存在を確認

### テストスクリプトの実行方法

```bash
# 実行権限を付与
chmod +x test-file-watcher.sh

# スクリプトを実行
./test-file-watcher.sh
```

テストスクリプトは、実行中にすべての手順とその結果を出力します。テストの進行に伴って、新しいCSVファイルが自動的に作成・更新され、APIレスポンスを通じて変更が検出されたことを確認できます。

## 環境変数のカスタマイズ

以下の環境変数を設定することで、コンテナの動作をカスタマイズできます：

- `EXTERNAL_PORT` - ホストマシンに公開するポート（デフォルト: 3001）
- `NODE_ENV` - 実行環境（development/production）

例：
```bash
EXTERNAL_PORT=8080 docker-compose up -d
```

## トラブルシューティング

### コンテナが起動しない場合

1. Dockerデーモンが実行中か確認
   ```bash
   docker info
   ```

2. ポート3001が他のプロセスで使用されていないか確認
   ```bash
   lsof -i :3001
   ```

3. コンテナのログを確認
   ```bash
   docker-compose logs
   ```

### ファイル監視が動作しない場合

1. ボリュームマウントが正しく設定されているか確認
   ```bash
   docker-compose exec datastream-hub ls -la /app/pi_data
   docker-compose exec datastream-hub ls -la /app/db
   ```

2. ファイルの権限を確認
   ```bash
   ls -la ../pi_data
   ls -la ../db
   ```

3. コンテナ内でチェックサムファイルが作成されているか確認
   ```bash
   docker-compose exec datastream-hub ls -la /app/db/file_checksums.json
   ```

4. ファイル監視のログを確認
   ```bash
   docker-compose logs | grep "CSV変更"
   docker-compose logs | grep "チェックサム"
