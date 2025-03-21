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
  - [実装例](#実装例)
    - [Node.js クライアント実装例](#nodejs-クライアント実装例)
    - [Python クライアント実装例](#python-クライアント実装例)
    - [設備のCSVデータエクスポート](#設備のcsvデータエクスポート-1)
    - [curl を使った例](#curl-を使った例)

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
  "storage": "SQLite database"
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
    "type": "SQLite",
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
      "equipment": "Pump01",
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
      "equipment": "Pump01",
      "name": "Temperature",
      "source_tag": "Temperature",
      "unit": "°C",
      "display_name": "ポンプ01.温度"
    },
    {
      "id": "Pump02.Temperature",
      "equipment": "Pump02",
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
          "equipment": "Pump01",
          "name": "Temperature",
          "source_tag": "Temperature",
          "unit": "°C",
          "min": 50.2,
          "max": 79.8
        },
        {
          "id": "Pump01.Pressure",
          "equipment": "Pump01",
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

```
GET /api/process/:target
```

既存のタグに対して動的に様々な処理を実行します。指定されたタグに対して一時的に処理を適用し、結果を取得します。

**パスパラメータ:**

| パラメータ | 型 | 説明 |
|----------|------|-------------|
| `target` | String | 処理対象のタグ名/ID (例: "Pump01.Temperature") |

**クエリパラメータ:**

| パラメータ | 型 | 説明 | デフォルト |
|----------|------|-------------|---------|
| `type` | String | 処理タイプ ("raw", "moving_average", "zscore", "deviation") | "raw" |
| `window` | Number | 窓サイズ（移動平均、Z-score、偏差の場合） | タイプに依存 |
| `start` | String | 開始日時 (ISO 8601形式) | なし (全期間) |
| `end` | String | 終了日時 (ISO 8601形式) | なし (全期間) |
| `timeshift` | Boolean | 過去データを現在時刻にシフトするか | false |
| `display` | Boolean | タグの表示名を含めるか | false |
| `lang` | String | 表示名の言語コード | "ja" |
| `showUnit` | Boolean | 表示名に単位を含めるかどうか | false |

**リクエスト例:**

```
GET /api/process/Pump01.Temperature?type=moving_average&window=10&timeshift=true
```

**レスポンス例:**

```json
{
  "target": "Pump01.Temperature",
  "type": "moving_average",
  "metadata": {
    "id": "Pump01.Temperature",
    "equipment": "Pump01",
    "name": "Temperature",
    "source_tag": "Temperature",
    "unit": "°C",
    "min": 50.2,
    "max": 79.8
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
- サーバー実行中にgtag定義が追加・変更された場合、自動的に検出され反映されます

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

IF-HUBは、効率的なデータ管理のために最適化されたデータベース設計を採用しています：

#### tags テーブル
```sql
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  source_tag TEXT NOT NULL,
  unit TEXT,
  min REAL,
  max REAL
)
```

#### tag_data テーブル
```sql
CREATE TABLE IF NOT EXISTS tag_data (
  tag_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  value REAL,
  PRIMARY KEY (tag_id, timestamp),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
)
```

#### tag_translations テーブル
```sql
CREATE TABLE IF NOT EXISTS tag_translations (
  tag_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT,
  PRIMARY KEY (tag_id, language),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
)
```

#### gtags テーブル
```sql
CREATE TABLE IF NOT EXISTS gtags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  equipment TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  type TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
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
curl http://localhost:3001/api/process/ma/Pump01.Temperature?window=10&timeshift=true
