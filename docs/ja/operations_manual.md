# IndustryFlow Hub (IF-HUB) 運用マニュアル

## 目次

1. [システム概要](#システム概要)
2. [環境構築](#環境構築)
3. [サービスの構築と起動](#サービスの構築と起動)
4. [データ管理](#データ管理)
5. [タグ表示名の管理](#タグ表示名の管理)
6. [計算生成タグ（gtag）の管理](#計算生成タグgtagの管理)
7. [メンテナンス](#メンテナンス)

## システム概要

IndustryFlow Hub（IF-HUB）は、製造設備の時系列データを安全に管理・提供するためのデータハブサーバーです。産業用データシステムなどの既存データソースからの静的CSVデータを取り込み、統一されたAPIを通じてクライアントアプリケーションに提供します。

### 主な機能

- **時系列データの管理**: 工場設備の様々なセンサーから収集された時系列データを一元管理
- **統一API**: RESTful APIによるシンプルなデータアクセス
- **多言語対応**: タグIDに対する多言語表示名マッピング機能
- **データ処理**: 移動平均、Z-score、カスタム計算など様々な計算処理を統一的に提供
- **Docker対応**: コンテナ環境での簡単なデプロイと運用

### システムアーキテクチャ

IF-HUBは以下のコンポーネントで構成されています：

- Node.js/Express APIサーバー
- SQLiteデータベース
- CSVデータインポーター
- タグ表示名マッピング
- 計算生成タグ（gtag）フレームワーク

## 環境構築

### 必要条件

- Node.js 18以上
- npm または yarn
- （オプション）Docker & Docker Compose
- Python 3.x（カスタムgtagの実装に使用する場合）

### リポジトリのクローン

```bash
git clone https://github.com/toorpia/if-hub.git
cd if-hub
```

### 依存関係のインストール

```bash
# Node.js依存関係のインストール
npm install

# Python依存関係のインストール（カスタムgtag実装が必要な場合のみ）
pip install pandas numpy scipy
```

## サービスの構築と起動

### 通常起動（開発環境）

```bash
# サービス起動
npm start

# テストデータ生成（必要に応じて）
npm run generate-data
```

### Docker環境での起動

```bash
# Docker Composeでの起動（開発環境）
cd docker
docker-compose up -d

# Docker Composeでの起動（本番環境）
cd docker
docker-compose -f docker-compose.prod.yml up -d
```

### 環境変数の設定

IF-HUBは以下の環境変数をサポートしています：

| 環境変数 | 説明 | デフォルト値 |
|----------|------|-------------|
| `NODE_ENV` | 実行環境（development/production） | development |
| `PORT` | APIサーバーのポート番号 | 3000 |
| `EXTERNAL_PORT` | Docker使用時の外部公開ポート | 3001 |
| `ALLOWED_ORIGINS` | CORS許可オリジン | * |
| `STATIC_DATA_PATH` | 静的データディレクトリのパス | /app/static_equipment_data |
| `DB_PATH` | データベースファイルのパス | /app/db/if_hub.db |
| `LOG_PATH` | ログファイルのパス | /app/logs |

環境変数は`.env`ファイルまたはDockerの環境変数として設定できます。

### 起動確認

サーバーが正常に起動すると、以下のメッセージが表示されます：

```
IndustryFlow Hub (IF-HUB) Server running on port 3000
Environment: development
Storage: SQLite database
```

http://localhost:3001/api/status にアクセスして、サーバーのステータスを確認できます。

## データ管理

### 静的設備データの設置方法

1. `static_equipment_data`ディレクトリに、設備ごとのCSVファイルを配置します
2. ファイル名は`{設備名}.csv`の形式にします
3. サーバー起動時に自動的にデータがインポートされます

### CSVファイルフォーマット

CSVファイルは以下の形式である必要があります：

- 1行目: ヘッダー行（1列目はタイムスタンプ、2列目以降はタグ名）
- 2行目以降: データ行（1列目は日時、2列目以降は浮動小数点数値）

例：
```csv
datetime,Temperature,Pressure,FlowRate
2023-01-01 00:00:00,75.2,120.5,250.3
2023-01-01 00:10:00,76.1,122.1,248.7
...
```

### データベースへの取り込み仕様

- サーバー起動時に`static_equipment_data`ディレクトリの新規または更新されたCSVファイルが読み込まれます
- データは`tags`テーブルと`tag_data`テーブルに格納されます
- タグIDは`{設備名}.{タグ名}`の形式で生成されます（例：`Pump01.Temperature`）
- ソースタグ（source_tag）には元のCSVカラム名がそのまま保存されます（例：`Temperature`）
- 重複するタグIDの場合は、最新のデータで上書きされます
- タイムスタンプはISO 8601形式（YYYY-MM-DDTHH:mm:ss.sssZ）で保存されます

### タグIDとソースタグの関係

IF-HUBでは、タグ管理のために複数の識別子を使用しています：

1. **タグ名**: `{設備名}.{タグ名}`の形式のユーザー向け識別子（例：`Pump01.Temperature`）
   - APIリクエストで使用する主要な識別子
   - CSVインポート時に自動生成される
   - データベース内では`tags.name`カラムに保存

2. **内部ID**: 整数型の自動採番される内部識別子
   - データベース内での効率的な参照のために使用
   - 大量のデータポイントを含むテーブルでのストレージ効率を向上
   - タグIDは内部的に自動的に整数IDに変換されるため、ユーザーが意識する必要はない

3. **ソースタグ（source_tag）**: 元のCSVファイルに存在するカラム名（例：`Temperature`）
   - データの出所を追跡するための識別子
   - 複数の設備間で同じタイプのセンサーを識別するために使用
   - 表示名や単位情報の一括割り当てに使用可能

この識別子システムにより、ユーザーにとっての使いやすさと、システム内部での効率性の両方を実現しています。タグ名によるAPIアクセスは内部的に効率的な整数IDを使用するため、大規模データセットでも優れたパフォーマンスを発揮します。

### 動的データ更新

IF-HUBは、サーバー実行中に`static_equipment_data`ディレクトリに追加・更新されたCSVファイルを自動的に検出し、インポートする機能を備えています：

- **自動検出**: 1分おきに`static_equipment_data`ディレクトリをチェックし、新しいCSVファイルや更新されたCSVファイルを検出します
- **チェックサム管理**: 各ファイルのSHA-256チェックサムを計算・保存し、ファイル内容の変更を正確に検出します
- **効率的な処理**: 変更のあったファイルのみを処理し、既に取り込み済みの変更のないファイルは再読み込みしません
- **タグ構造の監視**: CSVファイルのタグ構成（列名）が変更された場合、該当設備の既存データを削除して新しい構造で再インポートします
- **日時ベースの更新**: 同じタグ構成の場合、タイムスタンプをキーとしてデータポイントを更新または追加します

この機能により、サーバーを再起動することなく、新しいデータや更新されたデータを継続的に取り込むことができます。

#### チェックサム履歴管理

IF-HUBは、ファイル変更検出のために高度なチェックサム履歴管理機能を実装しています：

- **履歴ベース検出**: 各ファイルについて過去のチェックサム履歴を保持し、新しいファイルが過去に処理したどのバージョンとも一致しない場合のみ変更として検出
- **同一ファイル名対応**: 設備ごとに`{設備名}.csv`という統一形式でCSVファイルを配置する運用において、同じファイル名でも内容が異なる新しいファイルを正確に検出
- **重複防止**: 過去に処理した同一内容のファイルが再度配置された場合は処理をスキップ
- **自動履歴管理**: 各ファイルパスに対して最大20件のチェックサム履歴を自動的に管理

この機能により、以下のユースケースに対応可能です：

1. 古いバージョンのCSVファイルが誤って再配置された場合 → 重複として検出され処理されない
2. 同じ設備の新しいデータセットが配置された場合 → 新規として検出され処理される
3. 異なる時間帯のデータが同じファイル名で順次配置される場合 → それぞれ個別に処理される

`tag_metadata/`ディレクトリ内のタグメタデータファイルに対しても同様のチェックサム履歴管理を適用しており、`translations_ja.csv`などのファイルが更新された場合も正確に検出・処理されます。

## タグ表示名の管理

### translationsファイルの配置

1. `tag_metadata`ディレクトリに、言語ごとのCSVファイルを配置します
2. ファイル名は`translations_{言語コード}.csv`の形式にします
3. サーバー起動時に自動的に表示名データがインポートされます

### translationsファイルのフォーマット

タグ表示名を定義するCSVファイルには、以下の2つの方式があります：

#### 1. タグID指定方式（特定のタグに対して個別に表示名を定義）

```csv
tag_id,display_name,unit
Pump01.Temperature,ポンプ01温度,°C
Pump01.Pressure,ポンプ01圧力,kPa
```

この方式では、個々のタグIDに対して明示的に表示名を指定します。特定の設備・タグの組み合わせに対してカスタムの表示名を定義したい場合に適しています。

#### 2. ソースタグ指定方式（同種のタグに一括で表示名を定義）

```csv
source_tag,display_name,unit
Temperature,温度,°C
Pressure,圧力,kPa
```

この方式では、元のCSVカラム名（ソースタグ）に基づいて表示名を定義します。これにより、異なる設備間で同じセンサータイプ（Temperature、Pressureなど）に対して一括で表示名を設定できます。

**ソースタグ指定方式のメリット**:
- 新しい設備が追加された場合でも、既存の表示名定義が自動的に適用される
- 同じセンサータイプに対する一貫した表示名の維持が容易
- translationsファイルの管理が容易になり、エントリ数を削減できる

#### 両方式の併用

両方の方式を同じファイル内で混在させることも可能です：

```csv
tag_id,display_name,unit
Pump01.Temperature,ポンプ01の温度,°C
source_tag,display_name,unit
Pressure,圧力,kPa
```

この場合、タグID指定のエントリが優先され、該当するタグに適用されます。ソースタグ指定のエントリは、タグID指定で表示名が定義されていないタグにのみ適用されます。

### 多言語対応方法

- 言語ごとに`translations_{言語コード}.csv`ファイルを作成します
- 言語コードは、2文字のISO言語コード（例：`ja`, `en`）または地域付き言語コード（例：`en-US`）が使用できます
- 同じディレクトリに複数の言語ファイルを配置できます
- APIリクエスト時に`lang`パラメータで言語を指定することで、該当言語の表示名を取得できます

### 表示名の動的更新

IF-HUBは、サーバー実行中にtranslationsファイルが変更された場合にも、自動的に変更を検出し反映します：

1. サーバーは5分ごとに`tag_metadata`ディレクトリをスキャンし、変更を検出します
2. 変更が検出されると、自動的に新しい表示名情報がインポートされます
3. APIレスポンスには、最新の表示名情報が反映されます

これにより、サーバーを再起動せずにタグ表示名を更新できます。

## 計算生成タグ（gtag）の管理

計算生成タグ（gtag）は、複数のタグを組み合わせた計算や、単一タグの統計処理などを行う仮想タグです。実データと同様に扱える計算値を定義でき、APIやCSVエクスポートにも統合されています。

### gtagの種類

IF-HUBは以下のタイプのgtagをサポートしています：

1. **計算タイプ（calculation）**：数式を使用して複数タグの値を計算
2. **移動平均タイプ（moving_average）**：単一タグの移動平均を計算
3. **Z-scoreタイプ（zscore）**：標準化スコアを計算（異常検知などに有用）
4. **偏差タイプ（deviation）**：偏差値を計算
5. **カスタムタイプ（custom）**：カスタム実装を使用した複雑な計算
6. **生データタイプ（raw）**：元データをそのまま返す

### gtagディレクトリ構造

gtagは以下のディレクトリ構造で管理されます：

```
gtags/
  ├── {gtag名}/             # 各gtagの独立したディレクトリ
  │   ├── def.json          # gtag定義ファイル
  │   └── bin/              # カスタム実装用（必要な場合のみ）
  │       └── custom_impl.py  # カスタム計算実装
  ├── {別のgtag名}/
  │   └── def.json
  ...
```

この構造により、各gtagは自己完結した単位として管理され、必要に応じてカスタム実装も含めることができます。

### gtag定義ファイル（def.json）の例

#### 計算タイプ

```json
{
  "name": "Pump01.Efficiency",
  "type": "calculation",
  "inputs": ["Pump01.Flow", "Pump01.Power"],
  "expression": "(inputs[0] / inputs[1])",
  "description": "ポンプ効率（流量/消費電力）",
  "unit": ""
}
```

#### 移動平均タイプ

```json
{
  "name": "Pump01.TempMA",
  "type": "moving_average",
  "inputs": ["Pump01.Temperature"],
  "window": 5,
  "description": "ポンプ01温度の移動平均",
  "unit": "°C"
}
```

#### Z-scoreタイプ

```json
{
  "name": "Tank01.LevelZscore",
  "type": "zscore",
  "inputs": ["Tank01.Level"],
  "window": 24,
  "description": "タンク01水位のZ-score（異常検知用）",
  "unit": ""
}
```

#### カスタムタイプ

```json
{
  "name": "Tank01.PredictedLevel",
  "type": "custom",
  "inputs": ["Tank01.Level", "Tank01.InFlow", "Tank01.OutFlow"],
  "implementation": "bin/predict_level.py",
  "function": "predict_future_level",
  "params": {
    "prediction_minutes": 30
  },
  "description": "タンク01の30分後の水位予測",
  "unit": "m"
}
```

### 新しいgtagの追加方法

1. `gtags/`ディレクトリ内に新しいgtag名のディレクトリを作成
   ```bash
   mkdir -p gtags/Pump01.NewMetric
   ```

2. 定義ファイル（def.json）を作成
   ```bash
   vim gtags/Pump01.NewMetric/def.json
   ```

3. 必要に応じてカスタム実装を追加
   ```bash
   mkdir -p gtags/Pump01.NewMetric/bin
   vim gtags/Pump01.NewMetric/bin/custom_calc.py
   chmod +x gtags/Pump01.NewMetric/bin/custom_calc.py
   ```

4. サーバーを再起動するか、しばらく待つと自動検出されます

### 柔軟なタグ参照

gtag定義の`inputs`フィールドでは、以下の様々な形式でタグを参照できます：

1. **タグ名（tags.name）**: `"Pump01.Temperature"`
2. **ソースタグ（source_tag）**: `"Temperature"`
3. **設備＋ソースタグ**: `"Pump01:Temperature"`
4. **タグID（整数）**: `1`

この柔軟性により、さまざまな方法でタグを参照でき、メンテナンス性が向上します。

### gtagの自動検出と同期

サーバー起動時にすべてのgtag定義が読み込まれます。また、サーバー実行中にgtag定義が追加・変更された場合、自動的に検出され反映されます。これにより、サーバーを再起動せずに新しいgtagを追加したり、既存のgtagを変更したりできます。

### APIからのgtag利用

gtagは統合APIを通じて簡単にアクセスできます：

1. **gtag固有データ取得**:
   ```
   GET /api/gtags/:name
   ```

2. **動的プロセス実行**（一時的な計算処理）:
   ```
   GET /api/process/:target?type=moving_average&window=10
   ```

3. **バッチデータ取得**（通常タグとgtagを混在可）:
   ```
   GET /api/batch?tags=Pump01.Temperature,Pump01.TempMA,Pump01.Efficiency
   ```

4. **CSVエクスポート**（設備に関連する全てのgtagを含む）:
   ```
   GET /api/export/equipment/:equipmentId/csv
   ```

## メンテナンス

### ログ管理

- ログは`logs`ディレクトリに保存されます
- サーバー起動時のログはコンソールに出力されます
- エラーログはコンソールと`logs`ディレクトリの両方に出力されます

### バックアップと復元

#### データベースのバックアップ

```bash
# データベースのバックアップ
sqlite3 db/if_hub.db .dump > backup_$(date +%Y%m%d).sql

# バックアップからの復元
sqlite3 db/if_hub.db < backup_20230101.sql
```

#### 設定ファイルのバックアップ

重要な設定ファイルは定期的にバックアップしてください：

- `static_equipment_data/`ディレクトリのCSVファイル
- `tag_metadata/`ディレクトリのタグメタデータファイル
- `gtags/`ディレクトリのgtag定義

### トラブルシューティング

#### サーバーが起動しない場合

1. 依存関係が正しくインストールされているか確認
   ```bash
   npm install
   ```

2. ポート衝突がないか確認
   ```bash
   lsof -i :3000
   ```

3. ログファイルを確認
   ```bash
   cat logs/error.log
   ```

#### データが表示されない場合

1. CSVファイルが正しい形式であるか確認
2. データベースファイルが存在するか確認
   ```bash
   ls -la db/
   ```
3. APIエンドポイントで正しいタグIDを指定しているか確認
   ```bash
   curl http://localhost:3001/api/tags
   ```

#### ソースタグ関連の問題

1. タグIDとソースタグの関係を確認
   ```bash
   curl http://localhost:3001/api/tags | jq '.tags[] | {id, source_tag}'
   ```

2. ソースタグ検索APIをテスト
   ```bash
   curl http://localhost:3001/api/tags/sourceTag/Temperature
   ```

3. `tag_metadata`ディレクトリのtranslationsファイルで、source_tag列が正しく定義されているか確認

#### gtag関連の問題

1. gtag定義が正しいか確認
   ```bash
   cat gtags/Pump01.TempMA/def.json
   ```

2. gtag一覧を確認
   ```bash
   curl http://localhost:3001/api/tags?includeGtags=true
   ```

3. 特定のgtagをテスト
   ```bash
   curl http://localhost:3001/api/gtags/Pump01.TempMA
   ```

4. APIレスポンスのエラーメッセージを確認
