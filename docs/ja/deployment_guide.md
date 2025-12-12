# IF-HUB 本番環境デプロイガイド

本ドキュメントでは、IF-HUBを本番環境にデプロイする際の、サンプリングレートに応じたTimescaleDB設定の最適化方法について説明します。

## 目次

- [概要](#概要)
- [サンプリングレートとパフォーマンスの関係](#サンプリングレートとパフォーマンスの関係)
- [複数インスタンス運用](#複数インスタンス運用)
- [設定パラメータ詳細](#設定パラメータ詳細)
- [デプロイ手順](#デプロイ手順)
- [動作確認](#動作確認)
- [トラブルシューティング](#トラブルシューティング)

---

## 概要

IF-HUBのパフォーマンスは、上流データソースの**サンプリングレート**に大きく依存します。TimescaleDBのチャンクサイズやメモリ設定を適切に調整することで、最適なパフォーマンスを実現できます。

### 重要な原則

1. **チャンクサイズはデプロイ前に決定** - データ投入後の変更は新規チャンクのみに適用
2. **サンプリングレート別に最適化** - 0.1秒間隔と1分間隔では最適な設定が大きく異なる
3. **複数インスタンスでの運用** - 異なるサンプリングレートは別々のIF-HUBインスタンスで管理

---

## サンプリングレートとパフォーマンスの関係

### データ量の見積もり

```
1日あたりの行数 = サンプリング頻度 × 86,400秒 × タグ数

例1: 0.1秒間隔（10Hz）、タグ数200
    → 10 × 86,400 × 200 = 172,800,000行/日

例2: 1分間隔、タグ数100
    → (1/60) × 86,400 × 100 = 144,000行/日
```

### チャンクサイズの目標

TimescaleDBでは、**1チャンクあたり500万〜1000万行**が推奨されています。これにより、以下のバランスが最適化されます：

- **クエリ性能**: チャンク数が多すぎるとクエリプランニングのオーバーヘッドが増加
- **データ管理**: チャンクが大きすぎると圧縮・削除処理に時間がかかる
- **メモリ効率**: 適切なサイズのチャンクはメモリキャッシュに収まりやすい

### サンプリングレート別の推奨設定

| サンプリング間隔 | 1日のサンプル数 | タグ数100での日次行数 | 推奨チャンクサイズ | 理由 |
|----------------|----------------|---------------------|-------------------|------|
| **0.1秒（10Hz）** | 864,000 | 86,400,000行 | **1〜3日** | 1日で目標行数を大きく超えるため短縮 |
| **1秒** | 86,400 | 8,640,000行 | **7〜14日** | 1週間で目標範囲に到達 |
| **1分（標準）** | 1,440 | 144,000行 | **30日**（デフォルト） | 1ヶ月で約400万行 |
| **5分** | 288 | 28,800行 | **60〜90日** | データ量が少ないため長期間に |

---

## 複数インスタンス運用

### Docker Composeのネットワーク分離

Docker Composeは**ディレクトリ名に基づいてプロジェクト名を決定**し、プロジェクトごとに独立したネットワークを作成します。

```bash
# ディレクトリ構造
/opt/if-hub-instances/
├── if-hub-1min/          # プロジェクト名: if-hub-1min
│   └── docker/           # ネットワーク: if-hub-1min_if-hub-network
└── if-hub-highfreq/      # プロジェクト名: if-hub-highfreq
    └── docker/           # ネットワーク: if-hub-highfreq_if-hub-network
```

### ネットワーク分離のメリット

- **PostgreSQLポートの競合回避**: 各インスタンスのTimescaleDBコンテナは独自のネットワーク内で`5432`ポートを使用可能
- **コンテナ名の衝突回避**: 同じコンテナ名でも異なるプロジェクトなら共存可能
- **独立した運用**: 各インスタンスを個別に起動・停止・再起動可能

### 必要な変更点

| 項目 | 変更の必要性 | 理由 |
|------|-------------|------|
| **ディレクトリ名** | ✅ 必須 | Docker Composeのプロジェクト名として使用 |
| **IF-HUBポート（EXTERNAL_PORT）** | ✅ 必須 | ホストから各インスタンスにアクセスするため |
| **PostgreSQLポート** | ❌ 不要* | ネットワークが分離されているため競合しない |
| **データベース名** | ❌ 不要 | ネットワーク分離により衝突しない |
| **コンテナ名** | △ 推奨 | 管理しやすくするため（必須ではない） |

*ホストからPostgreSQLに直接アクセスする必要がある場合は変更が必要

---

## 設定パラメータ詳細

### 1. チャンクサイズ（chunk_time_interval）⚠️ デプロイ前に決定必須

**修正ファイル**: [`docker/init-scripts/init-timescaledb.sql`](../../docker/init-scripts/init-timescaledb.sql#L46)

**デフォルト設定（1分サンプリング用）:**
```sql
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
```

**高頻度サンプリング用（0.1秒、タグ数200）:**
```sql
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '3 days',  -- 30 days → 3 days
  if_not_exists => TRUE
);
```

**低頻度サンプリング用（5分以上）:**
```sql
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '90 days',  -- 30 days → 90 days
  if_not_exists => TRUE
);
```

**✅ 運用中にチャンクサイズを変更する方法:**

デプロイ後、データ量が想定と異なることが判明した場合は、以下の手順で変更できます：

1. **変更用SQLスクリプトを作成** (`docker/adjust-chunk-size.sql`):
   ```sql
   -- 新規チャンクから適用されるチャンクサイズを変更
   SELECT set_chunk_time_interval('tag_data', INTERVAL '7 days');

   -- 変更後の設定を確認
   SELECT hypertable_name,
          interval_length / 86400000000 as days
   FROM timescaledb_information.dimensions
   WHERE hypertable_name='tag_data';
   ```

2. **SQLスクリプトを実行**:
   ```bash
   cd docker
   docker compose -f docker-compose.timescaledb.yml exec -T timescaledb \
     psql -U if_hub_user -d if_hub < adjust-chunk-size.sql
   ```

3. **⚠️ 重要な注意事項:**
- チャンクサイズの変更は**新規チャンクのみ**に適用されます
- 既存チャンクのサイズは変更されません
- 完全に変更したい場合は、新しいハイパーテーブルを作成してデータ移行が必要です

### 2. 圧縮ポリシー（compress_after）✅ 運用中変更可能

**修正ファイル**: [`docker/init-scripts/init-timescaledb.sql`](../../docker/init-scripts/init-timescaledb.sql#L59)

**デフォルト設定:**
```sql
SELECT add_compression_policy('tag_data',
  compress_after => INTERVAL '30 days',
  if_not_exists => TRUE
);
```

**高頻度サンプリング用（早めに圧縮）:**
```sql
SELECT add_compression_policy('tag_data',
  compress_after => INTERVAL '7 days',  -- 30 days → 7 days
  if_not_exists => TRUE
);
```

**運用中の変更方法:**
```sql
-- 既存のポリシーを削除
SELECT remove_compression_policy('tag_data');

-- 新しいポリシーを追加
SELECT add_compression_policy('tag_data',
  compress_after => INTERVAL '7 days',
  if_not_exists => TRUE
);
```

### 3. 保持ポリシー（retention policy）✅ 運用中変更可能

**修正ファイル**: [`docker/init-scripts/init-timescaledb.sql`](../../docker/init-scripts/init-timescaledb.sql#L64-L69)

**デフォルト設定**: コメントアウトされています（無効）

**有効化する場合:**
```sql
-- コメントを外す
SELECT add_retention_policy('tag_data',
  drop_after => INTERVAL '2 years',
  if_not_exists => TRUE
);
```

**高頻度サンプリング用（短期保存）:**
```sql
SELECT add_retention_policy('tag_data',
  drop_after => INTERVAL '6 months',  -- データ量が多いため短縮
  if_not_exists => TRUE
);
```

**運用中の変更方法:**
```sql
-- 既存のポリシーを削除
SELECT remove_retention_policy('tag_data');

-- 新しいポリシーを追加
SELECT add_retention_policy('tag_data',
  drop_after => INTERVAL '1 year',
  if_not_exists => TRUE
);
```

### 4. PostgreSQLメモリ設定 ✅ 運用中変更可能

**修正ファイル**: [`docker/docker-compose.timescaledb.yml`](../../docker/docker-compose.timescaledb.yml#L27-L60)

**デフォルト設定（1分サンプリング用）:**
```yaml
command:
  - "postgres"
  - "-c"
  - "shared_buffers=256MB"
  - "-c"
  - "effective_cache_size=1GB"
  - "-c"
  - "work_mem=8MB"
  - "-c"
  - "max_wal_size=4GB"
```

**高頻度サンプリング用（推奨）:**
```yaml
command:
  - "postgres"
  - "-c"
  - "shared_buffers=512MB"           # 2倍に増量（書き込み性能向上）
  - "-c"
  - "effective_cache_size=2GB"       # 2倍に増量（読み込み性能向上）
  - "-c"
  - "work_mem=16MB"                  # 2倍に増量（ソート・集計高速化）
  - "-c"
  - "max_wal_size=8GB"               # 2倍に増量（チェックポイント頻度削減）
```

**パラメータの説明:**

| パラメータ | 用途 | 推奨値の目安 |
|-----------|------|-------------|
| `shared_buffers` | PostgreSQLが使用する共有メモリ | システムメモリの25% |
| `effective_cache_size` | OSキャッシュを含む利用可能メモリ | システムメモリの50-75% |
| `work_mem` | ソート・ハッシュ操作用メモリ | 複雑なクエリが多い場合は増量 |
| `max_wal_size` | WALファイルの最大サイズ | 書き込み量が多い場合は増量 |

### 5. ポート設定（複数インスタンス運用時）⚠️ 必須

**修正ファイル**: `docker/.env`

**インスタンス1（1分サンプリング）:**
```bash
EXTERNAL_PORT=3001
TIMESCALE_PASSWORD=your_secure_password_1
```

**インスタンス2（高頻度サンプリング）:**
```bash
EXTERNAL_PORT=3002
TIMESCALE_PASSWORD=your_secure_password_2
```

**PostgreSQLポートについて:**

ホストからPostgreSQLに直接アクセスする必要がない場合は、[`docker/docker-compose.timescaledb.yml`](../../docker/docker-compose.timescaledb.yml#L13-L14)のポート公開設定を削除またはコメントアウトすることを推奨します：

```yaml
# ホストからPostgreSQLへの直接アクセスが不要な場合はコメントアウト
# ports:
#   - "${TIMESCALE_PORT:-5432}:5432"
```

これにより、PostgreSQLは各Docker Composeネットワーク内でのみアクセス可能となり、完全に分離されます。

---

## デプロイ手順

### ステップ1: サンプリングレートの確認

上流データソースのサンプリング頻度を確認します。

```bash
# 例: サンプリング間隔を確認
# - 0.1秒間隔 = 10Hz
# - 1秒間隔 = 1Hz
# - 1分間隔 = 0.0167Hz
```

### ステップ2: IF-HUBフォルダーのコピー（複数インスタンス運用の場合）

```bash
# 例: 高頻度サンプリング用のインスタンスを作成
cp -r if-hub /opt/if-hub-highfreq
cd /opt/if-hub-highfreq
```

### ステップ3: チャンクサイズの決定と設定

前述の「サンプリングレート別の推奨設定」を参考に、適切なチャンクサイズを決定します。

```bash
# 決定式を使用
# チャンクサイズ = 目標行数（500万〜1000万） / (1日のサンプル数 × タグ数)

# 例: 0.1秒サンプリング、タグ数200の場合
# 1日のサンプル数 = 10 × 86,400 = 864,000
# 1日の行数 = 864,000 × 200 = 172,800,000行
# チャンクサイズ = 10,000,000 / 172,800,000 ≒ 0.058日 → 3日程度が適切
```

`docker/init-scripts/init-timescaledb.sql`を編集：

```bash
vi docker/init-scripts/init-timescaledb.sql
```

46行目付近を変更：
```sql
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '3 days',  -- 計算結果に基づいて変更
  if_not_exists => TRUE
);
```

### ステップ4: その他の設定調整

#### 4-1. 環境変数の設定

```bash
cp docker/env.timescaledb.example docker/.env
vi docker/.env
```

変更内容：
```bash
# ポート番号を変更（複数インスタンスの場合）
EXTERNAL_PORT=3002

# パスワードを変更（セキュリティ）
TIMESCALE_PASSWORD=your_secure_password
```

#### 4-2. 圧縮ポリシーの調整（オプション）

高頻度サンプリングの場合、`docker/init-scripts/init-timescaledb.sql`の59行目付近を変更：

```sql
SELECT add_compression_policy('tag_data',
  compress_after => INTERVAL '7 days',  -- 30 days → 7 days
  if_not_exists => TRUE
);
```

#### 4-3. 保持ポリシーの有効化（オプション）

`docker/init-scripts/init-timescaledb.sql`の64-69行目のコメントを外す：

```sql
SELECT add_retention_policy('tag_data',
  drop_after => INTERVAL '6 months',  -- 必要に応じて期間を調整
  if_not_exists => TRUE
);
```

#### 4-4. メモリ設定の調整（高頻度サンプリングの場合）

`docker/docker-compose.timescaledb.yml`を編集：

```bash
vi docker/docker-compose.timescaledb.yml
```

27-60行目付近を変更：
```yaml
command:
  - "postgres"
  - "-c"
  - "shared_buffers=512MB"           # 256MB → 512MB
  - "-c"
  - "effective_cache_size=2GB"       # 1GB → 2GB
  - "-c"
  - "work_mem=16MB"                  # 8MB → 16MB
  - "-c"
  - "max_wal_size=8GB"               # 4GB → 8GB
```

### ステップ5: デプロイ

```bash
cd docker
docker compose -f docker-compose.timescaledb.yml up -d
```

---

## 動作確認

### 1. TimescaleDB起動確認

```bash
docker compose -f docker-compose.timescaledb.yml logs timescaledb | grep "ready to accept connections"
```

期待される出力：
```
timescaledb  | ... database system is ready to accept connections
```

### 2. チャンク設定の確認

```bash
docker compose -f docker-compose.timescaledb.yml exec timescaledb \
  psql -U if_hub_user -d if_hub -c \
  "SELECT hypertable_name, interval_length FROM timescaledb_information.dimensions WHERE hypertable_name='tag_data';"
```

期待される出力例（3日チャンクの場合）：
```
 hypertable_name | interval_length
-----------------+-----------------
 tag_data        | 259200000000
```

interval_lengthはマイクロ秒単位です：
- 30日 = 2,592,000,000,000
- 3日 = 259,200,000,000
- 1日 = 86,400,000,000

### 3. 圧縮ポリシーの確認

```bash
docker compose -f docker-compose.timescaledb.yml exec timescaledb \
  psql -U if_hub_user -d if_hub -c \
  "SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression';"
```

### 4. IF-HUB API確認

```bash
curl http://localhost:3001/api/status
# または複数インスタンスの場合
curl http://localhost:3002/api/status
```

期待される出力：
```json
{"status":"ok","timestamp":"..."}
```

---

## トラブルシューティング

### Q1: チャンクサイズを変更したが反映されない

**原因**: 既存のチャンクには変更が適用されません。

**対処法**:
- 新しいチャンクから新しいサイズが適用されます
- 確認方法：
  ```sql
  SELECT chunk_name, range_start, range_end
  FROM timescaledb_information.chunks
  WHERE hypertable_name = 'tag_data'
  ORDER BY range_start DESC
  LIMIT 5;
  ```
- 完全に変更したい場合は、新しいハイパーテーブルを作成してデータ移行が必要です

### Q2: メモリ不足エラーが発生する

**エラーメッセージ例**:
```
ERROR: out of memory
DETAIL: Failed on request of size 1234 in memory context "..."
```

**対処法**:
1. `docker-compose.timescaledb.yml`の`shared_buffers`と`work_mem`を増やす
2. コンテナを再起動：
   ```bash
   docker compose -f docker-compose.timescaledb.yml restart timescaledb
   ```

### Q3: ディスク容量不足

**確認方法**:
```bash
docker compose -f docker-compose.timescaledb.yml exec timescaledb df -h
```

**対処法**:

1. **圧縮ポリシーを有効化/強化**:
   ```sql
   SELECT add_compression_policy('tag_data',
     compress_after => INTERVAL '7 days',
     if_not_exists => TRUE
   );
   ```

2. **保持ポリシーで古いデータを削除**:
   ```sql
   SELECT add_retention_policy('tag_data',
     drop_after => INTERVAL '6 months',
     if_not_exists => TRUE
   );
   ```

3. **手動で古いチャンクを削除**:
   ```sql
   -- 6ヶ月より古いチャンクを確認
   SELECT chunk_name, range_start, range_end
   FROM timescaledb_information.chunks
   WHERE hypertable_name = 'tag_data'
     AND range_end < NOW() - INTERVAL '6 months';

   -- 削除（慎重に実行）
   SELECT drop_chunks('tag_data', older_than => INTERVAL '6 months');
   ```

### Q4: 複数インスタンスでポート競合が発生する

**エラーメッセージ例**:
```
Error starting userland proxy: listen tcp4 0.0.0.0:3001: bind: address already in use
```

**対処法**:
1. 各インスタンスの`.env`ファイルで`EXTERNAL_PORT`を変更
2. 使用中のポートを確認：
   ```bash
   sudo lsof -i :3001
   sudo lsof -i :5432
   ```
3. PostgreSQLポートの公開が不要な場合は、`docker-compose.timescaledb.yml`の該当行をコメントアウト

### Q5: データ取り込み速度が遅い

**確認項目**:

1. **WAL設定の確認**:
   ```sql
   SHOW max_wal_size;
   SHOW checkpoint_completion_target;
   ```

2. **対処法**:
   - `max_wal_size`を増やす（例: 4GB → 8GB）
   - バッチインサートを使用（複数行を一度に挿入）
   - `work_mem`を増やす

### Q6: クエリが遅い

**診断方法**:
```sql
EXPLAIN ANALYZE
SELECT * FROM tag_data
WHERE timestamp > NOW() - INTERVAL '7 days'
  AND tag_id = 123;
```

**対処法**:
1. インデックスが使用されているか確認
2. `effective_cache_size`を増やす
3. 古いデータが圧縮されているか確認：
   ```sql
   SELECT chunk_name, is_compressed
   FROM timescaledb_information.chunks
   WHERE hypertable_name = 'tag_data';
   ```

---

## 参考リンク

- [TimescaleDB公式ドキュメント](https://docs.timescale.com/)
- [チャンクサイズの最適化](https://docs.timescale.com/use-timescale/latest/hypertables/about-hypertables/)
- [圧縮機能](https://docs.timescale.com/use-timescale/latest/compression/)
- [保持ポリシー](https://docs.timescale.com/use-timescale/latest/data-retention/)
- [PostgreSQLチューニング](https://pgtune.leopard.in.ua/)

---

## 付録: 設定チェックリスト

デプロイ前に以下の項目を確認してください：

- [ ] サンプリングレートを確認した
- [ ] タグ数を把握した
- [ ] チャンクサイズを計算した
- [ ] `docker/init-scripts/init-timescaledb.sql`の`chunk_time_interval`を変更した
- [ ] 圧縮ポリシーを設定した（オプション）
- [ ] 保持ポリシーを設定した（オプション）
- [ ] `docker/.env`の`EXTERNAL_PORT`を設定した（複数インスタンスの場合）
- [ ] `docker/.env`の`TIMESCALE_PASSWORD`を設定した
- [ ] メモリ設定を調整した（高頻度サンプリングの場合）
- [ ] PostgreSQLポートの公開設定を確認した
- [ ] デプロイ後の動作確認手順を確認した
