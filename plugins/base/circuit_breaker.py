"""
IF-HUB プラグインシステム 回路ブレーカー

連続的な失敗からサービスを保護し、障害の伝播を防ぐ
回路ブレーカーパターンを実装します。
"""

import time
import threading
from enum import Enum
from contextlib import contextmanager
from typing import Dict, Any, Optional, Callable, Generator
from datetime import datetime, timedelta
from .errors import CircuitBreakerOpenError, PluginError


class CircuitBreakerState(Enum):
    """回路ブレーカーの状態"""
    CLOSED = "CLOSED"           # 正常状態（呼び出し許可）
    OPEN = "OPEN"               # 開放状態（呼び出し拒否）
    HALF_OPEN = "HALF_OPEN"     # 半開放状態（テスト呼び出し許可）


class CircuitBreakerConfig:
    """回路ブレーカー設定クラス"""
    
    def __init__(self,
                 failure_threshold: int = 5,
                 recovery_timeout: float = 60.0,
                 expected_exception: tuple = (Exception,),
                 name: str = "default"):
        """
        Args:
            failure_threshold: 失敗閾値（この回数失敗すると開放）
            recovery_timeout: 回復タイムアウト（秒）
            expected_exception: 監視対象の例外タイプ
            name: 回路ブレーカー名
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        self.name = name


class CircuitBreakerMetrics:
    """回路ブレーカーメトリクス"""
    
    def __init__(self):
        self.total_calls = 0
        self.successful_calls = 0
        self.failed_calls = 0
        self.rejected_calls = 0
        self.state_changes = 0
        self.last_failure_time: Optional[datetime] = None
        self.last_success_time: Optional[datetime] = None
        self.state_change_history: list = []
        self.current_failure_streak = 0
        self.max_failure_streak = 0
    
    def record_success(self):
        """成功を記録"""
        self.total_calls += 1
        self.successful_calls += 1
        self.current_failure_streak = 0
        self.last_success_time = datetime.now()
    
    def record_failure(self):
        """失敗を記録"""
        self.total_calls += 1
        self.failed_calls += 1
        self.current_failure_streak += 1
        self.max_failure_streak = max(self.max_failure_streak, self.current_failure_streak)
        self.last_failure_time = datetime.now()
    
    def record_rejection(self):
        """拒否を記録"""
        self.rejected_calls += 1
    
    def record_state_change(self, old_state: CircuitBreakerState, new_state: CircuitBreakerState):
        """状態変更を記録"""
        self.state_changes += 1
        self.state_change_history.append({
            "timestamp": datetime.now().isoformat(),
            "from_state": old_state.value,
            "to_state": new_state.value
        })
        
        # 履歴サイズ制限
        if len(self.state_change_history) > 100:
            self.state_change_history = self.state_change_history[-100:]
    
    def get_success_rate(self) -> float:
        """成功率を計算"""
        if self.total_calls == 0:
            return 100.0
        return (self.successful_calls / self.total_calls) * 100
    
    def to_dict(self) -> Dict[str, Any]:
        """メトリクスを辞書形式で返す"""
        return {
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "rejected_calls": self.rejected_calls,
            "success_rate_percent": round(self.get_success_rate(), 2),
            "current_failure_streak": self.current_failure_streak,
            "max_failure_streak": self.max_failure_streak,
            "state_changes": self.state_changes,
            "last_failure_time": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "last_success_time": self.last_success_time.isoformat() if self.last_success_time else None,
            "state_change_history": self.state_change_history[-10:]  # 最新10件のみ
        }


class CircuitBreaker:
    """回路ブレーカー実装"""
    
    def __init__(self, config: Optional[CircuitBreakerConfig] = None):
        """
        Args:
            config: 回路ブレーカー設定
        """
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.metrics = CircuitBreakerMetrics()
        self._lock = threading.RLock()  # 再帰可能ロック
    
    def _should_trip(self) -> bool:
        """回路ブレーカーを開放すべきかの判定"""
        return self.failure_count >= self.config.failure_threshold
    
    def _should_attempt_reset(self) -> bool:
        """リセット試行すべきかの判定"""
        if self.last_failure_time is None:
            return False
        
        time_since_failure = time.time() - self.last_failure_time
        return time_since_failure >= self.config.recovery_timeout
    
    def _change_state(self, new_state: CircuitBreakerState):
        """状態変更"""
        if self.state != new_state:
            old_state = self.state
            self.state = new_state
            self.metrics.record_state_change(old_state, new_state)
    
    def _record_success(self):
        """成功の記録と状態更新"""
        with self._lock:
            self.failure_count = 0
            self.last_failure_time = None
            self.metrics.record_success()
            
            if self.state == CircuitBreakerState.HALF_OPEN:
                self._change_state(CircuitBreakerState.CLOSED)
    
    def _record_failure(self, exception: Exception):
        """失敗の記録と状態更新"""
        with self._lock:
            # 監視対象の例外かチェック
            if isinstance(exception, self.config.expected_exception):
                self.failure_count += 1
                self.last_failure_time = time.time()
                self.metrics.record_failure()
                
                # 失敗閾値に達した場合は開放状態に
                if self._should_trip():
                    self._change_state(CircuitBreakerState.OPEN)
            else:
                # 監視対象外の例外は通常の成功として扱う
                self._record_success()
    
    def _call_allowed(self) -> bool:
        """呼び出し許可の判定"""
        with self._lock:
            if self.state == CircuitBreakerState.CLOSED:
                return True
            
            elif self.state == CircuitBreakerState.OPEN:
                if self._should_attempt_reset():
                    self._change_state(CircuitBreakerState.HALF_OPEN)
                    return True
                return False
            
            elif self.state == CircuitBreakerState.HALF_OPEN:
                return True
            
            return False
    
    @contextmanager
    def context(self) -> Generator[None, None, None]:
        """回路ブレーカーコンテキストマネージャー"""
        if not self._call_allowed():
            self.metrics.record_rejection()
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{self.config.name}' is open",
                service_name=self.config.name,
                failure_count=self.failure_count,
                open_time=datetime.fromtimestamp(self.last_failure_time).isoformat() if self.last_failure_time else None
            )
        
        try:
            yield
            self._record_success()
        except Exception as e:
            self._record_failure(e)
            raise
    
    def call(self, func: Callable, *args, **kwargs):
        """関数を回路ブレーカー保護下で実行"""
        with self.context():
            return func(*args, **kwargs)
    
    def get_state(self) -> CircuitBreakerState:
        """現在の状態を取得"""
        return self.state
    
    def get_metrics(self) -> Dict[str, Any]:
        """メトリクスを取得"""
        with self._lock:
            metrics = self.metrics.to_dict()
            metrics.update({
                "circuit_breaker_name": self.config.name,
                "current_state": self.state.value,
                "failure_count": self.failure_count,
                "failure_threshold": self.config.failure_threshold,
                "recovery_timeout_seconds": self.config.recovery_timeout,
                "time_since_last_failure": (
                    time.time() - self.last_failure_time 
                    if self.last_failure_time else None
                )
            })
            return metrics
    
    def reset(self):
        """手動リセット"""
        with self._lock:
            self.failure_count = 0
            self.last_failure_time = None
            self._change_state(CircuitBreakerState.CLOSED)
    
    def force_open(self):
        """強制開放"""
        with self._lock:
            self._change_state(CircuitBreakerState.OPEN)
            self.last_failure_time = time.time()


class CircuitBreakerManager:
    """複数の回路ブレーカーを管理するマネージャー"""
    
    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._lock = threading.RLock()
    
    def get_or_create(self, name: str, config: Optional[CircuitBreakerConfig] = None) -> CircuitBreaker:
        """回路ブレーカーを取得または作成"""
        with self._lock:
            if name not in self._breakers:
                breaker_config = config or CircuitBreakerConfig(name=name)
                self._breakers[name] = CircuitBreaker(breaker_config)
            return self._breakers[name]
    
    def get(self, name: str) -> Optional[CircuitBreaker]:
        """回路ブレーカーを取得"""
        return self._breakers.get(name)
    
    def remove(self, name: str) -> bool:
        """回路ブレーカーを削除"""
        with self._lock:
            if name in self._breakers:
                del self._breakers[name]
                return True
            return False
    
    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """全回路ブレーカーのメトリクスを取得"""
        with self._lock:
            return {name: breaker.get_metrics() for name, breaker in self._breakers.items()}
    
    def reset_all(self):
        """全回路ブレーカーをリセット"""
        with self._lock:
            for breaker in self._breakers.values():
                breaker.reset()
    
    def list_breakers(self) -> list:
        """回路ブレーカー一覧を取得"""
        with self._lock:
            return list(self._breakers.keys())


# グローバル回路ブレーカーマネージャー
_global_manager = CircuitBreakerManager()


def get_circuit_breaker(name: str, config: Optional[CircuitBreakerConfig] = None) -> CircuitBreaker:
    """グローバルマネージャーから回路ブレーカーを取得"""
    return _global_manager.get_or_create(name, config)


def create_circuit_breaker_for_service(service_name: str,
                                     failure_threshold: int = 5,
                                     recovery_timeout: float = 60.0) -> CircuitBreaker:
    """サービス用の回路ブレーカーを作成"""
    config = CircuitBreakerConfig(
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
        expected_exception=(PluginError, ConnectionError, TimeoutError),
        name=service_name
    )
    return get_circuit_breaker(service_name, config)


# サービス別のプリセット設定
SERVICE_PRESETS = {
    "toorpia_api": {
        "failure_threshold": 3,
        "recovery_timeout": 30.0
    },
    "ifhub_api": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0
    },
    "authentication": {
        "failure_threshold": 2,
        "recovery_timeout": 120.0
    },
    "data_fetch": {
        "failure_threshold": 5,
        "recovery_timeout": 45.0
    }
}


def create_service_circuit_breaker(service_type: str) -> CircuitBreaker:
    """サービスタイプに基づいて回路ブレーカーを作成"""
    preset = SERVICE_PRESETS.get(service_type, SERVICE_PRESETS["toorpia_api"])
    return create_circuit_breaker_for_service(
        service_name=service_type,
        failure_threshold=preset["failure_threshold"],
        recovery_timeout=preset["recovery_timeout"]
    )
