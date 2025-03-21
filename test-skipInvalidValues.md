# 不定値処理機能（skipInvalidValues）テスト手順

このドキュメントでは、CSVエクスポート機能の不定値処理オプション（`skipInvalidValues`）の動作を検証するためのテスト手順を説明します。

## 前提条件

- IF-HUBサーバーが実行されていること
- テスト用のgtagが登録されていること（設定済み）
  - `Test.ZeroDivision`: 0除算によりInfinityを生成
  - `Test.NaNGen`: NaNを生成
  - `Test.ValidCalc`: 通常の計算（コントロール用）

## テスト実行手順

1. IF-HUBサーバーを起動

```bash
npm start
```

2. 別のターミナルでテストスクリプトを実行

```bash
node test-csv-export.js
```

テストスクリプトは以下の処理を行います:

- 3つの異なる設定でCSVをエクスポート
  - デフォルト設定（`skipInvalidValues`パラメータなし）
  - `skipInvalidValues=true`を明示的に指定
  - `skipInvalidValues=false`を指定
- 出力されたCSVファイルの内容を分析し、不定値（Infinity、NaN）の処理が正しいかを確認

## 出力ファイル

- `test_default.csv`: デフォルト設定での出力
- `test_skip_true.csv`: `skipInvalidValues=true`での出力
- `test_skip_false.csv`: `skipInvalidValues=false`での出力

## 期待結果

1. `test_default.csv` と `test_skip_true.csv`:
   - `Test.ZeroDivision` 列の値が空セルであること（Infinityが空に変換）
   - `Test.NaNGen` 列の値が空セルであること（NaNが空に変換）
   - `Test.ValidCalc` 列には正常な値が表示されていること

2. `test_skip_false.csv`:
   - `Test.ZeroDivision` 列に `Infinity` または `Inf` が表示されていること
   - `Test.NaNGen` 列に `NaN` が表示されていること
   - `Test.ValidCalc` 列には正常な値が表示されていること

## 手動検証（オプション）

出力されたCSVファイルを以下のアプリケーションで開き、表示に問題がないかを確認します:

1. テキストエディタ（VSCode、メモ帳など）
2. スプレッドシートアプリケーション（Microsoft Excel、Google Sheetsなど）

## 補足

テスト用のgtagは以下の設定になっています:

1. **Test.ZeroDivision**:
```json
{
  "name": "Test.ZeroDivision",
  "type": "calculation",
  "inputs": ["Pump01.Flow", "Pump01.Flow"],
  "expression": "inputs[0] / (inputs[1] - inputs[1])",
  "description": "ゼロ除算テスト（Infinity発生）",
  "unit": "",
  "equipment": "Test"
}
```

2. **Test.NaNGen**:
```json
{
  "name": "Test.NaNGen",
  "type": "calculation",
  "inputs": ["Pump01.Flow"],
  "expression": "0/0",
  "description": "NaN生成テスト（不定値発生）",
  "unit": "",
  "equipment": "Test"
}
```

3. **Test.ValidCalc**:
```json
{
  "name": "Test.ValidCalc",
  "type": "calculation",
  "inputs": ["Pump01.Flow"],
  "expression": "inputs[0] * 2",
  "description": "有効な計算テスト（コントロール用）",
  "unit": "",
  "equipment": "Test"
}
