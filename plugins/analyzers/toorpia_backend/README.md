# toorPIA Backend Analyzer Plugin

IF-HUB製造設備データをtoorPIA backend APIと連携して、ベースマップ生成・追加プロット処理を行うプラグインです。高度な異常検知機能（identna/detabn）を活用した製造設備の異常監視を提供します。

## 機能概要

- **ベースマップ生成**: fit_transform APIを使用した基盤マップ作成
- **正常領域自動識別（identna）**: ベースマップ作成時に正常データの分布領域を自動特定
- **追加プロット**: addplot APIを使用したリアルタイムデータプロット
- **リアルタイム異常度判定（detabn）**: 追加プロット時に既存の正常領域との比較で異常度を算出
- **異常検知レポート**: 異常度スコアと判定結果（normal/abnormal/unknown）をリアルタイム取得
- **並列処理対応**: 複数設備での同時実行サポート
- **排他制御**: 設備別ロック機構による処理の安全性確保
- **一時ファイル管理**: ユニークファイル名による衝突回避

## インストール

### 依存関係

```bash
pip install requests>=2.25.0 pandas>=1.3.0 pyyaml>=5.4.0
```

### 設定ファイル準備

設備設定ファイル（`configs/equipments/{equipment}/config.yaml`）に`toorpia_integration`セクションを追加します：

```yaml
toorpia_integration:
  enabled: true
  api_url: "http://localhost:3000"
  timeout: 300
  
  endpoints:
    fit_transform: "/data/fit_transform"
    addplot: "/data/addplot"
  
  # 認証設定（APIキー認証）
  auth:
    api_key: "toorpia_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    auto_refresh: true
  
  # basemap処理設定（identna対応）
  basemap_processing:
    mode: "fit_transform"
    parameters:
      label: "設備名"
      description: "設備の基盤マップ"
      weight_option_str: "1:0"
      type_option_str: "1:date"
      # identnaパラメータ（正常領域識別）
      identna_resolution: 100        # メッシュ解像度（デフォルト: 100）
      identna_effective_radius: 0.1  # 有効半径比率（デフォルト: 0.1）
  
  # addplot処理設定（detabn対応）
  addplot_processing:
    mode: "addplot"
    parameters:
      weight_option_str: "1:0"
      type_option_str: "1:date"
      # detabnパラメータ（異常度判定）
      detabn_max_window: 5           # 最大ウィンドウサイズ（デフォルト: 5）
      detabn_rate_threshold: 1.0     # 異常率閾値（デフォルト: 1.0）
      detabn_threshold: 0            # 正常領域閾値（デフォルト: 0）
      detabn_print_score: true       # 詳細スコア情報出力（デフォルト: true）
  
  logging:
    level: "INFO"
    filename: "toorpia_analyzer.log"
    max_size_mb: 10
    backup_count: 5
    console: true
  
  validation:
    required_response_fields: ["message", "resdata"]
    required_resdata_fields: ["mapNo"]
  
  state:
    last_map_no: null
```

### identna/detabnパラメータの詳細

#### identnaパラメータ（正常領域識別）
- `identna_resolution`: メッシュ解像度。値が大きいほど細かい領域分割が可能（計算量も増加）
- `identna_effective_radius`: 有効半径比率。各データポイント周辺の影響範囲を制御

#### detabnパラメータ（異常度判定）
- `detabn_max_window`: 異常率計算に使用する最大ウィンドウサイズ
- `detabn_rate_threshold`: 異常率の下限閾値（この値以上で異常と判定）
- `detabn_threshold`: 正常領域相対値の閾値（この値より大きければ正常）
- `detabn_print_score`: 詳細なスコア情報を出力に含めるかどうか

## 使用方法

### 統一実行システム経由

```bash
# addplot更新（通常の高頻度実行）
python plugins/run_plugin.py --type analyzer --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode addplot_update

# basemap更新（低頻度実行）
python plugins/run_plugin.py --type analyzer --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml \
  --mode basemap_update
```

### 直接実行

```bash
# 直接実行
python plugins/analyzers/toorpia_backend/run.py \
  configs/equipments/7th-untan/config.yaml \
  --mode addplot_update

# 設定バリデーション
python plugins/analyzers/toorpia_backend/run.py \
  configs/equipments/7th-untan/config.yaml \
  --validate-only

# ステータス確認
python plugins/analyzers/toorpia_backend/run.py \
  configs/equipments/7th-untan/config.yaml \
  --status
```

### 環境変数による制御

```bash
# 処理モード指定
export TOORPIA_MODE=basemap_update
python plugins/analyzers/toorpia_backend/run.py configs/equipments/7th-untan/config.yaml
```

## 運用設定

### Cron設定例

```bash
# 10分ごとのaddplot処理
*/10 * * * * cd /path/to/if-hub && python plugins/run_plugin.py --type analyzer --name toorpia_backend --config configs/equipments/7th-untan/config.yaml --mode addplot_update

# 10日ごとのbasemap更新
0 2 */10 * * cd /path/to/if-hub && python plugins/run_plugin.py --type analyzer --name toorpia_backend --config configs/equipments/7th-untan/config.yaml --mode basemap_update
```

### ログ監視

```bash
# リアルタイムログ監視
tail -f logs/7th-untan/toorpia_analyzer.log

# エラーログ抽出
grep -i error logs/*/toorpia_analyzer.log
```

## 異常検知機能

このプラグインは、toorPIAエンジンとanalysis_toolkitの`identna`・`detabn`ツールを統合した高度な異常検知機能を提供します。

### 主要機能

1. **正常領域の自動識別（identna）**
   - ベースマップ作成時に正常データの分布領域を自動的に特定
   - メッシュベースの正常領域ファイル（normal_area.dat）を生成
   - 解像度や有効半径などのパラメータをAPI経由で調整可能

2. **リアルタイム異常度判定（detabn）**
   - 追加プロット時に既存の正常領域との比較で異常度を算出
   - ウィンドウベースの判定により、データ群全体での異常度評価
   - 異常度スコアと判定結果（normal/abnormal/unknown）をリアルタイムで取得

3. **柔軟な判定方法**
   - identnaベースの統計的手法（デフォルト）
   - 将来的に幾何学的判定やハイブリッド手法にも対応予定

### 実用例

- **製造業**: 生産ラインのセンサーデータから品質異常を早期発見
- **プロセス監視**: 設備稼働状況から故障予兆を検出
- **品質管理**: 製品特性データから不良品を自動検知

## アーキテクチャ

### クラス構成

- **BaseAnalyzer**: 抽象基底クラス（共通インターフェース）
- **ToorPIAAnalyzer**: toorPIA API連携の具体実装
- **EquipmentLockManager**: 設備別排他制御
- **TempFileManager**: 一時ファイル管理

### データフロー

1. **設定読み込み**: 設備別設定ファイル解析
2. **排他制御**: 設備別ロック取得
3. **データ取得**: Fetcherによる時系列データ抽出
4. **API呼び出し**: toorPIA backend API連携
5. **応答検証**: レスポンスバリデーション
6. **ログ記録**: 設備別ログ出力
7. **クリーンアップ**: 一時ファイル削除・ロック解除

### ディレクトリ構造

```
plugins/analyzers/toorpia_backend/
├── __init__.py
├── run.py                    # エントリーポイント
├── toorpia_analyzer.py       # メイン実装
├── plugin_meta.yaml         # プラグインメタデータ
└── README.md                # このファイル

logs/{equipment}/            # 設備別ログ
├── toorpia_analyzer.log
├── toorpia_analyzer.log.1
└── .lock                   # ロックファイル

tmp/                        # 一時ファイル
└── {equipment}_{timestamp}_{pid}_{uuid}.csv
```

## トラブルシューティング

### よくある問題

| エラー | 原因 | 解決方法 |
|--------|------|----------|
| `Lock acquisition timeout` | 前回プロセス残存 | ロックファイル削除 |
| `API call failed: Connection refused` | toorPIA server停止 | サーバー起動確認 |
| `Failed to fetch equipment data` | Fetcher実行失敗 | 設備設定確認 |
| `Config validation failed` | 設定不備 | 設定ファイル修正 |

### デバッグ実行

```bash
# 詳細ログ有効化
export TOORPIA_DEBUG=1
python plugins/analyzers/toorpia_backend/run.py configs/equipments/7th-untan/config.yaml --mode addplot_update
```

### ロック状態確認

```bash
# ロックファイル確認
ls -la logs/*/\\.lock

# プロセス確認
ps aux | grep toorpia_backend
```

## API 仕様

### fit_transform (ベースマップ生成 - identna対応)

```json
{
  "columns": ["timestamp", "tag1", "tag2", ...],
  "data": [["2025-01-01T00:00:00", 1.0, 2.0], ...],
  "label": "設備名",
  "tag": "equipment_basemap",
  "description": "基盤マップ説明",
  "weight_option_str": "1:0",
  "type_option_str": "1:date",
  "identna_resolution": 100,
  "identna_effective_radius": 0.1
}
```

### addplot (追加プロット - detabn対応)

```json
{
  "columns": ["timestamp", "tag1", "tag2", ...],
  "data": [["2025-01-01T00:00:00", 1.0, 2.0], ...],
  "mapNo": 1,
  "weight_option_str": "1:0",
  "type_option_str": "1:date",
  "detabn_max_window": 5,
  "detabn_rate_threshold": 1.0,
  "detabn_threshold": 0,
  "detabn_print_score": true
}
```

### 期待レスポンス

#### fit_transform (ベースマップ生成)

```json
{
  "message": "success",
  "resdata": {
    "mapNo": 1,
    "shareUrl": "http://...",
    "status": "completed",
    "normalAreaFile": "normal_area.dat"
  }
}
```

#### addplot (追加プロット - 異常検知結果付き)

```json
{
  "message": "success",
  "resdata": {
    "mapNo": 1,
    "addPlotNo": 1,
    "shareUrl": "http://...",
    "status": "completed",
    "abnormalityStatus": "normal",
    "abnormalityScore": 0.15,
    "abnormalityDetails": {
      "total_points": 10,
      "abnormal_points": 1,
      "abnormal_rate": 0.1,
      "window_size": 5,
      "detection_method": "detabn"
    }
  }
}
```

#### 異常検知結果の説明

- `abnormalityStatus`: 判定結果（"normal", "abnormal", "unknown"）
- `abnormalityScore`: 異常度スコア（0.0-1.0の範囲）
- `abnormalityDetails`: 詳細情報
  - `total_points`: 判定対象データポイント総数
  - `abnormal_points`: 異常と判定されたポイント数
  - `abnormal_rate`: 異常率（abnormal_points / total_points）
  - `window_size`: 実際に使用されたウィンドウサイズ
  - `detection_method`: 使用された検出手法

## ライセンス

IF-HUBプロジェクトのライセンスに従います。
