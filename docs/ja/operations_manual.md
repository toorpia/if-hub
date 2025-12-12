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
- TimescaleDBデータベース（PostgreSQL + TimescaleDB拡張）
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
# Docker Composeでの起動（TimescaleDB版）
docker compose -f docker/docker-compose.timescaledb.yml up -d
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
Storage: TimescaleDB (PostgreSQL)
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

## 設備設定ファイル（config.yaml）の管理

### 概要

IF-HUBでは、設備とタグの関連付けをconfig.yamlファイルで管理します。このファイルは設備・タグ関連付けの「真実の源」として機能し、API応答やデータフィルタリングの基準となります。

### config.yamlの構造

各設備のconfig.yamlファイルは以下の構造を持ちます：

```yaml
basemap:
  source_tags:
    - "Flow"
    - "PowerConsumption"
    - "Temperature"
  gtags:
    - "EfficiencyIndex"
    - "TempMA"
```

- **source_tags**: この設備で利用可能な基本タグのリスト
- **gtags**: この設備で利用可能な計算生成タグ（gtag）のリスト

### ファイル配置

設備設定ファイルは以下のディレクトリ構造で配置します：

```
configs/equipments/
├── Pump01/config.yaml
├── Tank01/config.yaml
├── Compressor01/config.yaml
├── Reactor01/config.yaml
└── 7th-untan/config.yaml
```

### 重要な運用ルール

**⚠️ 重要**: config.yamlファイルを変更した後は、必ずサーバーの再起動が必要です。

#### 設定変更の手順

1. **設定ファイルの編集**
   ```bash
   vi configs/equipments/Pump01/config.yaml
   ```

2. **サーバー再起動**
   ```bash
   docker compose restart
   ```

3. **動作確認**
   ```bash
   # 設備一覧の確認
   curl "http://localhost:3001/api/equipment"
   
   # 設備フィルタリングの確認
   curl "http://localhost:3001/api/tags?equipment=Pump01&includeGtags=true"
   ```

#### 代替の再起動方法

```bash
# 完全な再起動
docker compose down && docker compose up -d

# 特定コンテナのみ再起動
docker restart if-hub
```

### 新しい設備の追加

新規設備を追加する場合は、以下の手順で実施します：

1. **config.yamlファイル作成**
   ```bash
   mkdir -p configs/equipments/新設備名
   vi configs/equipments/新設備名/config.yaml
   ```

2. **設定内容記述**
   ```yaml
   basemap:
     source_tags:
       - "タグ名1"
       - "タグ名2"
     gtags:
       - "gtag名1"
       - "gtag名2"
   ```

3. **サーバー再起動**
   ```bash
   docker compose restart
   ```

4. **動作確認**
   ```bash
   # 新設備が認識されることを確認
   curl "http://localhost:3001/api/equipment"
   
   # 新設備のタグフィルタリング確認
   curl "http://localhost:3001/api/tags?equipment=新設備名&includeGtags=true"
   ```

### 設備横断タグの管理

config.yamlベースのシステムでは、同一タグを複数設備で共有できます：

```yaml
# configs/equipments/Pump01/config.yaml
basemap:
  source_tags:
    - "UTIL:STEAM_PRESSURE"  # ユーティリティタグ
    - "Flow"

# configs/equipments/Tank01/config.yaml  
basemap:
  source_tags:
    - "UTIL:STEAM_PRESSURE"  # 同じユーティリティタグ
    - "Level"
```

この機能により、複数の設備で共通して使用されるユーティリティタグや環境データを効率的に管理できます。

### config.yaml関連のトラブルシューティング

#### 設備が認識されない場合

1. **config.yamlファイルの存在確認**
   ```bash
   ls -la configs/equipments/設備名/config.yaml
   ```

2. **YAMLファイルの構文確認**
   ```bash
   # Python使用
   python -c "import yaml; yaml.safe_load(open('configs/equipments/Pump01/config.yaml'))"
   
   # Node.js使用
   node -e "console.log(require('yaml').parse(require('fs').readFileSync('configs/equipments/Pump01/config.yaml', 'utf8')))"
   ```

3. **Dockerマウント確認**
   ```bash
   docker exec -it if-hub ls -la /app/configs/equipments/
   ```

4. **サーバーログ確認**
   ```bash
   docker logs if-hub | grep -i "loaded config"
   ```

#### フィルタリングが動作しない場合

1. **設備名の正確性確認**
   ```bash
   curl "http://localhost:3001/api/equipment"
   ```

2. **config.yamlの内容確認**
   - source_tagsセクションの存在
   - gtagsセクションの存在
   - タグ名の正確性

3. **サーバー再起動実施**
   ```bash
   docker compose restart
   ```

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

### gtag名の新形式

**重要**: IF-HUBでは、gtag名から設備名を除去した新形式を採用しています：

- **旧形式**: `Pump01.EfficiencyIndex`
- **新形式**: `EfficiencyIndex`

### gtag定義とconfig.yamlの関係

gtag管理は以下の2つのファイルで分離管理されています：

1. **gtag定義**: `gtags/EfficiencyIndex/def.json`で計算ロジックを定義
2. **設備関連付け**: `configs/equipments/Pump01/config.yaml`のgtagsセクションで関連付け

この分離により、同一gtag定義を複数設備で共有できます。

### gtag定義ファイル（def.json）の例

#### 計算タイプ

```json
{
  "name": "EfficiencyIndex",
  "type": "calculation",
  "inputs": ["Flow", "Power"],
  "expression": "(inputs[0] / inputs[1])",
  "description": "効率指数（流量/消費電力）",
  "unit": ""
}
```

#### 移動平均タイプ

```json
{
  "name": "TempMA",
  "type": "moving_average",
  "inputs": ["Temperature"],
  "window": 5,
  "description": "温度の移動平均",
  "unit": "°C"
}
```

#### Z-scoreタイプ

```json
{
  "name": "LevelZscore",
  "type": "zscore",
  "inputs": ["Level"],
  "window": 24,
  "description": "水位のZ-score（異常検知用）",
  "unit": ""
}
```

#### カスタムタイプ

```json
{
  "name": "PredictedLevel",
  "type": "custom",
  "inputs": ["Level", "InFlow", "OutFlow"],
  "implementation": "bin/predict_level.py",
  "function": "predict_future_level",
  "params": {
    "prediction_minutes": 30
  },
  "description": "30分後の水位予測",
  "unit": "m"
}
```

### 新しいgtagの追加方法

新しいgtagを追加する場合は、以下の手順で実施します：

1. **gtag定義の作成**
   ```bash
   mkdir -p gtags/NewMetric
   vim gtags/NewMetric/def.json
   ```

2. **定義ファイル（def.json）の記述**
   ```json
   {
     "name": "NewMetric",
     "type": "calculation",
     "inputs": ["Flow", "Power"],
     "expression": "(inputs[0] * inputs[1])",
     "description": "新しい指標",
     "unit": ""
   }
   ```

3. **設備設定への追加**
   ```yaml
   # configs/equipments/Pump01/config.yaml
   basemap:
     source_tags:
       - "Flow"
       - "Power"
     gtags:
       - "EfficiencyIndex"
       - "TempMA"
       - "NewMetric"  # 新しいgtagを追加
   ```

4. **必要に応じてカスタム実装を追加**
   ```bash
   mkdir -p gtags/NewMetric/bin
   vim gtags/NewMetric/bin/custom_calc.py
   chmod +x gtags/NewMetric/bin/custom_calc.py
   ```

5. **サーバー再起動**
   ```bash
   docker compose restart
   ```

6. **動作確認**
   ```bash
   # gtagが認識されることを確認
   curl "http://localhost:3001/api/tags?equipment=Pump01&includeGtags=true"
   
   # 特定のgtagをテスト
   curl "http://localhost:3001/api/gtags/NewMetric?equipment=Pump01"
   ```

**注意**: config.yamlファイルを変更した場合は、必ずサーバーの再起動が必要です。

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

## Fetcher/Ingester運用管理

### Fetcherの運用

#### 概要と目的

IF-HUB Fetcherは、IF-HUBからのデータ抽出・整形・条件フィルタリングを行うフロントエンド機構です。設備単位・条件付きでのタグ/gtagデータ抽出機構を提供し、CSV形式でデータを保存します。

主な機能：
- 通常のタグ/gtagの取得機能
- 条件付きデータ取得（`only_when`構文）
- 設定ファイルによる柔軟な制御
- 増分データ取得機能（`--latest`オプション）
- 大量データの自動ファイル分割（デフォルト: 10万行ごと）
- タイムスタンプベースのファイル命名

#### インストールと設定

```bash
# Fetcherディレクトリに移動
cd fetcher

# 依存パッケージのインストール
npm install

# TypeScriptのビルド
npm run build
```

#### 基本的な実行方法

```bash
# 設備のデータを取得
./run.sh --equipment Pump01

# 特定のタグのみ取得
./run.sh --equipment Pump01 --tags Pump01.Temperature,Pump01.Pressure

# 期間指定
./run.sh --equipment Pump01 --start "2023-01-01T00:00:00Z" --end "2023-01-31T23:59:59Z"

# 最新データのみ取得（前回の最終時刻以降）
./run.sh --equipment Pump01 --latest

# 条件付き取得（温度が50度より大きい場合のみ）
./run.sh --equipment Pump01 --filter "Pump01|Temperature > 50"
./run.sh --equipment Pump01 --filter "Temperature > 50"
```

#### 設定ファイル管理

設定ファイル（`./fetcher/config.yaml`）でデフォルト設定を行います：

```yaml
# 設備一覧
equipment:
  - name: Pump01
    # 取得対象のタグ一覧
    tags:
      - Pump01.Flow
      - Pump01.Temperature
    # 条件定義
    conditions:
      # only_when: 特定の条件を満たす時間帯のみデータを抽出
      only_when:
        - tag: Pump01.Temperature
          condition: "> 45"

# 出力設定
output:
  format: csv
  directory: "./data"
  max_rows_per_file: 100000

# IF-HUB API設定
if_hub_api:
  base_url: "http://localhost:3001"
  timeout: 30000
  max_records_per_request: 10000
  page_size: 1000
```

#### 出力ファイル管理

データは指定した出力ディレクトリの下に設備ごとのサブディレクトリに保存されます：

```
data/
  ├── Pump01/
  │   ├── Pump01_20230101_000000-20230105_235959.csv
  │   └── Pump01_20230106_000000-20230110_120535.csv
  └── Tank01/
      └── Tank01_20230101_000000-20230110_235959.csv
```

#### Fetcherのトラブルシューティング

**接続エラーが発生する場合：**
1. IF-HUBサーバーが起動しているか確認
2. `config.yaml`の`base_url`設定を確認
3. ネットワーク接続を確認

**設定エラーが発生する場合：**
1. YAML構文エラーがないか確認
2. 指定したタグIDが正しいか確認
3. 条件式の構文が正しいか確認

**出力エラーが発生する場合：**
1. 出力ディレクトリの書き込み権限を確認
2. ディスク容量を確認
3. ファイル分割設定を見直し

### Ingesterの運用

#### 概要と目的

IF-HUB PI Data Ingesterは、PI SystemからのプロセスデータをIF-HUBの静的設備データとして取り込むためのデータ取得モジュールです。PI System（OSIsoft PI）からプロセスデータを定期的に取得し、IF-HUBで利用可能なCSV形式で出力します。

主な機能：
- 自動スケジュール実行（設備ごとに設定された間隔でデータを自動取得）
- 増分データ取得（前回取得時刻から継続してデータを取得）
- 設定ファイルベース（YAML形式の設定ファイルによる柔軟な設定）
- 堅牢性（リトライ機能、エラーハンドリング、状態管理）
- Docker対応（コンテナ化による簡単なデプロイメント）
- CSV自動変換（PI-APIからの生データをIF-HUB形式に自動変換）
- メタデータ抽出（タグの表示名と単位を自動抽出）

#### Docker環境での運用

**前提条件：**
- Docker & Docker Compose
- PI API Server（PI Systemへのアクセス）

**コンテナ実行：**
```bash
# イメージをビルド
docker build -t if-hub-pi-ingester ./ingester

# コンテナを実行
docker run -d \
  --name pi-ingester \
  -v $(pwd)/configs:/app/configs:ro \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/static_equipment_data:/app/static_equipment_data \
  if-hub-pi-ingester
```

**Docker Compose（推奨）：**
```yaml
version: '3.8'
services:
  pi-ingester:
    build: ./ingester
    container_name: if-hub-pi-ingester
    restart: unless-stopped
    volumes:
      - ./configs:/app/configs:ro
      - ./logs:/app/logs
      - ./static_equipment_data:/app/static_equipment_data
    environment:
      - TZ=Asia/Tokyo
    depends_on:
      - if-hub
```

#### 設定ファイル管理

**共通設定（`configs/common.yaml`）：**
```yaml
pi_api:
  host: "127.0.0.1"
  port: 3011
  timeout: 30000
  max_retries: 3
  retry_interval: 5000

logging:
  level: "info"
  file: "/app/logs/ingester.log"

data_acquisition:
  fetch_margin_seconds: 30
  max_history_days: 30
```

**設備設定（`configs/equipments/{設備名}/{設定名}.yaml`）：**
```yaml
basemap:
  addplot:
    interval: "10m"
    lookback_period: "10D"

  source_tags:
    - "POW:711034.PV"
    - "POW:7T105B1.PV"

pi_integration:
  enabled: true
  output_filename: "7th-untan.csv"
```

#### ログ監視とヘルスチェック

**状態ファイルの確認：**
取得状態は`/app/logs/ingester-state.json`に保存されます：

```json
{
  "equipment": {
    "7th-untan/short-term": {
      "lastFetchTime": "2025-06-04T03:00:00.000Z",
      "lastSuccessTime": "2025-06-04T03:00:00.000Z",
      "errorCount": 0
    }
  },
  "lastUpdated": "2025-06-04T03:00:30.123Z"
}
```

**ログの確認：**
```bash
# リアルタイムログ
docker logs -f if-hub-pi-ingester

# 状態ファイルの確認
cat logs/ingester-state.json | jq .
```

**ヘルスチェック：**
```bash
# ヘルスチェック状況を確認
docker ps

# コンテナの詳細状態
docker inspect if-hub-pi-ingester
```

#### Ingesterのトラブルシューティング

**PI-API-Serverに接続できない場合：**
1. `configs/common.yaml`のホスト・ポート設定を確認
2. PI-API-Serverが起動しているか確認
3. ネットワーク接続を確認
4. 接続テスト：
   ```bash
   curl "http://10.255.234.21:3011/PIData?TagNames=TEST:TAG&StartDate=20250604000000&EndDate=20250604010000"
   ```

**設定ファイルが見つからない場合：**
1. 設定ファイルのパスと名前を確認
2. `pi_integration.enabled: true`が設定されているか確認
3. YAML構文チェック：
   ```bash
   cat configs/common.yaml | python -c "import yaml; import sys; yaml.safe_load(sys.stdin)"
   ```

**出力ディレクトリに書き込めない場合：**
1. ディレクトリの権限を確認
2. Dockerボリュームマウントを確認
3. ディスク容量を確認

## メンテナンス

### ログ管理

- ログは`logs`ディレクトリに保存されます
- サーバー起動時のログはコンソールに出力されます
- エラーログはコンソールと`logs`ディレクトリの両方に出力されます

### バックアップと復元

#### データベースのバックアップ

```bash
# データベースのバックアップ（TimescaleDB in Docker）
docker exec -t if-hub-timescaledb pg_dump -U if_hub_user -d if_hub -F c > backup_$(date +%Y%m%d).dump

# バックアップからの復元
cat backup_20230101.dump | docker exec -i if-hub-timescaledb pg_restore -U if_hub_user -d if_hub -c

# または、pg_dumpをSQL形式で出力する場合
docker exec -t if-hub-timescaledb pg_dump -U if_hub_user -d if_hub > backup_$(date +%Y%m%d).sql
cat backup_20230101.sql | docker exec -i if-hub-timescaledb psql -U if_hub_user -d if_hub
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
2. データベースが接続可能か確認
   ```bash
   # TimescaleDBコンテナの状態確認
   docker ps | grep timescaledb

   # データベース接続テスト（Docker経由）
   docker exec if-hub-timescaledb psql -U if_hub_user -d if_hub -c "SELECT 1;"
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

#### config.yaml関連の問題

1. **設備が認識されない場合**
   ```bash
   # config.yamlファイルの存在確認
   ls -la configs/equipments/*/config.yaml
   
   # YAML構文チェック
   python -c "import yaml; yaml.safe_load(open('configs/equipments/Pump01/config.yaml'))"
   ```

2. **設備フィルタリングが動作しない場合**
   ```bash
   # サーバー再起動の実行
   docker compose restart
   
   # EquipmentConfigManagerのログ確認
   docker logs if-hub | grep -i "loaded config"
   ```

3. **gtagが表示されない場合**
   ```bash
   # config.yamlのgtagsセクション確認
   cat configs/equipments/Pump01/config.yaml
   
   # gtag定義ファイルの存在確認
   ls -la gtags/EfficiencyIndex/def.json
   ```

#### gtag関連の問題

1. **gtag定義が正しいか確認**
   ```bash
   # 新形式のgtag定義確認
   cat gtags/TempMA/def.json
   ```

2. **gtag一覧を確認**
   ```bash
   # 設備フィルタリングを含むgtag一覧
   curl "http://localhost:3001/api/tags?equipment=Pump01&includeGtags=true"
   ```

3. **特定のgtagをテスト**
   ```bash
   # 新形式でのgtag取得（設備指定あり）
   curl "http://localhost:3001/api/gtags/TempMA?equipment=Pump01"
   ```

4. **gtag定義とconfig.yaml関連付けの確認**
   ```bash
   # 設備のconfig.yamlでgtagが定義されているか確認
   grep -A5 "gtags:" configs/equipments/Pump01/config.yaml
   
   # gtag定義ディレクトリの存在確認
   ls -la gtags/TempMA/
   ```

5. **APIレスポンスのエラーメッセージを確認**
   - gtag名の誤記（設備名が含まれていないか）
   - 対象設備でgtagが有効化されているか
   - サーバー再起動後の動作確認
