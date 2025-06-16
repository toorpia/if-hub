# toorPIA Backend Analyzer Plugin

IF-HUB製造設備データをtoorPIA backend APIと連携して、ベースマップ生成・追加プロット処理を行うプラグインです。

## 機能概要

- **ベースマップ生成**: fit_transform APIを使用した基盤マップ作成
- **追加プロット**: addplot APIを使用したリアルタイムデータプロット
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
  
  auth:
    session_key: "your_session_key_here"
  
  basemap_processing:
    parameters:
      label: "設備名 Basemap"
      description: "設備の基盤マップ"
      weight_option_str: "1:0"
      type_option_str: "1:date"
  
  addplot_processing:
    parameters:
      weight_option_str: "1:0"
      type_option_str: "1:date"
  
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

### fit_transform (ベースマップ生成)

```json
{
  "columns": ["timestamp", "tag1", "tag2", ...],
  "data": [["2025-01-01T00:00:00", 1.0, 2.0], ...],
  "label": "設備名 Basemap",
  "tag": "equipment_basemap",
  "description": "基盤マップ説明",
  "weight_option_str": "1:0",
  "type_option_str": "1:date"
}
```

### addplot (追加プロット)

```json
{
  "columns": ["timestamp", "tag1", "tag2", ...],
  "data": [["2025-01-01T00:00:00", 1.0, 2.0], ...],
  "mapNo": 1,
  "weight_option_str": "1:0",
  "type_option_str": "1:date"
}
```

### 期待レスポンス

```json
{
  "message": "success",
  "resdata": {
    "mapNo": 1,
    "shareUrl": "http://...",
    "status": "completed"
  }
}
```

## ライセンス

IF-HUBプロジェクトのライセンスに従います。
