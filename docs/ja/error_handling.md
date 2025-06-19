# プラグインシステム エラーハンドリングガイド

## 📖 概要

IF-HUBプラグインシステムでは、堅牢で診断しやすいエラーハンドリング機構を提供しています。このガイドでは、エラーの分類、対処法、開発者向けカスタマイズ方法について詳しく説明します。

## 🏗️ エラー分類体系

プラグインシステムでは、エラーを以下のカテゴリに分類しています。

### 高重要度エラー（HIGH）

#### ConfigurationError
**原因**: 設定ファイルの構文エラー、必須パラメータの欠落、不正な設定値

**よくある例**:
```yaml
# ❌ 不正な設定例
toorpia_integration:
  # enabledが false または未設定
  enabled: false
  # api_urlが未設定
  # api_url: "http://localhost:3000"
```

**対処法**:
```yaml
# ✅ 正しい設定例
toorpia_integration:
  enabled: true
  api_url: "http://localhost:3000"
  auth:
    session_key: "your_api_key_here"
```

**エラーメッセージ例**:
```json
{
  "error": {
    "type": "ConfigurationError",
    "code": "CONFIG_ERROR",
    "message": "Missing 'toorpia_integration' section in config",
    "suggestions": [
      "設定ファイルの構文を確認してください",
      "必須フィールドが設定されているか確認してください"
    ]
  }
}
```

#### ProcessingModeError
**原因**: 不正な処理モード指定、サポートされていない処理モードの実行要求

**対処法**:
- 環境変数 `TOORPIA_MODE` の値を確認
- サポートされているモード: `basemap_update`, `addplot_update`

#### AuthenticationError
**原因**: toorPIA API認証の失敗、セッションキーの期限切れ

**対処法**:
```yaml
toorpia_integration:
  auth:
    session_key: "有効なAPIキー"
```

### 中重要度エラー（MEDIUM）

#### APIConnectionError
**原因**: API接続失敗、タイムアウト、ネットワーク問題

**自動回復機能**:
- 指数バックオフによる自動リトライ（最大3回）
- 回路ブレーカーによる障害隔離

**対処法**:
1. APIサーバーの稼働状況確認
2. ネットワーク接続確認
3. タイムアウト設定調整

#### DataFetchError
**原因**: 設備データの取得失敗、CSV生成エラー

**グレースフル・デグラデーション**:
- 一部タグ取得失敗時の利用可能データでの継続処理
- gtags取得失敗時の基本タグでの処理継続

#### ValidationError
**原因**: API応答の構造不正、必須フィールドの欠落

### 低重要度エラー（LOW）

#### LockError
**原因**: 設備別排他制御のロック取得失敗

**自動解決**:
- 時間経過による自動解放
- プロセス終了による自動クリーンアップ

#### TempFileError
**原因**: 一時ファイルの作成失敗、ディスク容量不足

## 🔄 自動回復機能

### リトライ機構

```python
# 自動設定されるリトライ動作
APIコール: 最大3回、指数バックオフ（1s, 2s, 4s）
データ取得: 最大5回、指数バックオフ（2s, 3s, 4.5s, 6.75s, 10s）
認証処理: 最大2回、固定間隔（0.5s, 1s）
```

### 回路ブレーカー

サービス別の保護設定:

| サービス | 失敗閾値 | 回復タイムアウト |
|----------|----------|------------------|
| toorPIA API | 3回 | 30秒 |
| IF-HUB API | 5回 | 60秒 |
| 認証処理 | 2回 | 120秒 |

## 🛠️ 運用時のトラブルシューティング

### よくあるエラーシナリオ

#### シナリオ1: プラグイン実行が開始されない

**症状**:
```json
{
  "error": {
    "type": "ConfigurationError",
    "message": "toorPIA integration is disabled"
  }
}
```

**解決手順**:
1. 設定ファイル確認: `configs/equipments/{equipment}/config.yaml`
2. `toorpia_integration.enabled: true` に設定
3. 必須フィールドの存在確認

#### シナリオ2: API認証エラー

**症状**:
```json
{
  "error": {
    "type": "AuthenticationError",
    "message": "Authentication failed: 401",
    "details": {
      "api_key_provided": true,
      "session_key_expired": true
    }
  }
}
```

**解決手順**:
1. APIキーの有効性確認
2. セッションキーの再取得
3. toorPIA Backend APIサーバーの稼働確認

#### シナリオ3: データ取得エラー

**症状**:
```json
{
  "error": {
    "type": "DataFetchError",
    "message": "No tags found for equipment: 7th-untan",
    "details": {
      "equipment_name": "7th-untan"
    }
  }
}
```

**解決手順**:
1. 設備名の正確性確認
2. IF-HUB APIでタグ一覧の手動確認:
   ```bash
   curl "http://localhost:3001/api/tags?equipment=7th-untan"
   ```
3. タグ定義の存在確認

#### シナリオ4: ロック取得失敗

**症状**:
```json
{
  "error": {
    "type": "LockError",
    "message": "Failed to acquire equipment lock",
    "details": {
      "equipment_name": "7th-untan",
      "lock_timeout": 30
    }
  }
}
```

**解決手順**:
1. 実行中プロセス確認:
   ```bash
   ps aux | grep toorpia_backend
   ```
2. ロックファイル手動削除:
   ```bash
   rm logs/7th-untan/.lock
   ```
3. プロセス強制終了（必要な場合）

### ログ解析方法

#### エラーログパターン

```bash
# 設備別エラーログ確認
grep -i error logs/7th-untan/toorpia_analyzer.log

# 特定エラータイプの統計
grep "ConfigurationError" logs/*/toorpia_analyzer.log | wc -l

# 時系列でのエラー発生確認
tail -f logs/7th-untan/toorpia_analyzer.log | grep -i error
```

#### 詳細診断コマンド

```bash
# システム全体の健康状態確認
python plugins/run_plugin.py run --type analyzer --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml --verbose

# 設定バリデーションのみ実行
python plugins/run_plugin.py validate --type analyzer --name toorpia_backend \
  --config configs/equipments/7th-untan/config.yaml
```

### 設定調整ガイド

#### タイムアウト調整

```yaml
toorpia_integration:
  timeout: 300  # API呼び出しタイムアウト（秒）
  
  # リトライ設定（高度な設定）
  retry_config:
    max_retries: 5
    base_delay: 2.0
    max_delay: 60.0
```

#### ログレベル調整

```yaml
toorpia_integration:
  logging:
    level: "DEBUG"  # ERROR, WARNING, INFO, DEBUG
    console: true   # コンソール出力有効化
    max_size_mb: 50 # ログファイル最大サイズ
```

## 🔧 開発者向け情報

### カスタムエラーハンドリング

#### 新しいエラータイプの追加

```python
from plugins.base.errors import PluginError

class CustomAnalyzerError(PluginError):
    """カスタムアナライザーエラー"""
    
    def __init__(self, message: str, analyzer_type: str = ""):
        details = {"analyzer_type": analyzer_type}
        suggestions = [
            "アナライザー固有の設定を確認してください",
            "ログファイルで詳細を確認してください"
        ]
        super().__init__(message, "CUSTOM_ANALYZER_ERROR", details, suggestions)
```

#### エラーハンドリング統合

```python
from plugins.base.errors import get_error_severity

class CustomAnalyzer(BaseAnalyzer):
    def execute(self) -> Dict[str, Any]:
        try:
            # 処理実行
            result = self._do_analysis()
            return self._create_success_response(result)
        
        except CustomAnalyzerError as e:
            severity = get_error_severity(e)
            self.logger.error(f"Custom error (severity: {severity}): {e}")
            return self._create_detailed_error_response(e)
```

### エラー拡張方法

#### プラグイン固有のバリデーション

```python
def validate_custom_config(self) -> bool:
    """カスタムバリデーション"""
    try:
        custom_config = self.config.get('custom_section', {})
        
        if not custom_config.get('required_field'):
            raise ConfigurationError(
                "Missing required_field in custom_section",
                config_path=self.config_path,
                invalid_field="custom_section.required_field"
            )
        
        return True
    
    except ConfigurationError:
        raise  # そのまま再発生
    except Exception as e:
        raise ConfigurationError(
            f"Custom validation failed: {str(e)}",
            config_path=self.config_path
        )
```

#### API クライアント拡張

```python
from plugins.base.api_client import EnhancedAPIClient, APIClientConfig

# カスタムAPIクライアント
class CustomAPIClient(EnhancedAPIClient):
    def __init__(self, base_url: str):
        config = APIClientConfig(
            base_url=base_url,
            timeout=60.0,
            enable_circuit_breaker=True,
            enable_retry=True
        )
        super().__init__(config, "custom_api")
    
    def custom_operation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """カスタム操作（自動リトライ・回路ブレーカー付き）"""
        response = self.post('/custom/endpoint', json=data)
        
        if not response.is_success():
            raise APIConnectionError(
                f"Custom operation failed: {response.status_code}",
                api_url=response.request_info['url'],
                status_code=response.status_code
            )
        
        return response.data
```

### 監視・メトリクス取得

#### エラー統計の取得

```python
from plugins.base.errors import create_error_summary

# エラー統計生成（複数エラーがある場合）
errors = [error1, error2, error3]
summary = create_error_summary(errors)

print(f"Total errors: {summary['total_errors']}")
print(f"High severity: {summary['severity_distribution']['HIGH']}")
print(f"Common suggestions: {summary['common_suggestions']}")
```

#### 健康状態モニタリング

```python
# API クライアントの健康状態
client = create_toorpia_client(api_url, api_key)
health_status = client.get_health_status()

# 回路ブレーカーの状態
circuit_breaker = client.circuit_breaker
metrics = circuit_breaker.get_metrics()

print(f"Circuit breaker state: {metrics['current_state']}")
print(f"Success rate: {metrics['success_rate_percent']}%")
```

## 📋 エラー対応フローチャート

```
エラー発生
    ↓
エラータイプ判定
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│ 設定エラー      │ API接続エラー   │ データエラー    │
│ (HIGH)          │ (MEDIUM)        │ (MEDIUM)        │
├─────────────────┼─────────────────┼─────────────────┤
│ 1. 設定確認     │ 1. 自動リトライ │ 1. 部分継続     │
│ 2. 構文チェック │ 2. 回路ブレーカー│ 2. フォールバック│
│ 3. 手動修正     │ 3. 手動確認     │ 3. 手動調査     │
└─────────────────┴─────────────────┴─────────────────┘
    ↓                ↓                ↓
成功まで再試行    ← 自動回復 →    → 運用チーム通知
```

## 📈 運用指標とアラート

### 推奨監視指標

| 指標 | 閾値 | アクション |
|------|------|------------|
| エラー率 | >5% | 調査開始 |
| 設定エラー発生 | 1件以上 | 即座対応 |
| API接続失敗 | >10%（5分間） | インフラ確認 |
| 回路ブレーカー開放 | 1回以上 | サービス確認 |

### アラート設定例

```bash
# Prometheus/Grafana設定例
- alert: PluginErrorRateHigh
  expr: plugin_error_rate > 0.05
  for: 5m
  annotations:
    summary: "Plugin error rate is above 5%"
    description: "Equipment {{ $labels.equipment }} error rate: {{ $value }}"

- alert: CircuitBreakerOpen
  expr: circuit_breaker_state == 1
  for: 1m
  annotations:
    summary: "Circuit breaker is open"
    description: "Service {{ $labels.service }} circuit breaker opened"
```

---

このエラーハンドリングシステムにより、プラグインの安定性と診断性が大幅に向上し、運用負荷を軽減できます。問題が発生した際は、このガイドを参照して体系的にトラブルシューティングを行ってください。
