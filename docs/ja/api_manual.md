# IndustryFlow Hub API マニュアル

## 目次

- [IndustryFlow Hub API マニュアル](#industryflow-hub-api-マニュアル)
  - [目次](#目次)
  - [API概要](#api概要)
    - [ベースURL](#ベースurl)
    - [共通パラメータ](#共通パラメータ)
    - [エラーレスポンス](#エラーレスポンス)
  - [システム情報 API](#システム情報-api)
    - [システム情報の取得](#システム情報の取得)
    - [サーバーステータスの取得](#サーバーステータスの取得)
  - [タグデータ操作 API](#タグデータ操作-api)
    - [タグ一覧の取得](#タグ一覧の取得)
    - [ソースタグによるタグ検索](#ソースタグによるタグ検索)
    - [設備一覧の取得](#設備一覧の取得)
    - [特定タグのデータ取得](#特定タグのデータ取得)
    - [複数タグのバッチ取得](#複数タグのバッチ取得)
    - [最新値の取得](#最新値の取得)
  - [gtag API](#gtag-api)
    - [gtagデータの取得](#gtagデータの取得)
    - [動的プロセス実行](#動的プロセス実行)
      - [1. 標準データ取得APIを使用（推奨方法）](#1-標準データ取得apiを使用推奨方法)
  - [データエクスポート API](#データエクスポート-api)
    - [設備のCSVデータエクスポート](#設備のcsvデータエクスポート)
  - [計算生成タグ（gtag）システム](#計算生成タグgtagシステム)
    - [概要](#概要)
    - [gtag定義の構造](#gtag定義の構造)
      - [計算タイプの例：](#計算タイプの例)
      - [移動平均タイプの例：](#移動平均タイプの例)
      - [Z-scoreタイプの例：](#z-scoreタイプの例)
      - [カスタムタイプの例：](#カスタムタイプの例)
    - [gtagの使用方法](#gtagの使用方法)
      - [新しいgtagの追加方法](#新しいgtagの追加方法)
      - [柔軟なタグ参照](#柔軟なタグ参照)
      - [タグ一覧と設備一覧でのgtag表示](#タグ一覧と設備一覧でのgtag表示)
    - [gtagの同期と更新](#gtagの同期と更新)
  - [レスポンス形式](#レスポンス形式)
    - [成功時レスポンス構造](#成功時レスポンス構造)
    - [エラー時レスポンス構造](#エラー時レスポンス構造)
  - [表示名オプション](#表示名オプション)
    - [display パラメータの使用方法](#display-パラメータの使用方法)
    - [lang パラメータの使用方法](#lang-パラメータの使用方法)
    - [showUnit パラメータの使用方法](#showunit-パラメータの使用方法)
    - [表示名の重複処理](#表示名の重複処理)
  - [システム運用機能](#システム運用機能)
    - [タグメタデータファイルの動的更新](#タグメタデータファイルの動的更新)
  - [システム内部アーキテクチャ](#システム内部アーキテクチャ)
    - [データベース設計](#データベース設計)
      - [tags テーブル](#tags-テーブル)
      - [tag\_data テーブル](#tag_data-テーブル)
      - [tag\_translations テーブル](#tag_translations-テーブル)
      - [gtags テーブル](#gtags-テーブル)
    - [タグID参照の仕組み](#タグid参照の仕組み)
  - [関連ツールとAPI連携](#関連ツールとapi連携)
    - [Fetcherとの連携](#fetcherとの連携)
      - [概要](#概要-1)
      - [FetcherによるAPI利用の仕組み](#fetcherによるapi利用の仕組み)
      - [条件付きデータ取得でのAPI活用](#条件付きデータ取得でのapi活用)
      - [大量データ取得時のページネーション処理](#大量データ取得時のページネーション処理)
      - [Fetcherの設定とAPI連携](#fetcherの設定とapi連携)
    - [Ingesterとの連携](#ingesterとの連携)
      - [概要](#概要-2)
      - [データ取り込みフロー](#データ取り込みフロー)
      - [メタデータの自動抽出と連携](#メタデータの自動抽出と連携)
      - [増分データ取得との連携](#増分データ取得との連携)
      - [スケジュール実行とAPI連携](#スケジュール実行とapi連携)
  - [実装例](#実装例)
    - [Node.js クライアント実装例](#nodejs-クライアント実装例)
    - [Python クライアント実装例](#python-クライアント実装例)
    - [設備のCSVデータエクスポート](#設備のcsvデータエクスポート-1)
    - [curl を使った例](#curl-を使った例)
- [プロセス専用API](#プロセス専用api)
- [あるいは標準データ取得API（推奨）](#あるいは標準データ取得api推奨)

## API概要

IndustryFlow Hub (IF-HUB) は、製造設備の時系列データにアクセスするためのRESTful APIを提供しています。全てのAPIエンドポイントは、標準的なHTTPメソッドとJSONレスポンス形式を使用しています。

### ベースURL

```
http://{hostname}:{port}/api
```

デフォルト設定では:
- 開発環境: `http://localhost:3001/api`
- Docker環境: `http://localhost:3001/api`

### 共通パラメータ

多くのAPIエンドポイントで使用できる共通パラメータ:

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `display` | Boolean | タグの表示名を含めるかどうか | false |
| `lang` | String | 表示名の言語コード (例: "ja", "en") | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするかどうか | false |

### エラーレスポンス

エラーが発生した場合、APIは適切なHTTPステータスコードとJSONエラーオブジェクトを返します:

```json
{
  "error": "エラーの種類",
  "message": "詳細なエラーメッセージ"
}
```

一般的なHTTPステータスコード:

- `200 OK` - リクエスト成功
- `400 Bad Request` - 不正なリクエスト
- `404 Not Found` - リソースが見つからない
- `500 Internal Server Error` - サーバー内部エラー

## システム情報 API

### システム情報の取得

```
GET /api/system/info
```

システムの基本情報を取得します。

**レスポンス例:**

```json
{
  "name": "IndustryFlow Hub",
  "version": "1.0.0",
  "tagCount": 48,
  "equipmentCount": 3,
  "environment": "development",
  "storage": "TimescaleDB (PostgreSQL)"
}
```

### サーバーステータスの取得

```
GET /api/status
```

サーバーの現在の状態と統計情報を取得します。

**レスポンス例:**

```json
{
  "status": "ok",
  "timestamp": "2023-01-01T12:00:00.000Z",
  "environment": "development",
  "database": {
    "type": "TimescaleDB",
    "tags": 48,
    "equipment": 3,
    "dataPoints": 12480
  }
}
```

## タグデータ操作 API

### タグ一覧の取得

```
GET /api/tags
```

システム内のタグ情報を取得します。設備パラメータを指定することで、特定の設備に関連するタグのみをフィルタリングできます。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `equipment` | String | 特定の設備のタグのみを取得（カンマ区切りで複数指定可能） | なし（全設備） |
| `display` | Boolean | タグの表示名を含めるかどうか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**レスポンス例:**

```json
{
  "tags": [
    {
      "id": "Pump01.Temperature",
      "equipments": ["Pump01"],
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "min": 50.2,
      "max": 79.8,
      "display_name": "Temperature"
    },
    ...
  ]
}
```

**タグ順序について**: 設備フィルタリング時（`equipment`パラメータ指定時）、タグはその設備のconfig.yamlファイルで定義された順序で返されます。これにより、CSVエクスポートやデータ表示において一貫した順序でタグが配列されます。

**設備横断タグ管理**: 同一のソースタグを複数の設備で利用することができます。例えば、「Temperature」というソースタグが複数の設備で使用されている場合、`equipments`フィールドに関連する全ての設備が配列として含まれます。

### ソースタグによるタグ検索

```
GET /api/tags/sourceTag/:sourceTag
```

元のCSVタグ名（ソースタグ）を使用してタグを検索します。このエンドポイントを利用すると、異なる設備間で同じソースタグ名を持つタグをまとめて取得できます。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `sourceTag` | String | 検索するソースタグ名（例: "Temperature"） |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `equipment` | String | 特定の設備のタグのみに絞り込み | なし（全設備） |
| `display` | Boolean | タグの表示名を含めるかどうか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**レスポンス例:**

```json
{
  "sourceTag": "Temperature",
  "tags": [
    {
      "id": "Pump01.Temperature",
      "equipments": ["Pump01"],
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "display_name": "ポンプ01.温度"
    },
    {
      "id": "Pump02.Temperature",
      "equipments": ["Pump02"],
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "display_name": "ポンプ02.温度"
    }
  ]
}
```

### 設備一覧の取得

```
GET /api/equipment
```

システム内のすべての設備情報を取得します。`includeTags=true`パラメータを指定すると、各設備に関連するタグ情報も含まれます。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `includeTags` | Boolean | 設備に関連するタグ情報を含めるかどうか | false |
| `display` | Boolean | タグの表示名を含めるかどうか（`includeTags=true`の場合に有効） | false |
| `lang` | String | 表示名の言語コード（`includeTags=true`の場合に有効） | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか（`includeTags=true`の場合に有効） | false |

**レスポンス例 (includeTags=false):**

```json
{
  "equipment": [
    {
      "id": "Pump01",
      "name": "Pump01",
      "tagCount": 4
    },
    ...
  ]
}
```

**レスポンス例 (includeTags=true):**

```json
{
  "equipment": [
    {
      "id": "Pump01",
      "name": "Pump01",
      "tagCount": 4,
      "tags": [
        {
          "id": "Pump01.Temperature",
          "equipments": ["Pump01"],
          "name": "Temperature",
          "source_tag": "Temperature",
          "unit": "°C",
          "min": 50.2,
          "max": 79.8
        },
        {
          "id": "Pump01.Pressure",
          "equipments": ["Pump01"],
          "name": "Pressure",
          "source_tag": "Pressure",
          "unit": "kPa",
          "min": 100.3,
          "max": 150.7
        },
        ...
      ]
    },
    ...
  ]
}
```

### 特定タグのデータ取得

```
GET /api/data/:tagId
```

指定したタグIDのデータを取得します。また、処理オプションを指定することで、取得したデータに対して様々な計算処理を適用できます。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `tagId` | String | 取得するタグのID (例: "Pump01.Temperature") |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `processing` | String | 処理タイプ (moving_average、zscore、deviation) | なし (処理なし) |
| `window` | Number | 処理窓サイズ | 処理タイプに依存 |

**処理オプション:**

| 処理タイプ | 説明 | 窓サイズのデフォルト |
|----------|------|-------------|
| `moving_average` | 移動平均を計算 | 5 |
| `zscore` | Z-score（標準化スコア）を計算 | null（全データ使用） |
| `deviation` | 偏差値を計算 | null（全データ使用） |

**レスポンス例:**

```json
{
  "tagId": "Pump01.Temperature",
  "metadata": {
    "id": "Pump01.Temperature",
    "equipment": "Pump01",
    "name": "Temperature",
    "source_tag": "Temperature",
    "unit": "°C",
    "min": 50.2,
    "max": 79.8,
    "display_name": "ポンプ01.温度"
  },
  "data": [
    {
      "timestamp": "2023-01-01T00:00:00.000Z",
      "value": 75.2
    },
    {
      "timestamp": "2023-01-01T00:10:00.000Z",
      "value": 76.1
    },
    ...
  ]
}
```

### 複数タグのバッチ取得

```
GET /api/batch
```

複数のタグデータを一度に取得します。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `tags` | String | カンマ区切りのタグID (必須) | - |
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `processing` | String | 処理タイプ (moving_average、zscore、deviation) | なし (処理なし) |
| `window` | Number | 処理窓サイズ | 処理タイプに依存 |

**リクエスト例:**

```
GET /api/batch?tags=Pump01.Temperature,Pump01.Pressure&timeshift=true&display=true
```

**レスポンス例:**

```json
{
  "Pump01.Temperature": {
    "metadata": {
      "id": "Pump01.Temperature",
      "equipment": "Pump01",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "min": 50.2,
      "max": 79.8,
      "display_name": "ポンプ01.温度"
    },
    "data": [
      {
        "timestamp": "2023-03-01T12:00:00.000Z",
        "value": 75.2
      },
      ...
    ]
  },
  "Pump01.Pressure": {
    "metadata": {
      "id": "Pump01.Pressure",
      "equipment": "Pump01",
      "name": "Pressure",
      "source_tag": "Pressure",
      "unit": "kPa",
      "min": 100.3,
      "max": 150.7,
      "display_name": "ポンプ01.圧力"
    },
    "data": [
      {
        "timestamp": "2023-03-01T12:00:00.000Z",
        "value": 120.5
      },
      ...
    ]
  }
}
```

### 最新値の取得

```
GET /api/current
```

複数タグの最新値を取得します。ポーリング機能の実装に最適です。

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `tags` | String | カンマ区切りのタグID (必須) | - |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/current?tags=Pump01.Temperature,Pump01.Pressure&display=true
```

**レスポンス例:**

```json
{
  "Pump01.Temperature": {
    "timestamp": "2023-03-01T12:30:00.000Z",
    "value": 76.3,
    "metadata": {
      "id": "Pump01.Temperature",
      "equipment": "Pump01",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "min": 50.2,
      "max": 79.8,
      "display_name": "ポンプ01.温度"
    }
  },
  "Pump01.Pressure": {
    "timestamp": "2023-03-01T12:30:00.000Z",
    "value": 122.7,
    "metadata": {
      "id": "Pump01.Pressure",
      "equipment": "Pump01",
      "name": "Pressure",
      "source_tag": "Pressure",
      "unit": "kPa",
      "min": 100.3,
      "max": 150.7,
      "display_name": "ポンプ01.圧力"
    }
  }
}
```

## gtag API

### gtagデータの取得

```
GET /api/gtags/:name
```

特定のgtag（生成タグ）のデータを計算し取得します。このエンドポイントは移動平均、Z-score、カスタム計算など、様々なタイプのgtagに対応しています。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `name` | String | 取得するgtagの名前 (例: "Pump01.TempMA") |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `params` | JSON文字列 | 追加パラメータ（JSON形式） | {} |

**リクエスト例:**

```
GET /api/gtags/Pump01.TempMA?timeshift=true&display=true
```

**レスポンス例:**

```json
{
  "name": "Pump01.TempMA",
  "type": "moving_average",
  "metadata": {
    "description": "ポンプ01温度の移動平均",
    "unit": "°C",
    "equipment": "Pump01"
  },
  "data": [
    {
      "timestamp": "2023-03-01T12:00:00.000Z",
      "value": 75.4,
      "original": 75.2
    },
    {
      "timestamp": "2023-03-01T12:10:00.000Z",
      "value": 75.8,
      "original": 76.1
    },
    ...
  ]
}
```

### 動的プロセス実行

既存のタグに対して動的に様々な処理を適用する方法は主に2つあります：

#### 1. 標準データ取得APIを使用（推奨方法）

```
GET /api/data/:tagId?processing=moving_average
```

タグデータ取得時に処理パラメータを指定することで、同時に処理を適用できます。これが標準的かつ推奨される方法です。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `tagId` | String | 処理対象のタグ名/ID (例: "Pump01.Temperature") |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `processing` | String | 処理タイプ ("moving_average", "zscore", "deviation") | なし (処理なし) |
| `window` | Number | 窓サイズ（移動平均、Z-score、偏差の場合） | タイプに依存 |

**リクエスト例:**

```
GET /api/data/Pump01.Temperature?processing=moving_average&window=10&timeshift=true
```

**注意**: この方法はバッチAPI (`/api/batch`) でも同様に適用できます。例：`/api/batch?tags=Tag1,Tag2&processing=zscore`


## データエクスポート API

### 設備のCSVデータエクスポート

```
GET /api/export/equipment/:equipmentId/csv
```

特定の設備に関連する全タグのデータをCSV形式でエクスポートします。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `equipmentId` | String | エクスポートする設備のID |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (最新データまで) |
| `includeGtags` | Boolean | 計算生成タグ(gtag)を含めるかどうか | true |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするかどうか | false |
| `display` | Boolean | カラム名にタグの表示名を使用するかどうか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |
| `skipInvalidValues` | Boolean | 不定値（Infinity、NaNなど）を空セルとして出力するかどうか | true |
| `zeroAsNull` | Boolean | 値0をnull（空白）として出力するかどうか | false |
| `zeroAsNullTags` | String | 特定のタグのみ値0をnull（空白）として出力するためのカンマ区切りタグリスト | なし |
| `processing` | String | 処理タイプ (moving_average、zscore、deviation) | なし (処理なし) |
| `window` | Number | 処理窓サイズ | 処理タイプに依存 |

**レスポンスヘッダー:**

```
Content-Type: text/csv
Content-Disposition: attachment; filename={equipmentId}_data_{timestamp}.csv
```

**CSVフォーマット:**

- 1列目: `datetime` - データポイントのタイムスタンプ (ISO 8601形式)
- 2列目以降: 設備に関連する通常タグ（ID順にソート）
- 最後尾: 設備に関連するgtag（ID順にソート、`includeGtags=true`の場合のみ）

**カラム名の形式:**

- `display=false`の場合: タグID (例: `Pump01.Temperature`)
- `display=true`の場合: タグの表示名 (例: `ポンプ01.温度`)
- `display=true&showUnit=true`の場合: 単位付き表示名 (例: `ポンプ01.温度 (°C)`)

**リクエスト例:**

```
GET /api/export/equipment/Pump01/csv?start=2023-01-01T00:00:00Z&display=true&lang=ja&showUnit=true
```

**レスポンス例 (display=false):**

```csv
datetime,Pump01.Flow,Pump01.Pressure,Pump01.Temperature,Pump01.EfficiencyIndex
2023-01-01T00:00:00.000Z,15.3,120.5,75.2,12.7
2023-01-01T00:10:00.000Z,15.5,121.7,76.1,12.7
...
```

**レスポンス例 (display=true&showUnit=true, 日本語):**

```csv
datetime,ポンプ01.流量 (L/min),ポンプ01.圧力 (kPa),ポンプ01.温度 (°C),ポンプ01.効率指標 (%)
2023-01-01T00:00:00.000Z,15.3,120.5,75.2,12.7
2023-01-01T00:10:00.000Z,15.5,121.7,76.1,12.7
...
```

## 計算生成タグ（gtag）システム

仮想タグ（gtag）は、複数の実タグを組み合わせて計算処理を行うための拡張機能です。物理的に測定できない値や複雑な指標を計算するのに役立ちます。

### 概要

gtagには以下のタイプがあります：

1. **計算タイプ（calculation）**：数式を使用して複数タグの値を計算
2. **移動平均タイプ（moving_average）**：単一タグの移動平均を計算
3. **Z-scoreタイプ（zscore）**：標準化スコアを計算（異常検知などに有用）
4. **偏差タイプ（deviation）**：偏差値を計算
5. **カスタムタイプ（custom）**：カスタム実装を使用した複雑な計算
6. **生データタイプ（raw）**：元データをそのまま返す

### gtag定義の構造

IF-HUBの最新バージョンでは、各gtagは独立したディレクトリで管理され、以下のようなディレクトリ構造となります：

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

#### 計算タイプの例：

```json
{
  "name": "Pump01.Efficiency",
  "type": "calculation",
  "inputs": ["Pump01.Flow", "Pump01.Power"],
  "expression": "(inputs[0] / inputs[1])",
  "description": "ポンプ効率（流量/消費電力）",
  "unit": "%"
}
```

#### 移動平均タイプの例：

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

#### Z-scoreタイプの例：

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

#### カスタムタイプの例：

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

### gtagの使用方法

#### 新しいgtagの追加方法

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

#### 柔軟なタグ参照

gtag定義の`inputs`フィールドでは、以下の様々な形式でタグを参照できます：

1. **タグ名（tags.name）**: `"Pump01.Temperature"`
2. **ソースタグ（source_tag）**: `"Temperature"`
3. **設備＋ソースタグ**: `"Pump01:Temperature"`
4. **タグID（整数）**: `1`

この柔軟性により、さまざまな方法でタグを参照でき、メンテナンス性が向上します。

#### タグ一覧と設備一覧でのgtag表示

タグ一覧API (`/api/tags`) と設備一覧API (`/api/equipment?includeTags=true`) は、デフォルトでgtagを含めます。gtagを除外するには、クエリパラメータ `includeGtags=false` を使用します。

```
GET /api/tags?includeGtags=false
GET /api/equipment?includeTags=true&includeGtags=false
```

### gtagの同期と更新

- gtagは階層型ディレクトリ構造で管理され、各gtagは独自のディレクトリを持ちます
- サーバー起動時に全てのgtag定義が読み込まれます
- サーバー実行中にgtag定義が追加・変更された場合、最大1分以内に自動的に検出され反映されます（サーバー再起動不要）

## レスポンス形式

### 成功時レスポンス構造

APIの成功レスポンスはJSON形式で返されます。レスポンスの構造はエンドポイントによって異なりますが、一般的に以下の要素が含まれます：

- メタデータ（タグ情報、タイムスタンプなど）
- 実際のデータ配列

### エラー時レスポンス構造

エラーが発生した場合、JSONエラーオブジェクトとHTTPエラーステータスコードが返されます：

```json
{
  "error": "エラータイプ",
  "message": "詳細なエラーメッセージ"
}
```

一般的なエラーコード:

- `400 Bad Request` - 不正なパラメータまたはリクエスト
- `404 Not Found` - 指定されたタグまたはリソースが見つからない
- `500 Internal Server Error` - サーバー内部エラー

## 表示名オプション

IF-HUBはタグIDに対する表示名マッピングをサポートしています。これにより、生のタグID（例: `Pump01.Temperature`）を人間が読みやすい名前（例: `ポンプ01.温度`）に変換できます。

### display パラメータの使用方法

`display=true`をクエリパラメータとして追加すると、APIレスポンスにはタグメタデータ内に`display_name`フィールドが含まれます：

```
GET /api/data/Pump01.Temperature?display=true
```

### lang パラメータの使用方法

異なる言語の表示名を取得するには、`lang`パラメータを使用します：

```
GET /api/data/Pump01.Temperature?display=true&lang=en
```

サポートされている言語コード:
- `ja` - 日本語（デフォルト）
- `en` - 英語
- その他、必要に応じて追加可能

### showUnit パラメータの使用方法

`showUnit=true`をクエリパラメータとして追加すると、表示名に単位情報が含まれた形式で返されます：

```
GET /api/data/Pump01.Temperature?display=true&showUnit=true
```

表示例: `Temperature (°C)`

`showUnit=false`（またはパラメータ省略時）の場合は、単位情報が含まれない表示名が返されます：

```
GET /api/data/Pump01.Temperature?display=true&showUnit=false
```

表示例: `Temperature`

### 表示名の重複処理

同じ表示名が複数のタグに割り当てられている場合、APIは自動的に重複を検出し、2つ目以降のタグの表示名にサフィックスを追加します：

- 最初のタグ： `Temperature`
- 2つ目のタグ： `Temperature_1`
- 3つ目のタグ： `Temperature_2`

この処理はAPIレスポンス時に動的に行われ、元のデータベースの内容は変更されません。サフィックスの追加はタグIDの順序に基づいて一貫して適用されます。

## システム運用機能

### タグメタデータファイルの動的更新

IF-HUBは、サーバーの実行中にタグメタデータファイルが更新された場合、自動的に変更を検出して反映します。

- タグメタデータファイルは `tag_metadata` ディレクトリ内の `translations_[言語コード].csv` という命名規則のCSVファイルです
- サーバー起動時に既存のタグメタデータファイルが読み込まれます
- サーバー実行中にタグメタデータファイルが更新された場合、5分以内に自動的に新しいメタデータ内容が反映されます
- 変更の検出はファイルのチェックサムに基づいて行われるため、実際に内容が変更された場合のみ再読み込みが実行されます

この機能により、サーバーの再起動なしでタグの表示名を更新できます。新しい設備や測定点が追加された場合や、表示名の修正が必要になった場合に便利です。


## システム内部アーキテクチャ

### データベース設計

IF-HUBは、TimescaleDB（PostgreSQLの拡張）を使用して時系列データを効率的に管理しています：

#### tags テーブル
```sql
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source_tag TEXT NOT NULL,
  unit TEXT,
  min DOUBLE PRECISION,
  max DOUBLE PRECISION
);
```

#### tag_data テーブル（Hypertable）
```sql
CREATE TABLE tag_data (
  tag_id INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION,
  PRIMARY KEY (tag_id, timestamp)
);

-- Convert to hypertable (30-day chunks)
SELECT create_hypertable('tag_data', 'timestamp',
  chunk_time_interval => INTERVAL '30 days',
  if_not_exists => TRUE
);
```

#### tag_translations テーブル
```sql
CREATE TABLE tag_translations (
  tag_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT,
  PRIMARY KEY (tag_id, language),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### gtags テーブル
```sql
CREATE TABLE gtags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  type TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### タグID参照の仕組み

IF-HUBでは、ユーザー向けのタグ名とシステム内部のIDを区別して効率的にデータを管理しています：

1. **ユーザーインターフェース**: APIリクエストでは `Pump01.Temperature` のような読みやすいタグ名を使用
2. **内部処理**: システム内部では整数型の自動採番IDを使用し、データベースでの検索と参照を最適化
3. **変換プロセス**: 
   ```
   APIリクエスト (タグ名) → 内部ID検索 → データベースクエリ (整数ID) → データ取得 → レスポンス (タグ名)
   ```

この二重構造により、人間が理解しやすいインターフェースを維持しながら、データベースの効率性とパフォーマンスを最大化しています。これはとくに大量のデータポイントを持つシステムで重要な最適化です。

## 関連ツールとAPI連携

### Fetcherとの連携

#### 概要

IF-HUB Fetcherは、IF-HUB APIを活用してデータ抽出・条件付きフィルタリングを行うクライアントツールです。FetcherがIF-HUB APIを効率的に使用することで、大量データの取得や条件に基づく選択的なデータ抽出を実現しています。

#### FetcherによるAPI利用の仕組み

**1. データ取得フロー:**
```
Fetcher → IF-HUB API → データベース → APIレスポンス → CSV出力
```

**2. 使用される主要APIエンドポイント:**

- **設備情報の取得:**
  ```
  GET /api/equipment?includeTags=true&includeGtags=true
  ```
  取得可能なタグとgtagの一覧を確認

- **バッチデータ取得:**
  ```
  GET /api/batch?tags=Pump01.Temperature,Pump01.Pressure&start=2023-01-01T00:00:00Z&end=2023-01-31T23:59:59Z
  ```
  複数タグのデータを一度に取得

- **時系列データ取得:**
  ```
  GET /api/data/:tagId?start=2023-01-01T00:00:00Z&end=2023-01-31T23:59:59Z
  ```
  個別タグのデータを取得

#### 条件付きデータ取得でのAPI活用

Fetcherの`only_when`構文は、以下のAPIパターンを使用してデータをフィルタリングします：

```
equipment:
  - name: Pump01
    tags:
      - Pump01.Flow
      - Pump01.Temperature
    conditions:
      only_when:
        - tag: Pump01.Temperature
          condition: "> 45"
```

1. **条件判定用データの取得:**
   ```
   GET /api/data/Pump01.Temperature?start=2023-01-01T00:00:00Z&end=2023-01-31T23:59:59Z
   ```

2. **条件を満たす時間範囲の特定:**
   ```javascript
   // Fetcher内部処理
   const conditionData = await fetchTemperatureData();
   const validTimeRanges = conditionData.filter(point => point.value > 50);
   ```

3. **条件を満たす時間範囲のデータを取得:**
   ```
   GET /api/batch?tags=Pump01.Flow,Pump01.Pressure&start=2023-01-01T10:00:00Z&end=2023-01-01T15:00:00Z
   ```

#### 大量データ取得時のページネーション処理

Fetcherは大量データを効率的に処理するため、以下のパターンでAPIを呼び出します：

```javascript
// 実装例（Fetcher内部）
async function fetchLargeDataset(tagId, startTime, endTime) {
  const pageSize = 1000;
  let allData = [];
  let currentStart = startTime;
  
  while (currentStart < endTime) {
    const response = await fetch(
      `/api/data/${tagId}?start=${currentStart}&pageSize=${pageSize}`
    );
    
    const pageData = await response.json();
    allData = allData.concat(pageData.data);
    
    // 次のページの開始時刻を設定
    const lastPoint = pageData.data[pageData.data.length - 1];
    currentStart = new Date(lastPoint.timestamp);
  }
  
  return allData;
}
```

#### Fetcherの設定とAPI連携

**設定例（config.yaml）:**
```yaml
if_hub_api:
  base_url: "http://localhost:3001"
  timeout: 30000
  max_records_per_request: 10000
  page_size: 1000
  
equipment:
  - name: Pump01
    tags:
      - Pump01.Flow
      - Pump01.Temperature
    conditions:
      only_when:
        - tag: Pump01.Temperature
          condition: "> 45"
```

この設定に基づいて、Fetcherは以下のAPIコールを実行します：

1. タグ検証: `GET /api/tags?equipment=Pump01`
2. 条件データ取得: `GET /api/data/Pump01.Temperature`
3. メインデータ取得: `GET /api/batch?tags=Pump01.Flow,Pump01.Temperature`

### Ingesterとの連携

#### 概要

IF-HUB PI Data Ingesterは、PI SystemからIF-HUBへのデータ取り込みを自動化するツールです。PI-APIから取得したデータをIF-HUBの静的データ形式（CSV）に変換し、IF-HUBのデータ読み込み機能を活用してシステムに統合します。

#### データ取り込みフロー

```
PI System → PI-API → Ingester → CSV出力 → IF-HUB自動読み込み → API利用可能
```

**1. PI-APIからのデータ取得:**
```javascript
// Ingester内部処理例
const response = await axios.get(
  `http://pi-api-server:3011/PIData?TagNames=${tagNames}&StartDate=${startDate}&EndDate=${endDate}`
);
```

**2. IF-HUB形式への変換:**
```javascript
// PI-APIレスポンスをCSV形式に変換
const csvData = convertToIFHubFormat(piApiResponse);
```

**3. CSV出力:**
```
static_equipment_data/7th-untan.csv
```

**4. IF-HUBによる自動読み込み:**
IF-HUBの動的データ更新機能により、新しいCSVファイルが自動的に検出・読み込みされ、APIで利用可能になります。

#### メタデータの自動抽出と連携

Ingesterは、PI Systemからタグの表示名と単位情報を自動抽出し、IF-HUBのタグメタデータシステムと連携します：

**1. メタデータ抽出:**
```javascript
// PI-APIからメタデータを取得
const metadataResponse = await axios.get(
  `http://pi-api-server:3011/TagAttributes?TagNames=${tagNames}`
);
```

**2. translations_ja.csvの生成:**
```csv
source_tag,display_name,unit
POW:711034.PV,電力計測値,kW
POW:7T105B1.PV,温度計測値,°C
```

**3. IF-HUBでの表示名適用:**
生成されたtranslationsファイルにより、以下のAPIで表示名が利用可能になります：

```
GET /api/tags?display=true&lang=ja
GET /api/data/7th-untan.POW:711034.PV?display=true
```

#### 増分データ取得との連携

Ingesterの増分データ取得機能は、IF-HUBのタイムスタンプベースのデータ管理と連携して効率的な更新を実現します：

**1. 最終取得時刻の管理:**
```json
// ingester-state.json
{
  "equipment": {
    "7th-untan/short-term": {
      "lastFetchTime": "2025-06-04T03:00:00.000Z",
      "lastSuccessTime": "2025-06-04T03:00:00.000Z"
    }
  }
}
```

**2. 増分データの取得:**
```javascript
// 前回取得時刻以降のデータのみを取得
const startDate = state.lastFetchTime;
const endDate = new Date();
```

**3. IF-HUBでの重複回避:**
IF-HUBの`INSERT OR REPLACE`機能により、同じタイムスタンプのデータは自動的に更新され、重複が回避されます。

#### スケジュール実行とAPI連携

Ingesterのスケジュール実行により、定期的にデータが更新され、IF-HUB APIで最新データが利用可能になります：

**設定例:**
```yaml
basemap:
  addplot:
    interval: "10m"  # 10分ごとに実行
    lookback_period: "10D"
```

**実行サイクル:**
1. 10分ごとにPI-APIからデータ取得
2. CSV形式で出力
3. IF-HUBが1分以内に自動検出・読み込み
4. APIで最新データが利用可能

この連携により、ほぼリアルタイムでPI SystemのデータをIF-HUB APIで利用できます。

## 実装例

### Node.js クライアント実装例

```javascript
// if-hub-client.js
class IFHUBClient {
  constructor(baseUrl = 'http://localhost:3001/api') {
    this.baseUrl = baseUrl;
  }
  
  async getSystemInfo() {
    const response = await fetch(`${this.baseUrl}/system/info`);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
  
  async getTags(options = {}) {
    const { display = false, lang = 'ja', showUnit = false } = options;
    const params = new URLSearchParams();
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/tags${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return await response.json();
  }
  
  async getTagData(tagId, options = {}) {
    const { start, end, timeshift = false, display = false, lang = 'ja', showUnit = false } = options;
    
    const params = new URLSearchParams();
    if (start) params.append('start', new Date(start).toISOString());
    if (end) params.append('end', new Date(end).toISOString());
    if (timeshift) params.append('timeshift', 'true');
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/data/${tagId}${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Tag ${tagId} not found`);
      }
      throw new Error(`API error: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  async getCurrentValues(tagIds, options = {}) {
    const { display = false, lang = 'ja', showUnit = false } = options;
    
    const params = new URLSearchParams();
    params.append('tags', Array.isArray(tagIds) ? tagIds.join(',') : tagIds);
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/current?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    
    return await response.json();
  }
  
  async getMovingAverage(tagId, options = {}) {
    const { window = 5, start, end, timeshift = false, display = false, lang = 'ja', showUnit = false } = options;
    
    const params = new URLSearchParams();
    params.append('window', window.toString());
    if (start) params.append('start', new Date(start).toISOString());
    if (end) params.append('end', new Date(end).toISOString());
    if (timeshift) params.append('timeshift', 'true');
    if (display) params.append('display', 'true');
    if (lang) params.append('lang', lang);
    if (showUnit) params.append('showUnit', 'true');
    
    const url = `${this.baseUrl}/process/ma/${tagId}?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Tag ${tagId} not found`);
      }
      throw new Error(`API error: ${response.statusText}`);
    }
    
    return await response.json();
  }
}

// Node.js環境とブラウザ環境の両方でエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IFHUBClient;
} else {
  window.IFHUBClient = IFHUBClient;
}
```

### Python クライアント実装例

```python
# if_hub_client.py
import requests
from datetime import datetime
import json

class IFHUBClient:
    def __init__(self, base_url='http://localhost:3001/api'):
        self.base_url = base_url
        
    def get_system_info(self):
        response = requests.get(f"{self.base_url}/system/info")
        response.raise_for_status()
        return response.json()
    
    def get_tags(self, display=False, lang='ja', show_unit=False):
        params = {}
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/tags", params=params)
        response.raise_for_status()
        return response.json()
    
    def get_tag_data(self, tag_id, start=None, end=None, timeshift=False, display=False, lang='ja', show_unit=False):
        params = {}
        if start:
            params['start'] = start.isoformat() if isinstance(start, datetime) else start
        if end:
            params['end'] = end.isoformat() if isinstance(end, datetime) else end
        if timeshift:
            params['timeshift'] = 'true'
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/data/{tag_id}", params=params)
        response.raise_for_status()
        return response.json()
    
    def get_current_values(self, tag_ids, display=False, lang='ja', show_unit=False):
        if isinstance(tag_ids, list):
            tag_ids = ','.join(tag_ids)
            
        params = {
            'tags': tag_ids
        }
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/current", params=params)
        response.raise_for_status()
        return response.json()
    
    def get_moving_average(self, tag_id, window=5, start=None, end=None, 
                          timeshift=False, display=False, lang='ja', show_unit=False):
        params = {
            'window': window
        }
        if start:
            params['start'] = start.isoformat() if isinstance(start, datetime) else start
        if end:
            params['end'] = end.isoformat() if isinstance(end, datetime) else end
        if timeshift:
            params['timeshift'] = 'true'
        if display:
            params['display'] = 'true'
        if lang:
            params['lang'] = lang
        if show_unit:
            params['showUnit'] = 'true'
            
        response = requests.get(f"{self.base_url}/process/ma/{tag_id}", params=params)
        response.raise_for_status()
        return response.json()
```

### 設備のCSVデータエクスポート

```
GET /api/export/equipment/:equipmentId/csv
```

特定の設備に関連する全タグのデータをCSV形式でエクスポートします。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `equipmentId` | String | エクスポートする設備のID |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (最新データまで) |
| `includeGtags` | Boolean | 計算生成タグ(gtag)を含めるかどうか | true |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするかどうか | false |
| `display` | Boolean | カラム名にタグの表示名を使用するかどうか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**レスポンスヘッダー:**

```
Content-Type: text/csv
Content-Disposition: attachment; filename={equipmentId}_data_{timestamp}.csv
```

**CSVフォーマット:**

- 1列目: `datetime` - データポイントのタイムスタンプ (ISO 8601形式)
- 2列目以降: 設備に関連する通常タグ（ID順にソート）
- 最後尾: 設備に関連するgtag（ID順にソート、`includeGtags=true`の場合のみ）

**カラム名の形式:**

- `display=false`の場合: タグID (例: `Pump01.Temperature`)
- `display=true`の場合: タグの表示名 (例: `ポンプ01.温度`)
- `display=true&showUnit=true`の場合: 単位付き表示名 (例: `ポンプ01.温度 (°C)`)

**リクエスト例:**

```
GET /api/export/equipment/Pump01/csv?start=2023-01-01T00:00:00Z&display=true&lang=ja&showUnit=true
```

**レスポンス例 (display=false):**

```csv
datetime,Pump01.Flow,Pump01.Pressure,Pump01.Temperature,Pump01.EfficiencyIndex
2023-01-01T00:00:00.000Z,15.3,120.5,75.2,12.7
2023-01-01T00:10:00.000Z,15.5,121.7,76.1,12.7
...
```

**レスポンス例 (display=true&showUnit=true, 日本語):**

```csv
datetime,ポンプ01.流量 (L/min),ポンプ01.圧力 (kPa),ポンプ01.温度 (°C),ポンプ01.効率指標 (%)
2023-01-01T00:00:00.000Z,15.3,120.5,75.2,12.7
2023-01-01T00:10:00.000Z,15.5,121.7,76.1,12.7
...
```

### curl を使った例

システム情報の取得:
```bash
curl http://localhost:3001/api/system/info
```

タグ一覧の取得（表示名付き）:
```bash
curl http://localhost:3001/api/tags?display=true&lang=ja
```

特定タグのデータ取得:
```bash
curl http://localhost:3001/api/data/Pump01.Temperature?start=2023-01-01T00:00:00Z&end=2023-01-02T00:00:00Z&display=true
```

複数タグの最新値を取得:
```bash
curl http://localhost:3001/api/current?tags=Pump01.Temperature,Pump01.Pressure&display=true
```

設備のCSVデータをエクスポート:
```bash
curl -o pump01_data.csv "http://localhost:3001/api/export/equipment/Pump01/csv?start=2023-01-01T00:00:00Z&display=true"
```

移動平均の計算:
```bash
# プロセス専用API
curl http://localhost:3001/api/process/Pump01.Temperature?type=moving_average&window=10&timeshift=true

# あるいは標準データ取得API（推奨）
curl http://localhost:3001/api/data/Pump01.Temperature?processing=moving_average&window=10&timeshift=true
