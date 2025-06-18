"""
IF-HUB プラグインシステム リトライマネージャー

指数バックオフアルゴリズムによる自動リトライ機構を提供し、
一時的な障害からの自動回復を支援します。
"""

import time
import random
import logging
from contextlib import contextmanager
from typing import Dict, Any, Optional, List, Callable, Type, Union, Generator
from datetime import datetime, timedelta
from .errors import PluginError, APIConnectionError, DataFetchError, AuthenticationError


class RetryConfig:
    """リトライ設定クラス"""
    
    def __init__(self,
                 max_retries: int = 3,
                 base_delay: float = 1.0,
                 max_delay: float = 60.0,
                 exponential_base: float = 2.0,
                 jitter: bool = True,
                 backoff_multiplier: float = 1.0):
        """
        Args:
            max_retries: 最大リトライ回数
            base_delay: 基本遅延時間（秒）
            max_delay: 最大遅延時間（秒）
            exponential_base: 指数バックオフの底
            jitter: ジッター（ランダム要素）の有効化
            backoff_multiplier: バックオフ乗数
        """
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.backoff_multiplier = backoff_multiplier


class RetryAttempt:
    """リトライ試行情報"""
    
    def __init__(self, attempt_number: int, delay: float, exception: Optional[Exception] = None):
        self.attempt_number = attempt_number
        self.delay = delay
        self.exception = exception
        self.timestamp = datetime.now()
        self.success = exception is None


class RetryStatistics:
    """リトライ統計情報"""
    
    def __init__(self):
        self.total_operations = 0
        self.successful_operations = 0
        self.failed_operations = 0
        self.total_retries = 0
        self.average_attempts = 0.0
        self.error_distribution: Dict[str, int] = {}
        self.last_updated = datetime.now()
    
    def update(self, attempts: List[RetryAttempt], operation_name: str):
        """統計情報を更新"""
        self.total_operations += 1
        self.total_retries += len(attempts) - 1  # 最初の試行はリトライではない
        
        if attempts[-1].success:
            self.successful_operations += 1
        else:
            self.failed_operations += 1
            error_type = type(attempts[-1].exception).__name__ if attempts[-1].exception else "Unknown"
            self.error_distribution[error_type] = self.error_distribution.get(error_type, 0) + 1
        
        self.average_attempts = (self.total_retries + self.total_operations) / self.total_operations
        self.last_updated = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """統計情報を辞書形式で返す"""
        success_rate = (self.successful_operations / self.total_operations * 100) if self.total_operations > 0 else 0
        
        return {
            "total_operations": self.total_operations,
            "successful_operations": self.successful_operations,
            "failed_operations": self.failed_operations,
            "success_rate_percent": round(success_rate, 2),
            "total_retries": self.total_retries,
            "average_attempts": round(self.average_attempts, 2),
            "error_distribution": self.error_distribution,
            "last_updated": self.last_updated.isoformat()
        }


class RetryManager:
    """指数バックオフリトライマネージャー"""
    
    # デフォルトでリトライ対象とする例外タイプ
    DEFAULT_RETRYABLE_EXCEPTIONS = (
        APIConnectionError,
        DataFetchError,
        ConnectionError,
        TimeoutError,
        OSError  # ネットワーク関連のOSError
    )
    
    def __init__(self, 
                 config: Optional[RetryConfig] = None,
                 logger: Optional[logging.Logger] = None,
                 retryable_exceptions: Optional[tuple] = None):
        """
        Args:
            config: リトライ設定
            logger: ロガー
            retryable_exceptions: リトライ対象例外タイプ
        """
        self.config = config or RetryConfig()
        self.logger = logger or logging.getLogger(__name__)
        self.retryable_exceptions = retryable_exceptions or self.DEFAULT_RETRYABLE_EXCEPTIONS
        self.statistics = RetryStatistics()
    
    def calculate_delay(self, attempt: int) -> float:
        """遅延時間を計算（指数バックオフ + ジッター）"""
        # 指数バックオフ計算
        delay = self.config.base_delay * (self.config.exponential_base ** attempt) * self.config.backoff_multiplier
        
        # 最大遅延時間で制限
        delay = min(delay, self.config.max_delay)
        
        # ジッター追加（雷鳴群集回避）
        if self.config.jitter:
            jitter_range = delay * 0.1  # 10%のジッター
            delay += random.uniform(-jitter_range, jitter_range)
            delay = max(0, delay)  # 負の値にならないように
        
        return delay
    
    def should_retry(self, exception: Exception, attempt: int) -> bool:
        """リトライするかどうかの判定"""
        # 最大リトライ回数チェック
        if attempt >= self.config.max_retries:
            return False
        
        # 例外タイプチェック
        if not isinstance(exception, self.retryable_exceptions):
            return False
        
        # 認証エラーの場合は特別扱い（通常はリトライしない）
        if isinstance(exception, AuthenticationError):
            # APIキーが提供されていない場合はリトライしない
            if not getattr(exception, 'details', {}).get('api_key_provided', True):
                return False
        
        return True
    
    @contextmanager
    def retry_context(self, operation_name: str) -> Generator[int, None, None]:
        """リトライコンテキストマネージャー
        
        Args:
            operation_name: 操作名（ログ用）
        
        Yields:
            現在の試行回数（0から開始）
        """
        attempts: List[RetryAttempt] = []
        last_exception = None
        
        for attempt in range(self.config.max_retries + 1):
            try:
                self.logger.debug(f"[{operation_name}] Attempt {attempt + 1}/{self.config.max_retries + 1}")
                yield attempt
                
                # 成功した場合
                attempts.append(RetryAttempt(attempt, 0.0))
                self.logger.info(f"[{operation_name}] Operation succeeded on attempt {attempt + 1}")
                break
                
            except Exception as e:
                last_exception = e
                
                # リトライ判定
                if self.should_retry(e, attempt):
                    delay = self.calculate_delay(attempt)
                    attempts.append(RetryAttempt(attempt, delay, e))
                    
                    self.logger.warning(
                        f"[{operation_name}] Attempt {attempt + 1} failed: {str(e)}. "
                        f"Retrying in {delay:.2f} seconds..."
                    )
                    
                    time.sleep(delay)
                else:
                    # リトライしない場合
                    attempts.append(RetryAttempt(attempt, 0.0, e))
                    self.logger.error(f"[{operation_name}] Operation failed permanently: {str(e)}")
                    break
        
        # 統計情報更新
        self.statistics.update(attempts, operation_name)
        
        # 最終的に失敗した場合は例外を再発生
        if last_exception and not attempts[-1].success:
            # 元の例外にリトライ情報を追加
            if isinstance(last_exception, PluginError):
                last_exception.retry_info = {
                    "total_attempts": len(attempts),
                    "max_retries": self.config.max_retries,
                    "total_delay": sum(attempt.delay for attempt in attempts),
                    "attempts": [
                        {
                            "attempt": attempt.attempt_number + 1,
                            "delay": attempt.delay,
                            "error": str(attempt.exception) if attempt.exception else None,
                            "timestamp": attempt.timestamp.isoformat()
                        }
                        for attempt in attempts
                    ]
                }
            raise last_exception
    
    def retry_operation(self, 
                       operation: Callable[[], Any], 
                       operation_name: str,
                       context: Optional[Dict[str, Any]] = None) -> Any:
        """操作をリトライ付きで実行
        
        Args:
            operation: 実行する操作（関数）
            operation_name: 操作名
            context: 追加コンテキスト情報
        
        Returns:
            操作の実行結果
        """
        with self.retry_context(operation_name) as attempt:
            try:
                result = operation()
                
                # 成功ログ
                if context:
                    self.logger.debug(f"[{operation_name}] Context: {context}")
                
                return result
                
            except Exception as e:
                # エラーログ
                if context:
                    self.logger.error(f"[{operation_name}] Failed with context {context}: {str(e)}")
                raise
    
    def get_statistics(self) -> Dict[str, Any]:
        """リトライ統計情報を取得"""
        return self.statistics.to_dict()
    
    def reset_statistics(self):
        """統計情報をリセット"""
        self.statistics = RetryStatistics()
        self.logger.info("Retry statistics reset")


class AdvancedRetryManager(RetryManager):
    """高度なリトライマネージャー（動的設定調整機能付き）"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.adaptive_config = True
        self.performance_history: List[Dict[str, Any]] = []
        self.max_history_size = 100
    
    def adaptive_adjust_config(self):
        """過去の性能履歴に基づいて設定を動的調整"""
        if not self.adaptive_config or len(self.performance_history) < 10:
            return
        
        # 最近の成功率を計算
        recent_history = self.performance_history[-20:]
        avg_success_rate = sum(h.get('success_rate', 0) for h in recent_history) / len(recent_history)
        avg_attempts = sum(h.get('average_attempts', 1) for h in recent_history) / len(recent_history)
        
        # 成功率が低い場合はリトライ回数を増加
        if avg_success_rate < 70:
            self.config.max_retries = min(self.config.max_retries + 1, 10)
            self.logger.info(f"Low success rate ({avg_success_rate:.1f}%), increasing max_retries to {self.config.max_retries}")
        
        # 平均試行回数が多い場合は遅延時間を調整
        if avg_attempts > 2.5:
            self.config.base_delay = min(self.config.base_delay * 1.1, 10.0)
            self.logger.info(f"High average attempts ({avg_attempts:.1f}), increasing base_delay to {self.config.base_delay:.2f}")
    
    def update_performance_history(self):
        """性能履歴を更新"""
        current_stats = self.get_statistics()
        self.performance_history.append({
            'timestamp': datetime.now().isoformat(),
            'success_rate': current_stats.get('success_rate_percent', 0),
            'average_attempts': current_stats.get('average_attempts', 1),
            'total_operations': current_stats.get('total_operations', 0)
        })
        
        # 履歴サイズ制限
        if len(self.performance_history) > self.max_history_size:
            self.performance_history = self.performance_history[-self.max_history_size:]
        
        # 動的調整実行
        self.adaptive_adjust_config()


# 操作別のプリセット設定
RETRY_PRESETS = {
    "api_call": RetryConfig(
        max_retries=3,
        base_delay=1.0,
        max_delay=30.0,
        exponential_base=2.0,
        jitter=True
    ),
    "data_fetch": RetryConfig(
        max_retries=5,
        base_delay=2.0,
        max_delay=60.0,
        exponential_base=1.5,
        jitter=True
    ),
    "authentication": RetryConfig(
        max_retries=2,
        base_delay=0.5,
        max_delay=5.0,
        exponential_base=2.0,
        jitter=False
    ),
    "file_operation": RetryConfig(
        max_retries=3,
        base_delay=0.1,
        max_delay=1.0,
        exponential_base=2.0,
        jitter=False
    )
}


def create_retry_manager(preset: str = "api_call", 
                        logger: Optional[logging.Logger] = None) -> RetryManager:
    """プリセット設定でリトライマネージャーを作成
    
    Args:
        preset: プリセット名
        logger: ロガー
    
    Returns:
        リトライマネージャー
    """
    config = RETRY_PRESETS.get(preset, RETRY_PRESETS["api_call"])
    return RetryManager(config=config, logger=logger)
