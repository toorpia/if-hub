"""
IF-HUB プラグインシステム エラー分類体系

プラグイン実行時に発生する可能性のある全てのエラーを構造化し、
適切なエラーハンドリングと詳細な診断情報を提供します。
"""

from typing import Dict, Any, Optional, List
from datetime import datetime


class PluginError(Exception):
    """プラグイン基底例外クラス
    
    全てのプラグイン関連エラーの基底クラスです。
    エラーコード、詳細情報、提案される解決策を含みます。
    """
    
    def __init__(self, 
                 message: str, 
                 error_code: str, 
                 details: Optional[Dict[str, Any]] = None,
                 suggestions: Optional[List[str]] = None,
                 retry_info: Optional[Dict[str, Any]] = None):
        """
        Args:
            message: エラーメッセージ
            error_code: エラー識別コード
            details: 詳細情報辞書
            suggestions: 解決策提案のリスト
            retry_info: リトライ関連情報
        """
        super().__init__(message)
        self.error_code = error_code
        self.details = details or {}
        self.suggestions = suggestions or []
        self.retry_info = retry_info or {}
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """エラー情報を辞書形式で返す"""
        return {
            "error_type": self.__class__.__name__,
            "error_code": self.error_code,
            "message": str(self),
            "details": self.details,
            "suggestions": self.suggestions,
            "retry_info": self.retry_info,
            "timestamp": self.timestamp
        }


class ConfigurationError(PluginError):
    """設定関連エラー
    
    設定ファイルの構文エラー、必須パラメータの欠落、
    不正な設定値などの設定関連問題を表します。
    """
    
    def __init__(self, message: str, config_path: str = "", invalid_field: str = ""):
        details = {
            "config_path": config_path,
            "invalid_field": invalid_field
        }
        suggestions = [
            "設定ファイルの構文を確認してください",
            "必須フィールドが設定されているか確認してください",
            "設定値の形式が正しいか確認してください"
        ]
        super().__init__(message, "CONFIG_ERROR", details, suggestions)


class APIConnectionError(PluginError):
    """API接続エラー
    
    toorPIA API、IF-HUB API等への接続失敗、
    タイムアウト、認証エラーなどを表します。
    """
    
    def __init__(self, 
                 message: str, 
                 api_url: str = "", 
                 status_code: Optional[int] = None,
                 response_text: str = "",
                 timeout: Optional[float] = None):
        details = {
            "api_url": api_url,
            "status_code": status_code,
            "response_text": response_text,
            "timeout": timeout
        }
        suggestions = [
            "APIサーバーが稼働しているか確認してください",
            "ネットワーク接続を確認してください",
            "認証情報（APIキー、セッションキー）を確認してください",
            "タイムアウト設定を調整してください"
        ]
        super().__init__(message, "API_CONNECTION_ERROR", details, suggestions)


class DataFetchError(PluginError):
    """データ取得エラー
    
    設備データの取得失敗、CSV生成エラー、
    データ形式の不整合などを表します。
    """
    
    def __init__(self, 
                 message: str, 
                 equipment_name: str = "",
                 tag_names: Optional[List[str]] = None,
                 time_range: Optional[Dict[str, str]] = None):
        details = {
            "equipment_name": equipment_name,
            "tag_names": tag_names or [],
            "time_range": time_range or {}
        }
        suggestions = [
            "設備名とタグ名が正しいか確認してください",
            "指定された時間範囲にデータが存在するか確認してください",
            "IF-HUB APIが正常に動作しているか確認してください"
        ]
        super().__init__(message, "DATA_FETCH_ERROR", details, suggestions)


class ValidationError(PluginError):
    """バリデーションエラー
    
    API応答の構造不正、必須フィールドの欠落、
    データ形式の不整合などを表します。
    """
    
    def __init__(self, 
                 message: str, 
                 validation_type: str = "",
                 expected_fields: Optional[List[str]] = None,
                 actual_data: Optional[Dict[str, Any]] = None):
        details = {
            "validation_type": validation_type,
            "expected_fields": expected_fields or [],
            "actual_data": actual_data or {}
        }
        suggestions = [
            "API応答の形式を確認してください",
            "必須フィールドが含まれているか確認してください",
            "データ型が期待される形式と一致するか確認してください"
        ]
        super().__init__(message, "VALIDATION_ERROR", details, suggestions)


class LockError(PluginError):
    """排他制御エラー
    
    設備別排他制御のロック取得失敗、
    タイムアウト、デッドロックなどを表します。
    """
    
    def __init__(self, 
                 message: str, 
                 equipment_name: str = "",
                 lock_timeout: Optional[int] = None,
                 lock_holder_pid: Optional[int] = None):
        details = {
            "equipment_name": equipment_name,
            "lock_timeout": lock_timeout,
            "lock_holder_pid": lock_holder_pid
        }
        suggestions = [
            "他のプロセスが実行中でないか確認してください",
            "ロックファイルが残存している場合は削除してください",
            "タイムアウト時間を調整してください"
        ]
        super().__init__(message, "LOCK_ERROR", details, suggestions)


class CircuitBreakerOpenError(PluginError):
    """回路ブレーカー開放状態エラー
    
    連続的な失敗により回路ブレーカーが開放状態になり、
    処理が拒否された状態を表します。
    """
    
    def __init__(self, 
                 message: str, 
                 service_name: str = "",
                 failure_count: int = 0,
                 open_time: Optional[str] = None):
        details = {
            "service_name": service_name,
            "failure_count": failure_count,
            "open_time": open_time
        }
        suggestions = [
            "対象サービスの障害が回復するまで待機してください",
            "手動で回路ブレーカーをリセットしてください",
            "根本的な障害原因を調査・修正してください"
        ]
        super().__init__(message, "CIRCUIT_BREAKER_OPEN", details, suggestions)


class ProcessingModeError(PluginError):
    """処理モードエラー
    
    不正な処理モード指定、サポートされていない
    処理モードの実行要求などを表します。
    """
    
    def __init__(self, 
                 message: str, 
                 specified_mode: str = "",
                 supported_modes: Optional[List[str]] = None):
        details = {
            "specified_mode": specified_mode,
            "supported_modes": supported_modes or []
        }
        suggestions = [
            "サポートされている処理モードを確認してください",
            "環境変数TOORPIA_MODEの値を確認してください",
            "コマンドライン引数--modeの値を確認してください"
        ]
        super().__init__(message, "PROCESSING_MODE_ERROR", details, suggestions)


class TempFileError(PluginError):
    """一時ファイルエラー
    
    一時ファイルの作成失敗、ディスク容量不足、
    権限エラーなどを表します。
    """
    
    def __init__(self, 
                 message: str, 
                 file_path: str = "",
                 operation: str = "",
                 disk_usage: Optional[Dict[str, Any]] = None):
        details = {
            "file_path": file_path,
            "operation": operation,
            "disk_usage": disk_usage or {}
        }
        suggestions = [
            "ディスク容量を確認してください",
            "tmpディレクトリの書き込み権限を確認してください",
            "古い一時ファイルを削除してください"
        ]
        super().__init__(message, "TEMP_FILE_ERROR", details, suggestions)


class AuthenticationError(PluginError):
    """認証エラー
    
    toorPIA API認証の失敗、セッションキーの期限切れ、
    APIキーの不正などを表します。
    """
    
    def __init__(self, 
                 message: str, 
                 auth_type: str = "",
                 api_key_provided: bool = False,
                 session_key_expired: bool = False):
        details = {
            "auth_type": auth_type,
            "api_key_provided": api_key_provided,
            "session_key_expired": session_key_expired
        }
        suggestions = [
            "APIキーが設定ファイルに正しく設定されているか確認してください",
            "セッションキーの有効期限を確認してください",
            "認証APIのレスポンスを確認してください"
        ]
        super().__init__(message, "AUTHENTICATION_ERROR", details, suggestions)


# エラー重要度定義
ERROR_SEVERITY = {
    ConfigurationError: "HIGH",          # 設定エラーは重要度高
    APIConnectionError: "MEDIUM",        # API接続エラーは中程度（リトライ可能）
    DataFetchError: "MEDIUM",           # データ取得エラーは中程度（部分的継続可能）
    ValidationError: "MEDIUM",          # バリデーションエラーは中程度
    LockError: "LOW",                   # ロックエラーは軽微（時間解決）
    CircuitBreakerOpenError: "MEDIUM",  # 回路ブレーカーは中程度（一時的）
    ProcessingModeError: "HIGH",        # 処理モードエラーは重要度高
    TempFileError: "MEDIUM",           # 一時ファイルエラーは中程度
    AuthenticationError: "HIGH"         # 認証エラーは重要度高
}


def get_error_severity(error: PluginError) -> str:
    """エラーの重要度を取得"""
    return ERROR_SEVERITY.get(type(error), "UNKNOWN")


def create_error_summary(errors: List[PluginError]) -> Dict[str, Any]:
    """複数エラーのサマリーを作成"""
    summary = {
        "total_errors": len(errors),
        "error_types": {},
        "severity_distribution": {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "UNKNOWN": 0},
        "common_suggestions": set()
    }
    
    for error in errors:
        error_type = type(error).__name__
        severity = get_error_severity(error)
        
        # エラータイプ別集計
        summary["error_types"][error_type] = summary["error_types"].get(error_type, 0) + 1
        
        # 重要度別集計
        summary["severity_distribution"][severity] += 1
        
        # 共通提案収集
        summary["common_suggestions"].update(error.suggestions)
    
    # 共通提案をリストに変換
    summary["common_suggestions"] = list(summary["common_suggestions"])
    
    return summary
