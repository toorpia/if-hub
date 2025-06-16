# IF-HUB プラグインシステムガイド

## 目次

1. [プラグインシステム概要](#プラグインシステム概要)
2. [アーキテクチャとコンポーネント](#アーキテクチャとコンポーネント)
3. [プラグインタイプ](#プラグインタイプ)
4. [プラグイン開発ガイド](#プラグイン開発ガイド)
5. [プラグインメタデータ](#プラグインメタデータ)
6. [仮想環境管理](#仮想環境管理)
7. [プラグイン実行](#プラグイン実行)
8. [オフライン環境配置](#オフライン環境配置)
9. [エラーハンドリング](#エラーハンドリング)
10. [トラブルシューティング](#トラブルシューティング)

## プラグインシステム概要

IF-HUBのプラグインシステムは、データ解析・通知・表示機能を動的に拡張するためのフレームワークです。プラグインは独立した処理単位として実装され、設備固有の解析ロジックや外部システム連携を柔軟に組み込むことができます。

### 主な特徴

- **モジュラー設計**: 各プラグインは独立して開発・配置・実行可能
- **タイプ別分類**: analyzer、notifier、presenter の3つのタイプで機能を整理
- **仮想環境対応**: プラグインごとに独立した Python 仮想環境を管理
- **オフライン配置**: インターネット接続のない環境での安全な配置をサポート
- **設備固有設定**: 設備ごとの設定ファイルを基に動作をカスタマイズ
- **統一インターフェース**: 共通の実行フレームワークによる一貫した操作性

### 適用場面

- **設備固有解析**: 特定の設備や業界に特化したデータ解析
- **外部システム連携**: ERP、MES、他のデータベースとの統合
- **カスタム通知**: 条件に応じたアラートや報告書の自動生成
- **専用可視化**: 設備や用途に特化したダッシュボードやレポート

## アーキテクチャとコンポーネント

### システム全体図

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IF-HUB Core   │    │  Plugin Runner  │    │    Plugins      │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ RESTful API │ │    │ │run_plugin.py│ │    │ │ Analyzers   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Data Engine │ │◄───┤ │Virtual Env  │ │◄───┤ │ Notifiers   │ │
│ └─────────────┘ │    │ │Manager      │ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ └─────────────┘ │    │ ┌─────────────┐ │
│ │Config Loader│ │    │ ┌─────────────┐ │    │ │ Presenters  │ │
│ └─────────────┘ │    │ │Base Classes │ │    │ └─────────────┘ │
└─────────────────┘    │ └─────────────┘ │    └─────────────────┘
                       └─────────────────┘
```

### コアコンポーネント

#### 1. プラグインランナー (`plugins/run_plugin.py`)
- プラグインの動的読み込みと実行制御
- 仮想環境の自動選択
- エラーハンドリングと結果のJSON化
- 後方互換性のあるCLIインターフェース

#### 2. ベースクラス (`plugins/base/`)
- **BaseAnalyzer**: analyzer型プラグインの共通基底クラス
- **LockManager**: プラグイン実行の排他制御
- **TempFileManager**: 一時ファイルの自動管理

#### 3. 仮想環境管理 (`plugins/venv_management/`)
- **setup_venv_analyzer.sh**: analyzer用仮想環境の構築
- **package_venv.sh**: オフライン配置用パッケージング
- **requirements/**: プラグインタイプ別依存関係定義

### データフロー

```
設備設定ファイル
      ↓
  Plugin Runner
      ↓
  ┌─────────────────┐
  │1. メタデータ取得  │ → plugin_meta.yaml読み込み
  └─────────────────┘
      ↓
  ┌─────────────────┐
  │2. 仮想環境選択   │ → Python実行環境決定
  └─────────────────┘
      ↓
  ┌─────────────────┐
  │3. プラグイン実行  │ → BaseAnalyzer継承クラス実行
  └─────────────────┘
      ↓
  ┌─────────────────┐
  │4. 結果返却      │ → JSON形式で結果出力
  └─────────────────┘
```

## プラグインタイプ

### Analyzer（解析プラグイン）

**目的**: 設備データの解析・変換・加工を実行

**配置場所**: `plugins/analyzers/{plugin_name}/`

**実装例**:
```python
# plugins/analyzers/custom_analyzer/run.py
from plugins.base.base_analyzer import BaseAnalyzer

class CustomAnalyzer(BaseAnalyzer):
    def prepare(self) -> bool:
        """事前処理・テンプレート展開"""
        self.logger.info("Preparing custom analysis")
        return True
    
    def validate_config(self) -> bool:
        """設定ファイルバリデーション"""
        required_keys = ['analysis_params', 'target_tags']
        for key in required_keys:
            if key not in self.config:
                self.logger.error(f"Missing required config: {key}")
                return False
        return True
    
    def execute(self) -> Dict[str, Any]:
        """メイン解析処理"""
        try:
            # 解析ロジック実装
            analysis_result = self._perform_analysis()
            
            return self._create_success_response({
                "analysis_type": "custom",
                "results": analysis_result,
                "processed_tags": len(self.config.get('target_tags', []))
            })
        except Exception as e:
            return self._create_error_response(
                f"Analysis failed: {str(e)}", 
                "ANALYSIS_ERROR"
            )
    
    def _perform_analysis(self):
        # 実際の解析処理
        return {"status": "completed", "score": 0.85}

def run(config_path: str, **kwargs):
    analyzer = CustomAnalyzer(config_path)
    
    if not analyzer.validate_config():
        return analyzer._create_error_response("Config validation failed")
    
    if not analyzer.prepare():
        return analyzer._create_error_response("Preparation failed")
    
    return analyzer.execute()
```

### Notifier（通知プラグイン）

**目的**: 解析結果やイベントに基づく通知・アラートの送信

**配置場所**: `plugins/notifiers/{plugin_name}/`

**用途例**:
- 異常値検出時のメール送信
- Slackやチャットツールへの通知
- SMS・プッシュ通知の配信
- 外部監視システムへのアラート転送

**実装パターン**:
```python
# plugins/notifiers/email_notifier/run.py
import smtplib
from email.mime.text import MimeText
from typing import Dict, Any

class EmailNotifier:
    def __init__(self, config_path: str):
        self.config_path = config_path
        # 設定読み込み
    
    def send_notification(self, message: str, severity: str = "info") -> Dict[str, Any]:
        try:
            # メール送信ロジック
            server = smtplib.SMTP(self.config['smtp_server'])
            # ... メール送信処理
            
            return {
                "status": "success",
                "message": "Notification sent successfully",
                "recipients": self.config['recipients']
            }
        except Exception as e:
            return {
                "status": "error",
                "error": {"code": "SEND_FAILED", "message": str(e)}
            }

def run(config_path: str, **kwargs):
    notifier = EmailNotifier(config_path)
    message = kwargs.get('message', 'Default notification')
    severity = kwargs.get('severity', 'info')
    
    return notifier.send_notification(message, severity)
```

### Presenter（表示プラグイン）

**目的**: データの可視化・レポート生成・ダッシュボード表示

**配置場所**: `plugins/presenters/{plugin_name}/`

**用途例**:
- PDF/Excelレポートの自動生成
- Webダッシュボードの動的更新
- グラフやチャートの生成
- 3D可視化・AR表示

## プラグイン開発ガイド

### 開発環境のセットアップ

1. **プラグインディレクトリ作成**:
```bash
# analyzer型プラグインの例
mkdir -p plugins/analyzers/my_plugin
cd plugins/analyzers/my_plugin
```

2. **必要ファイルの作成**:
```bash
touch run.py              # メイン実行スクリプト
touch plugin_meta.yaml    # プラグインメタデータ
touch README.md           # プラグイン説明
mkdir tests               # テスト用ディレクトリ
```

3. **仮想環境のセットアップ**:
```bash
# analyzer用仮想環境作成
cd /path/to/if-hub
./plugins/venv_management/setup_venv_analyzer.sh my_plugin
```

### BaseAnalyzerの継承パターン

```python
from plugins.base.base_analyzer import BaseAnalyzer
from typing import Dict, Any
import pandas as pd
import numpy as np

class MyAnalyzer(BaseAnalyzer):
    def __init__(self, config_path: str):
        super().__init__(config_path)
        self.analysis_config = {}
        self.data_cache = {}
    
    def prepare(self) -> bool:
        """事前準備処理"""
        try:
            # 解析設定の読み込み
            self.analysis_config = self.config.get('analysis_settings', {})
            
            # 必要な外部リソースの確認
            if not self._check_external_resources():
                return False
            
            # データキャッシュの初期化
            self.data_cache = {}
            
            self.logger.info("Preparation completed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Preparation failed: {e}")
            return False
    
    def validate_config(self) -> bool:
        """設定ファイルのバリデーション"""
        required_sections = ['analysis_settings', 'target_equipment']
        
        for section in required_sections:
            if section not in self.config:
                self.logger.error(f"Missing required section: {section}")
                return False
        
        # 数値パラメータの範囲チェック
        threshold = self.config.get('analysis_settings', {}).get('threshold')
        if threshold and (threshold < 0 or threshold > 1):
            self.logger.error("Threshold must be between 0 and 1")
            return False
        
        return True
    
    def execute(self) -> Dict[str, Any]:
        """メイン解析処理"""
        try:
            # データ取得
            data = self._fetch_equipment_data()
            
            # 前処理
            processed_data = self._preprocess_data(data)
            
            # メイン解析
            analysis_results = self._analyze_data(processed_data)
            
            # 後処理・結果整形
            formatted_results = self._format_results(analysis_results)
            
            return self._create_success_response({
                "equipment": self.equipment_name,
                "analysis_type": "my_analysis",
                "results": formatted_results,
                "data_points": len(data),
                "execution_time": self._get_execution_time()
            })
            
        except Exception as e:
            self.logger.error(f"Analysis execution failed: {e}")
            return self._create_error_response(
                f"Analysis failed: {str(e)}", 
                "EXECUTION_ERROR"
            )
    
    def get_status(self) -> Dict[str, Any]:
        """プラグインステータス取得"""
        return {
            "plugin_name": "my_analyzer",
            "version": "1.0.0",
            "status": "ready",
            "last_execution": getattr(self, 'last_execution', None),
            "dependencies_ok": self._check_dependencies()
        }
    
    def validate_api_response(self, response: Dict[str, Any]) -> bool:
        """API応答の妥当性チェック"""
        required_fields = ['status', 'equipment', 'timestamp']
        
        for field in required_fields:
            if field not in response:
                return False
        
        if response['status'] not in ['success', 'error']:
            return False
        
        return True
    
    # プライベートメソッド
    def _fetch_equipment_data(self):
        """設備データ取得"""
        # IF-HUB APIからのデータ取得ロジック
        pass
    
    def _preprocess_data(self, data):
        """データ前処理"""
        # 欠損値処理、正規化など
        pass
    
    def _analyze_data(self, data):
        """メイン解析ロジック"""
        # 解析アルゴリズムの実装
        pass
    
    def _format_results(self, results):
        """結果の整形"""
        # 結果をクライアント向けに整形
        pass

# プラグインエントリーポイント
def run(config_path: str, **kwargs):
    """プラグイン実行エントリーポイント"""
    analyzer = MyAnalyzer(config_path)
    
    # バリデーション
    if not analyzer.validate_config():
        return analyzer._create_error_response("Configuration validation failed")
    
    # 準備処理
    if not analyzer.prepare():
        return analyzer._create_error_response("Preparation failed")
    
    # メイン処理実行
    return analyzer.execute()

# 設定バリデーション（オプション）
def validate_config(config_path: str) -> bool:
    """設定ファイルの事前バリデーション"""
    analyzer = MyAnalyzer(config_path)
    return analyzer.validate_config()
```

### ログ機能の活用

```python
class MyAnalyzer(BaseAnalyzer):
    def execute(self) -> Dict[str, Any]:
        # ログレベル別の使い分け
        self.logger.debug("Starting detailed analysis process")
        self.logger.info("Processing equipment data")
        self.logger.warning("Data quality issue detected")
        self.logger.error("Critical error in analysis")
        
        # 構造化ログ
        self.logger.info(
            "Analysis completed",
            extra={
                "equipment": self.equipment_name,
                "data_points": 1000,
                "processing_time": 2.5
            }
        )
```

### エラーハンドリングのベストプラクティス

```python
def execute(self) -> Dict[str, Any]:
    try:
        # メイン処理
        result = self._perform_analysis()
        return self._create_success_response(result)
    
    except ValueError as e:
        # 入力値エラー
        return self._create_error_response(
            f"Invalid input data: {str(e)}", 
            "INVALID_INPUT"
        )
    
    except ConnectionError as e:
        # 外部システム接続エラー
        return self._create_error_response(
            f"External system connection failed: {str(e)}", 
            "CONNECTION_FAILED"
        )
    
    except Exception as e:
        # 予期しないエラー
        self.logger.exception("Unexpected error in analysis")
        return self._create_error_response(
            f"Unexpected error: {str(e)}", 
            "UNEXPECTED_ERROR"
        )
```

## プラグインメタデータ

### plugin_meta.yaml の仕様

プラグインの動作環境や依存関係を定義するメタデータファイルです。

```yaml
# plugin_meta.yaml の完全な仕様例
plugin:
  name: "toorpia_backend"
  version: "1.0.0"
  type: "analyzer"
  description: "統合バックエンド解析プラグイン"
  author: "Development Team"
  license: "MIT"
  
  # サポートするIF-HUBバージョン
  if_hub_version: ">=1.0.0"
  
  # プラグイン固有の設定
  capabilities:
    - "real_time_analysis"
    - "batch_processing"
    - "external_api_integration"

# システム要件
requirements:
  system:
    python_version: ">=3.8"
    memory_mb: 512
    disk_space_mb: 100
    
  # Python依存関係
  dependencies:
    - "pandas>=1.3.0"
    - "numpy>=1.21.0"
    - "requests>=2.25.0"
    - "pyyaml>=5.4.0"
    - "scikit-learn>=1.0.0"

# 仮想環境要件（オフライン環境用）
venv_requirements:
  offline_mode: true
  venv_path: "venvs/analyzers/toorpia_backend"
  requirements_file: "requirements/analyzer_requirements.txt"
  
  # 仮想環境構築時の設定
  setup:
    pip_upgrade: true
    no_cache_dir: true
    trusted_hosts:
      - "pypi.org"
      - "pypi.python.org"

# 実行時設定
execution:
  timeout_seconds: 300
  max_memory_mb: 1024
  retry_count: 3
  
  # 並列実行設定
  concurrency:
    max_instances: 1
    lock_timeout: 30

# ログ設定
logging:
  level: "INFO"
  filename: "toorpia_analyzer.log"
  max_size_mb: 10
  backup_count: 5
  console: true

# 設定ファイルバリデーション
config_schema:
  required_sections:
    - "toorpia_integration"
    - "equipment_settings"
  
  validation_rules:
    - field: "toorpia_integration.api_endpoint"
      type: "url"
      required: true
    - field: "toorpia_integration.timeout"
      type: "integer"
      min: 1
      max: 300

# 外部依存関係
external_dependencies:
  services:
    - name: "Toorpia API"
      endpoint_env: "TOORPIA_API_ENDPOINT"
      required: true
      health_check: "/api/health"
  
  files:
    - path: "configs/certificates/toorpia.crt"
      required: false
      description: "TLS certificate for Toorpia API"

# テスト設定
testing:
  test_data_path: "tests/data"
  mock_config: "tests/mock_config.yaml"
  
  # 単体テスト
  unit_tests:
    - "tests/test_analyzer.py"
    - "tests/test_integration.py"

# デプロイメント情報
deployment:
  offline_compatible: true
  package_includes:
    - "run.py"
    - "plugin_meta.yaml"
    - "README.md"
    - "tests/"
  
  # 除外ファイル
  package_excludes:
    - "__pycache__/"
    - "*.pyc"
    - ".git/"
    - "*.log"
```

### メタデータの活用方法

#### 1. 動的依存関係チェック

```python
# plugins/run_plugin.py での使用例
def validate_plugin_requirements(plugin_type: str, plugin_name: str) -> bool:
    meta = load_plugin_meta(plugin_type, plugin_name)
    if not meta:
        return True
    
    # Python バージョンチェック
    python_version = meta.get('requirements', {}).get('system', {}).get('python_version')
    if python_version and not check_python_version(python_version):
        return False
    
    # 依存関係チェック
    dependencies = meta.get('requirements', {}).get('dependencies', [])
    for dep in dependencies:
        if not check_dependency(dep):
            return False
    
    return True
```

#### 2. 仮想環境の自動選択

```python
def get_python_executable(plugin_type: str, plugin_name: str) -> str:
    meta = load_plugin_meta(plugin_type, plugin_name)
    
    if meta and "venv_requirements" in meta:
        venv_info = meta["venv_requirements"]
        
        if venv_info.get("offline_mode", False) and "venv_path" in venv_info:
            venv_path = os.path.join(project_root, "plugins", venv_info["venv_path"])
            python_exe = os.path.join(venv_path, "bin", "python")
            
            if os.path.isfile(python_exe):
                return python_exe
    
    return "python3"  # フォールバック
```

## 仮想環境管理

### 仮想環境システムの概要

IF-HUBプラグインシステムでは、プラグインごとに独立した Python 仮想環境を管理し、依存関係の衝突を回避しています。

### 仮想環境の作成

#### Analyzer用仮想環境

```bash
# 自動セットアップスクリプト
./plugins/venv_management/setup_venv_analyzer.sh my_analyzer

# スクリプトの内容例:
#!/bin/bash
PLUGIN_NAME="$1"
if [ -z "$PLUGIN_NAME" ]; then
    echo "Usage: $0 <plugin_name>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV_DIR="$PROJECT_ROOT/plugins/venvs/analyzers/$PLUGIN_NAME"

echo "Creating virtual environment for analyzer plugin: $PLUGIN_NAME"

# 仮想環境作成
python3 -m venv "$VENV_DIR"

# pip アップグレード
"$VENV_DIR/bin/pip" install --upgrade pip

# 基本パッケージインストール
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements/analyzer_requirements.txt"

# プラグイン固有依存関係（存在する場合）
PLUGIN_REQ="$PROJECT_ROOT/plugins/analyzers/$PLUGIN_NAME/requirements.txt"
if [ -f "$PLUGIN_REQ" ]; then
    "$VENV_DIR/bin/pip" install -r "$PLUGIN_REQ"
fi

echo "Virtual environment created successfully at: $VENV_DIR"
```

#### 手動仮想環境作成

```bash
# 1. 仮想環境作成
python3 -m venv plugins/venvs/analyzers/my_plugin

# 2. アクティベート
source plugins/venvs/analyzers/my_plugin/bin/activate

# 3. 基本パッケージインストール
pip install --upgrade pip
pip install -r plugins/venv_management/requirements/analyzer_requirements.txt

# 4. プラグイン固有パッケージ
pip install pandas scikit-learn matplotlib

# 5. 仮想環境無効化
deactivate
```

### 要件ファイルの管理

#### 基本要件ファイル

```text
# plugins/venv_management/requirements/analyzer_requirements.txt
# IF-HUB analyzer plugins の基本依存関係

# データ処理
pandas>=1.3.0
numpy>=1.21.0

# 設定・ログ
pyyaml>=5.4.0

# HTTP通信
requests>=2.25.0

# 日時処理
python-dateutil>=2.8.0

# ログ（ローテーション等）
logging-extensions>=0.1.0

# ベースクラス用
abc-meta>=1.0.0
```

#### プラグイン固有要件

```text
# plugins/analyzers/my_plugin/requirements.txt
# my_plugin 固有の依存関係

# 機械学習
scikit-learn>=1.0.0
tensorflow>=2.8.0

# 可視化
matplotlib>=3.5.0
seaborn>=0.11.0

# 統計
scipy>=1.7.0
statsmodels>=0.13.0

# 外部API
boto3>=1.20.0
azure-storage-blob>=12.9.0
```

### オフライン環境対応

#### パッケージ事前ダウンロード

```bash
# 開発環境でのパッケージダウンロード
mkdir -p offline-packages/analyzers/my_plugin

# 仮想環境内でパッケージダウンロード
source plugins/venvs/analyzers/my_plugin/bin/activate
pip download -r plugins/analyzers/my_plugin/requirements.txt \
    -d offline-packages/analyzers/my_plugin

# オフライン環境でのインストール
pip install --no-index --find-links offline-packages/analyzers/my_plugin \
    -r plugins/analyzers/my_plugin/requirements.txt
```

#### オフライン配置用パッケージング

```bash
# パッケージング用スクリプト実行
./plugins/venv_management/package_venv.sh my_plugin

# 生成されるパッケージ
# plugins/venvs/packages/my_plugin_venv.tar.gz
```

## プラグイン実行

### コマンドライン実行

#### 基本的な実行方法

```bash
# 直接実行形式
python plugins/run_plugin.py \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/pump01/config.yaml

# サブコマンド形式
python plugins/run_plugin.py run \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/pump01/config.yaml \
    --mode production \
    --verbose
```

#### プラグイン一覧表示

```bash
# 全プラグイン一覧
python plugins/run_plugin.py list

# 特定タイプのプラグイン
python plugins/run_plugin.py list --type analyzer

# 出力例:
{
  "analyzer": {
    "toorpia_backend": {
      "path": "plugins/analyzers/toorpia_backend",
      "available": true,
      "metadata": {
        "plugin": {
          "name": "toorpia_backend",
          "version": "1.0.0",
          "type": "analyzer"
        }
      }
    }
  }
}
```

#### 設定バリデーション

```bash
# 設定ファイルのバリデーション
python plugins/run_plugin.py validate \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/pump01/config.yaml
```

### プログラマティック実行

#### Python スクリプトから実行

```python
# Python コードからの実行例
from plugins.run_plugin import run_plugin

# プラグイン実行
result = run_plugin(
    plugin_type="analyzer",
    plugin_name="my_plugin",
    config_path="configs/equipments/pump01/config.yaml",
    mode="production",
    verbose=True
)

# 結果の処理
if result.get("status") == "success":
    print("プラグイン実行成功:", result["data"])
else:
    print("プラグイン実行失敗:", result["error"])
```

#### IF-HUB API経由での実行

```python
import requests

# IF-HUB API経由でプラグイン実行
api_url = "http://localhost:3001/api/plugins/run"
payload = {
    "type": "analyzer",
    "name": "my_plugin",
    "equipment": "pump01",
    "mode": "production"
}

response = requests.post(api_url, json=payload)
result = response.json()

print("実行結果:", result)
```

### バッチ実行とスケジューリング

#### cronによる定期実行

```bash
# crontabエントリ例: 毎時0分に実行
0 * * * * cd /path/to/if-hub && python plugins/run_plugin.py run \
    --type analyzer --name my_plugin \
    --config configs/equipments/pump01/config.yaml \
    >> logs/plugin_cron.log 2>&1
```

#### シェルスクリプトによる一括実行

```bash
#!/bin/bash
# batch_run_plugins.sh

EQUIPMENT_DIR="configs/equipments"
LOG_DIR="logs/plugins"

# ログディレクトリ作成
mkdir -p "$LOG_DIR"

# 各設備に対してプラグイン実行
for equipment_dir in "$EQUIPMENT_DIR"/*; do
    if [ -d "$equipment_dir" ]; then
        equipment_name=$(basename "$equipment_dir")
        config_file="$equipment_dir/config.yaml"
        
        if [ -f "$config_file" ]; then
            echo "Running plugin for equipment: $equipment_name"
            
            python plugins/run_plugin.py run \
                --type analyzer \
                --name my_plugin \
                --config "$config_file" \
                --verbose \
                > "$LOG_DIR/${equipment_name}_$(date +%Y%m%d_%H%M%S).log" 2>&1
        fi
    fi
done
```

## オフライン環境配置

### オフライン配置の概要

インターネット接続のない環境でプラグインシステムを運用するための手順とベストプラクティスです。

### 事前準備（開発環境）

#### 1. プラグイン依存関係の収集

```bash
# プラグイン用パッケージの一括ダウンロード
mkdir -p offline-deployment/plugin-packages

# analyzer プラグイン用
for plugin in plugins/analyzers/*/; do
    plugin_name=$(basename "$plugin")
    echo "Downloading packages for $plugin_name"
    
    # 仮想環境の Python を使用してダウンロード
    if [ -f "plugins/venvs/analyzers/$plugin_name/bin/pip" ]; then
        plugins/venvs/analyzers/$plugin_name/bin/pip download \
            -r "$plugin/requirements.txt" \
            -d "offline-deployment/plugin-packages/$plugin_name" \
            --no-deps
    fi
done
```

#### 2. 仮想環境のパッケージング

```bash
# 個別仮想環境のパッケージング
./plugins/venv_management/package_venv.sh my_plugin

# 全仮想環境の一括パッケージング
for plugin in plugins/analyzers/*/; do
    plugin_name=$(basename "$plugin")
    ./plugins/venv_management/package_venv.sh "$plugin_name"
done
```

#### 3. 配置パッケージの作成

```bash
# オフライン配置用パッケージ作成
./offline-deployment/deployment-tools/create-package.sh

# プラグインシステム専用パッケージ作成
tar -czf if-hub-plugins-offline.tar.gz \
    plugins/ \
    offline-deployment/plugin-packages/ \
    --exclude="plugins/logs/*" \
    --exclude="plugins/__pycache__" \
    --exclude="*.pyc"
```

### オフライン環境での配置

#### 1. パッケージの展開

```bash
# オフライン環境での展開
tar -xzf if-hub-plugins-offline.tar.gz

# 必要なディレクトリの作成
mkdir -p plugins/logs
mkdir -p plugins/venvs/analyzers
mkdir -p plugins/venvs/notifiers
mkdir -p plugins/venvs/presenters
```

#### 2. 仮想環境の復元

```bash
# パッケージ化された仮想環境の復元
cd plugins/venvs/packages

for venv_package in *_venv.tar.gz; do
    plugin_name=$(basename "$venv_package" "_venv.tar.gz")
    echo "Restoring virtual environment for $plugin_name"
    
    # 展開
    tar -xzf "$venv_package" -C "../"
    
    # パスの修正（必要に応じて）
    if [ -f "../analyzers/$plugin_name/pyvenv.cfg" ]; then
        sed -i "s|home = .*|home = $(which python3 | xargs dirname)|" \
            "../analyzers/$plugin_name/pyvenv.cfg"
    fi
done
```

#### 3. プラグインの動作確認

```bash
# プラグイン一覧の確認
python plugins/run_plugin.py list

# 個別プラグインのテスト実行
python plugins/run_plugin.py run \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/test/config.yaml \
    --verbose
```

### オフライン環境でのトラブルシューティング

#### パッケージの依存関係エラー

```bash
# 不足パッケージの確認
python plugins/run_plugin.py validate \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/test/config.yaml

# 手動でのパッケージインストール
plugins/venvs/analyzers/my_plugin/bin/pip install \
    --no-index \
    --find-links offline-deployment/plugin-packages/my_plugin \
    package_name
```

#### 仮想環境のパス問題

```bash
# 仮想環境の再作成
rm -rf plugins/venvs/analyzers/my_plugin
python3 -m venv plugins/venvs/analyzers/my_plugin

# オフラインパッケージからの復元
plugins/venvs/analyzers/my_plugin/bin/pip install \
    --no-index \
    --find-links offline-deployment/plugin-packages/my_plugin \
    -r plugins/analyzers/my_plugin/requirements.txt
```

## toorPIA Backend統合例

### 概要

toorPIA Backend連携プラグインは、IF-HUBのプラグインシステムを活用した産業データ解析プラットフォーム統合の実装例です。IF-HUB APIを介したリアルタイムデータ取得、自動スケジュール管理、および外部解析システムとの連携機能を提供します。

### アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IF-HUB API    │    │ toorPIA Plugin  │    │ toorPIA Backend │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Tags API    │ │◄───┤ │Data Fetcher │ │    │ │fit_transform│ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Data API    │ │◄───┤ │Analyzer Core│ │───►│ │   addplot   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Equipment API│ │◄───┤ │ Scheduler   │ │    │ │Authentication│
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### IF-HUB API統合

#### データ取得機能

toorPIA Backendプラグインは、CSV ファイルではなく IF-HUB の RESTful API を直接使用してデータを取得します。これにより、リアルタイムデータアクセスと gtags（計算済みタグ）の自動収集が可能です。

```python
# plugins/analyzers/toorpia_backend/toorpia_analyzer.py の実装例
def _fetch_data_via_api(self, start_iso: str, end_iso: str) -> bool:
    """IF-HUB APIを使用してデータ取得"""
    try:
        # 1. 設備のタグ一覧取得（gtagsも含む）
        tags_url = f"http://localhost:3001/api/tags?equipment={self.equipment_name}&includeGtags=true"
        tags_response = requests.get(tags_url, timeout=30)
        tags_data = tags_response.json()
        tags = tags_data.get('tags', [])
        
        # 2. 各タグのデータ取得
        all_data = {}
        for tag in tags:
            tag_name = tag['name']
            column_name = tag.get('source_tag', tag_name) if not tag.get('is_gtag', False) else tag_name
            
            data_url = f"http://localhost:3001/api/data/{tag_name}"
            params = {'start': start_iso, 'end': end_iso}
            data_response = requests.get(data_url, params=params, timeout=60)
            
            if data_response.status_code == 200:
                tag_data = data_response.json()
                # データポイントを処理...
```

#### サポートされるデータタイプ

- **通常タグ**: PI System から直接取得される生データ
- **gtags**: IF-HUB 内で計算された派生データ（移動平均、統計値等）
- **時系列データ**: ISO 形式タイムスタンプの自動正規化
- **設備メタデータ**: タグ属性と設備固有情報

### スケジュール管理システム

#### 統合スケジューラ

プラグインシステムは、`plugins/schedule_plugin.py` による統一されたスケジュール管理機能を提供します。

```bash
# 利用可能なプラグインの確認
python3 plugins/schedule_plugin.py --list

# スケジュールの初期セットアップ
python3 plugins/schedule_plugin.py --setup --type analyzer --name toorpia_backend

# スケジュール状況の確認
python3 plugins/schedule_plugin.py --status --type analyzer --name toorpia_backend

# 新規設備のスケジュール追加
python3 plugins/schedule_plugin.py --add --config configs/equipments/new-equipment/config.yaml

# スケジュールの有効化・無効化
python3 plugins/schedule_plugin.py --enable --type analyzer --name toorpia_backend
python3 plugins/schedule_plugin.py --disable --type analyzer --name toorpia_backend
```

#### cron統合

スケジューラは設定ファイルを解析して cron エントリを自動生成し、システムの crontab に統合します。

```bash
# 自動生成される cron エントリ例

# toorPIA basemap update (7th-untan) - 毎週日曜2時
0 2 * * 0 cd /path/to/if-hub && TOORPIA_MODE=basemap_update python3 plugins/run_plugin.py run --type analyzer --name toorpia_backend --config /path/to/config.yaml --mode basemap_update >> logs/toorpia_scheduler.log 2>&1

# toorPIA addplot update (7th-untan) - 10分間隔
*/10 * * * * cd /path/to/if-hub && TOORPIA_MODE=addplot_update python3 plugins/run_plugin.py run --type analyzer --name toorpia_backend --config /path/to/config.yaml --mode addplot_update >> logs/toorpia_scheduler.log 2>&1
```

### 設定構造

#### basemap更新設定

basemap更新では、実行頻度とデータ期間を独立して設定できます。

```yaml
# configs/equipments/7th-untan/config.yaml
basemap:
  update:
    type: "periodic"
    schedule:
      interval: "weekly"      # 実行頻度: daily/weekly/monthly または 7D/6H等
      time: "02:00"           # 実行時刻 (HH:MM)
      weekday: "sunday"       # 週次の場合の曜日
    data:
      lookback: "30D"         # データ期間: 30日分のデータを含む

  # 固定期間モード
  # update:
  #   type: "fix"
  #   data:
  #     start: "2024-01-15T00:00:00+09:00"
  #     end: "2024-01-22T00:00:00+09:00"
```

#### addplot更新設定

addplot更新は短い間隔でのリアルタイム処理に使用されます。

```yaml
basemap:
  addplot:
    interval: "10m"           # 更新間隔
    lookback_period: "10D"    # データ取得期間
```

#### 完全な設定例

```yaml
# toorPIA連携設定
toorpia_integration:
  enabled: true
  api_url: "http://localhost:3000"
  timeout: 300
  
  endpoints:
    fit_transform: "/data/fit_transform"
    addplot: "/data/addplot"
  
  auth:
    session_key: "your_api_key_here"
    auto_refresh: true
  
  basemap_processing:
    parameters:
      label: "7th-untan Basemap"
      description: "7号機脱硫装置 基盤マップ"
      weight_option_str: "1:0"
      type_option_str: "1:date"
  
  addplot_processing:
    parameters:
      weight_option_str: "1:0"
      type_option_str: "1:date"
```

### 実装パターン

#### BaseAnalyzer継承

```python
from plugins.base.base_analyzer import BaseAnalyzer

class ToorPIAAnalyzer(BaseAnalyzer):
    def __init__(self, config_path: str):
        super().__init__(config_path)
        
        # toorPIA固有の設定
        toorpia_config = self.config.get('toorpia_integration', {})
        self.api_url = toorpia_config.get('api_url', 'http://localhost:3000')
        self.timeout = toorpia_config.get('timeout', 300)
    
    def prepare(self) -> bool:
        """事前処理：データ取得とCSV準備"""
        self.processing_mode = self._determine_processing_mode()
        return self._fetch_equipment_data()
    
    def validate_config(self) -> bool:
        """設定ファイルバリデーション"""
        required_sections = ['toorpia_integration', 'basemap']
        for section in required_sections:
            if section not in self.config:
                return False
        return True
    
    def execute(self) -> Dict[str, Any]:
        """メイン処理実行"""
        if self.processing_mode == "basemap_update":
            return self._execute_basemap_update()
        elif self.processing_mode == "addplot_update":
            return self._execute_addplot_update()
```

#### モード別実行

環境変数 `TOORPIA_MODE` により実行モードを制御します。

```bash
# basemap更新モード
TOORPIA_MODE=basemap_update python3 plugins/run_plugin.py run \
    --type analyzer --name toorpia_backend \
    --config configs/equipments/7th-untan/config.yaml

# addplot更新モード  
TOORPIA_MODE=addplot_update python3 plugins/run_plugin.py run \
    --type analyzer --name toorpia_backend \
    --config configs/equipments/7th-untan/config.yaml
```

### オフライン環境配置

#### プラグインシステムの配置

toorPIA Backendプラグインは、IF-HUB のオフライン配置機能に完全対応しています。

```bash
# 開発環境でのパッケージ作成
./offline-deployment/deployment-tools/create-package.sh

# パッケージに自動的に含まれる内容:
# - plugins/schedule_plugin.py (スケジュール管理)
# - plugins/analyzers/toorpia_backend/ (プラグイン本体)
# - plugins/venvs/analyzers/toorpia_backend/ (仮想環境)
# - 依存関係とメタデータ
```

#### 顧客環境での運用

```bash
# パッケージ展開後
tar -xzf if-hub-container.tgz
cd if-hub

# プラグインスケジュールのセットアップ
python3 plugins/schedule_plugin.py --setup --type analyzer --name toorpia_backend

# 運用状況の確認
python3 plugins/schedule_plugin.py --status --type analyzer --name toorpia_backend
crontab -l | grep toorPIA
```

#### 新規設備追加時の操作

```bash
# 1. 設備設定ファイルを作成
cp -r configs/equipments/example configs/equipments/new-equipment
vim configs/equipments/new-equipment/config.yaml

# 2. スケジュールに追加
python3 plugins/schedule_plugin.py --add --config configs/equipments/new-equipment/config.yaml

# 3. 確認
python3 plugins/schedule_plugin.py --status --type analyzer --name toorpia_backend
```

### 運用とメンテナンス

#### ログ監視

```bash
# プラグイン実行ログ
tail -f logs/toorpia_scheduler.log

# 個別設備ログ
tail -f logs/7th-untan/toorpia_analyzer.log

# エラーログのフィルタリング
grep -E "(ERROR|CRITICAL)" logs/toorpia_scheduler.log
```

#### パフォーマンス監視

```bash
# スケジュール状況の確認
python3 plugins/schedule_plugin.py --status --type analyzer --name toorpia_backend

# cron実行状況
grep "toorPIA" /var/log/syslog

# システムリソース使用量
top -p $(pgrep -f "toorpia_backend")
```

#### バックアップと復旧

```bash
# crontab設定のバックアップ
# (スケジューラが自動的に logs/crontab_backups/ に保存)
ls -la logs/crontab_backups/

# スケジュール設定の復旧
python3 plugins/schedule_plugin.py --setup --type analyzer --name toorpia_backend
```

### セキュリティ考慮事項

#### API認証

- toorPIA Backend API への接続にはセッションキーベース認証を使用
- 設定ファイル内の認証情報は適切に保護
- 自動セッション更新機能による長期運用対応

#### アクセス制御

- プラグイン実行権限の適切な設定
- cron実行ユーザーの権限管理
- ログファイルアクセス権の制限

この実装例は、IF-HUB プラグインシステムの柔軟性と拡張性を活用し、企業の既存システムとの統合を実現するための参考となります。

## エラーハンドリング

### エラーハンドリングシステム概要

IF-HUBプラグインシステムでは、堅牢で診断しやすい統一されたエラーハンドリング機構を提供しています。プラグイン実行時に発生する可能性のある全てのエラーを構造化し、適切な自動回復機能と詳細な診断情報を提供します。

詳細な情報については、[エラーハンドリングガイド](error_handling.md) を参照してください。

### エラー分類

プラグインシステムでは、エラーを重要度と回復可能性に基づいて分類しています：

#### 高重要度エラー（即座対応必要）
- **ConfigurationError**: 設定ファイルの構文エラー、必須パラメータの欠落
- **ProcessingModeError**: 不正な処理モード指定
- **AuthenticationError**: API認証の失敗、セッションキーの期限切れ

#### 中重要度エラー（自動回復対象）
- **APIConnectionError**: API接続失敗、タイムアウト（自動リトライあり）
- **DataFetchError**: データ取得失敗（部分的継続可能）
- **ValidationError**: API応答の構造不正、必須フィールドの欠落

#### 低重要度エラー（一時的）
- **LockError**: 排他制御のロック取得失敗（時間解決）
- **TempFileError**: 一時ファイルの作成失敗

### 自動回復機能

#### リトライ機構
```python
# 自動設定されるリトライ動作例
APIコール: 最大3回、指数バックオフ（1s, 2s, 4s）
データ取得: 最大5回、指数バックオフ（2s, 3s, 4.5s, 6.75s, 10s）
認証処理: 最大2回、固定間隔（0.5s, 1s）
```

#### 回路ブレーカー
連続的な失敗からサービスを保護する機能：

| サービス | 失敗閾値 | 回復タイムアウト |
|----------|----------|------------------|
| toorPIA API | 3回 | 30秒 |
| IF-HUB API | 5回 | 60秒 |
| 認証処理 | 2回 | 120秒 |

### プラグイン開発でのエラーハンドリング

#### BaseAnalyzer でのエラー統合

```python
from plugins.base.errors import (
    ConfigurationError, APIConnectionError, DataFetchError,
    ValidationError, get_error_severity
)

class MyAnalyzer(BaseAnalyzer):
    def validate_config(self) -> bool:
        """強化された設定バリデーション"""
        try:
            if 'required_section' not in self.config:
                raise ConfigurationError(
                    "Missing required_section in config",
                    config_path=self.config_path,
                    invalid_field="required_section"
                )
            return True
        except ConfigurationError as e:
            self.logger.error(f"Configuration error: {e}")
            self.logger.error(f"Suggestions: {', '.join(e.suggestions)}")
            return False
    
    def execute(self) -> Dict[str, Any]:
        """エラーハンドリング統合実行"""
        try:
            result = self._perform_analysis()
            return self._create_success_response(result)
        
        except APIConnectionError as e:
            # API関連エラーは詳細ログ付きで返す
            self.logger.error(f"API operation failed: {e}")
            return self._create_detailed_error_response(e)
        
        except Exception as e:
            # 予期しないエラーの適切な変換
            if "config" in str(e).lower():
                error = ConfigurationError(f"Configuration issue: {str(e)}")
            else:
                error = PluginError(f"Plugin execution failed: {str(e)}", "EXECUTION_FAILED")
            
            return self._create_detailed_error_response(error)
    
    def _create_detailed_error_response(self, error: 'PluginError') -> Dict[str, Any]:
        """詳細エラー応答生成"""
        severity = get_error_severity(error)
        
        return {
            "status": "error",
            "equipment": self.equipment_name,
            "timestamp": self._get_timestamp(),
            "error": {
                "type": error.__class__.__name__,
                "code": error.error_code,
                "message": str(error),
                "severity": severity,
                "details": error.details,
                "suggestions": error.suggestions,
                "retry_info": error.retry_info
            },
            "context": {
                "processing_mode": getattr(self, 'processing_mode', None),
                "config_path": self.config_path
            }
        }
```

#### 強化APIクライアントの使用

```python
from plugins.base.api_client import create_toorpia_client, create_ifhub_client

class MyAnalyzer(BaseAnalyzer):
    def __init__(self, config_path: str):
        super().__init__(config_path)
        
        # 自動リトライ・回路ブレーカー付きAPIクライアント
        self.toorpia_client = create_toorpia_client(
            api_url=self.config['toorpia_integration']['api_url'],
            api_key=self.config['toorpia_integration']['auth']['session_key']
        )
        
        self.ifhub_client = create_ifhub_client()
    
    def _call_external_api(self, data: Dict[str, Any]):
        """自動保護機構付きAPI呼び出し"""
        try:
            # 自動リトライ・回路ブレーカーが適用される
            response = self.toorpia_client.fit_transform(data)
            return response
            
        except APIConnectionError as e:
            # 詳細なエラー情報が自動的に含まれる
            self.logger.error(f"API call failed: {e.details}")
            raise
```

### 運用時のエラー監視

#### エラー統計の取得

```python
# プラグイン実行後のエラー統計確認
result = run_plugin("analyzer", "my_plugin", config_path)

if result.get("status") == "error":
    error_info = result["error"]
    
    # エラー重要度に基づく対応
    if error_info["severity"] == "HIGH":
        # 即座対応が必要
        send_alert(error_info)
    elif error_info["severity"] == "MEDIUM":
        # 監視と傾向分析
        log_to_monitoring(error_info)
```

#### ヘルスチェック機能

```python
# APIクライアントの健康状態確認
health_status = self.toorpia_client.get_health_status()

print(f"Success rate: {health_status['stats']['success_rate_percent']}%")
print(f"Circuit breaker state: {health_status['circuit_breaker']['current_state']}")
```

### エラー対応手順

1. **エラー発生時の初期対応**
   - エラーレベルと種類の確認
   - 自動回復機能の動作状況確認
   - 影響範囲の特定

2. **設定エラー（HIGH）の場合**
   - 設定ファイルの構文チェック
   - 必須フィールドの存在確認
   - 設定値の妥当性確認

3. **API接続エラー（MEDIUM）の場合**
   - サーバーの稼働状況確認
   - ネットワーク接続確認
   - 自動リトライと回路ブレーカーの状況確認

4. **データエラー（MEDIUM）の場合**
   - データソースの確認
   - 部分的継続処理の活用
   - グレースフル・デグラデーション機能の確認

### 開発者向けカスタマイズ

#### カスタムエラータイプの追加

```python
from plugins.base.errors import PluginError

class MyCustomError(PluginError):
    """カスタム解析エラー"""
    
    def __init__(self, message: str, analysis_type: str = ""):
        details = {"analysis_type": analysis_type}
        suggestions = [
            "解析パラメータを確認してください",
            "入力データの形式を確認してください"
        ]
        super().__init__(message, "CUSTOM_ANALYSIS_ERROR", details, suggestions)
```

#### エラー重要度のカスタマイズ

```python
# plugins/base/errors.py の ERROR_SEVERITY に追加
ERROR_SEVERITY[MyCustomError] = "MEDIUM"
```

エラーハンドリングシステムにより、プラグインの安定性と診断性が大幅に向上し、運用負荷を軽減できます。詳細な設定例やトラブルシューティング方法については、[エラーハンドリングガイド](error_handling.md) をご参照ください。

## トラブルシューティング

### 一般的な問題と解決方法

#### 1. プラグインが見つからないエラー

**エラー例**:
```
ImportError: Failed to load plugin analyzer/my_plugin: No module named 'plugins.analyzers.my_plugin.run'
```

**解決方法**:
```bash
# プラグインディレクトリの確認
ls -la plugins/analyzers/my_plugin/

# run.py ファイルの存在確認
test -f plugins/analyzers/my_plugin/run.py && echo "OK" || echo "NG"

# Pythonパスの確認
python -c "import sys; print('\n'.join(sys.path))"

# 手動での import テスト
python -c "from plugins.analyzers.my_plugin import run; print('OK')"
```

#### 2. 仮想環境の依存関係エラー

**エラー例**:
```
ModuleNotFoundError: No module named 'pandas'
```

**解決方法**:
```bash
# 仮想環境の Python 確認
plugins/venvs/analyzers/my_plugin/bin/python -c "import pandas; print('OK')"

# 依存関係の再インストール
plugins/venvs/analyzers/my_plugin/bin/pip install \
    -r plugins/analyzers/my_plugin/requirements.txt

# プラグインメタデータの確認
cat plugins/analyzers/my_plugin/plugin_meta.yaml
```

#### 3. 設定ファイルのバリデーションエラー

**エラー例**:
```json
{
  "status": "error",
  "error": {
    "code": "REQUIREMENTS_NOT_MET",
    "message": "Plugin requirements validation failed"
  }
}
```

**解決方法**:
```bash
# 設定ファイルの構文チェック
python -c "import yaml; yaml.safe_load(open('configs/equipments/pump01/config.yaml'))"

# 必須セクションの確認
grep -E "(toorpia_integration|equipment_settings)" configs/equipments/pump01/config.yaml

# バリデーション詳細確認
python plugins/run_plugin.py validate \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/pump01/config.yaml
```

#### 4. メモリ不足エラー

**エラー例**:
```
MemoryError: Unable to allocate array
```

**解決方法**:
```bash
# メモリ使用量の監視
top -p $(pgrep -f "run_plugin.py")

# プラグインの最大メモリ制限設定
# plugin_meta.yaml に追加:
execution:
  max_memory_mb: 512
  
# システムレベルでの制限
ulimit -m 524288  # 512MB制限
```

#### 5. タイムアウトエラー

**エラー例**:
```json
{
  "status": "error",
  "error": {
    "code": "PLUGIN_TIMEOUT",
    "message": "Plugin execution timed out (300s)"
  }
}
```

**解決方法**:
```bash
# タイムアウト時間の調整
# plugin_meta.yaml に追加:
execution:
  timeout_seconds: 600

# 処理の最適化確認
python -m cProfile plugins/analyzers/my_plugin/run.py config.yaml
```

### ログの確認とデバッグ

#### 1. ログファイルの確認

```bash
# プラグイン実行ログ
tail -f logs/my_equipment/toorpia_analyzer.log

# システムログ
tail -f logs/if-hub.log

# エラーログのフィルタリング
grep -E "(ERROR|CRITICAL)" logs/my_equipment/toorpia_analyzer.log
```

#### 2. デバッグモードでの実行

```bash
# 詳細ログ付きでの実行
python plugins/run_plugin.py run \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/pump01/config.yaml \
    --verbose \
    --mode debug

# Python デバッガでの実行
python -m pdb plugins/run_plugin.py run \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/pump01/config.yaml
```

#### 3. パフォーマンス分析

```bash
# プロファイリング
python -m cProfile -o profile_output.prof \
    plugins/run_plugin.py run \
    --type analyzer \
    --name my_plugin \
    --config configs/equipments/pump01/config.yaml

# プロファイル結果の確認
python -c "import pstats; pstats.Stats('profile_output.prof').sort_stats('time').print_stats(10)"
```

### サポートとコミュニティ

#### 問題報告の手順

1. **問題の詳細情報収集**:
   - IF-HUBバージョン
   - プラグイン名とバージョン
   - 実行環境（OS、Pythonバージョン）
   - エラーメッセージとスタックトレース

2. **再現手順の記録**:
   ```bash
   # 環境情報の収集
   python --version
   cat plugins/analyzers/my_plugin/plugin_meta.yaml
   
   # 最小限の再現例
   python plugins/run_plugin.py run \
       --type analyzer \
       --name my_plugin \
       --config minimal_config.yaml
   ```

3. **ログとデバッグ情報**:
   ```bash
   # ログの収集
   tar -czf debug_logs.tar.gz logs/
   
   # 設定ファイルの匿名化版
   cp configs/equipments/pump01/config.yaml debug_config.yaml
   # 機密情報を[REDACTED]に置換
   ```

#### よくある質問（FAQ）

**Q: プラグインの開発に推奨するIDEは？**
A: Visual Studio Code + Python拡張機能を推奨します。IF-HUBプロジェクトルートでワークスペースを開き、プラグインディレクトリを追加すると便利です。

**Q: プラグインのユニットテストはどのように書けば良いですか？**
A: `plugins/analyzers/my_plugin/tests/` ディレクトリに pytest を使用したテストを配置してください。BaseAnalyzer のモック化例は既存プラグインを参考にしてください。

**Q: プラグインから IF-HUB の他の機能を呼び出せますか？**
A: はい。IF-HUB の RESTful API を使用してデータ取得や他のプラグインとの連携が可能です。ただし、循環依存には注意してください。

**Q: プラグインの配布とバージョン管理はどうすれば？**
A: Git submodule や独立したリポジトリでの管理を推奨します。plugin_meta.yaml でバージョン情報を管理し、semantic versioning を使用してください。

以上でIF-HUBプラグインシステムガイドは完了です。さらに詳細な情報や最新のアップデートについては、[開発者ガイド](developer_guide.md) および GitHub リポジトリをご確認ください。
