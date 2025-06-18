"""
IF-HUB プラグインシステム 強化APIクライアント

リトライ機構、回路ブレーカー、接続プール最適化を統合した
高可用性APIクライアントを提供します。
"""

import requests
import time
import logging
from typing import Dict, Any, Optional, Union, List
from urllib.parse import urljoin
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from contextlib import contextmanager

from .errors import (
    APIConnectionError, AuthenticationError, DataFetchError, 
    ValidationError, PluginError
)
from .retry_manager import RetryManager, create_retry_manager
from .circuit_breaker import CircuitBreaker, create_service_circuit_breaker


class APIClientConfig:
    """APIクライアント設定"""
    
    def __init__(self,
                 base_url: str,
                 timeout: float = 30.0,
                 max_retries: int = 3,
                 pool_connections: int = 10,
                 pool_maxsize: int = 20,
                 enable_circuit_breaker: bool = True,
                 enable_retry: bool = True,
                 headers: Optional[Dict[str, str]] = None):
        """
        Args:
            base_url: ベースURL
            timeout: タイムアウト（秒）
            max_retries: 最大リトライ回数
            pool_connections: 接続プール数
            pool_maxsize: プール最大サイズ
            enable_circuit_breaker: 回路ブレーカー有効化
            enable_retry: リトライ有効化
            headers: デフォルトヘッダー
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.max_retries = max_retries
        self.pool_connections = pool_connections
        self.pool_maxsize = pool_maxsize
        self.enable_circuit_breaker = enable_circuit_breaker
        self.enable_retry = enable_retry
        self.headers = headers or {}


class APIResponse:
    """API応答ラッパー"""
    
    def __init__(self, 
                 response: requests.Response,
                 request_info: Dict[str, Any]):
        self.response = response
        self.request_info = request_info
        self.status_code = response.status_code
        self.headers = dict(response.headers)
        self.elapsed = response.elapsed.total_seconds()
        
        # JSON解析を試行
        try:
            self.data = response.json()
        except ValueError:
            self.data = response.text
    
    def is_success(self) -> bool:
        """成功判定"""
        return 200 <= self.status_code < 300
    
    def to_dict(self) -> Dict[str, Any]:
        """辞書形式で返す"""
        return {
            "status_code": self.status_code,
            "data": self.data,
            "headers": self.headers,
            "elapsed_seconds": self.elapsed,
            "request_info": self.request_info
        }


class EnhancedAPIClient:
    """強化APIクライアント"""
    
    def __init__(self, 
                 config: APIClientConfig,
                 service_name: str = "api_client",
                 logger: Optional[logging.Logger] = None):
        """
        Args:
            config: API設定
            service_name: サービス名
            logger: ロガー
        """
        self.config = config
        self.service_name = service_name
        self.logger = logger or logging.getLogger(__name__)
        
        # セッション設定
        self.session = self._create_session()
        
        # リトライマネージャー設定
        if config.enable_retry:
            self.retry_manager = create_retry_manager("api_call", self.logger)
        else:
            self.retry_manager = None
        
        # 回路ブレーカー設定
        if config.enable_circuit_breaker:
            self.circuit_breaker = create_service_circuit_breaker(service_name)
        else:
            self.circuit_breaker = None
        
        # 統計情報
        self.stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "total_response_time": 0.0,
            "average_response_time": 0.0
        }
    
    def _create_session(self) -> requests.Session:
        """HTTPセッション作成"""
        session = requests.Session()
        
        # 接続プール設定
        adapter = HTTPAdapter(
            pool_connections=self.config.pool_connections,
            pool_maxsize=self.config.pool_maxsize,
            max_retries=0  # リトライマネージャーで制御するため無効化
        )
        
        session.mount('http://', adapter)
        session.mount('https://', adapter)
        
        # デフォルトヘッダー設定
        session.headers.update(self.config.headers)
        
        return session
    
    def _update_stats(self, success: bool, response_time: float):
        """統計情報更新"""
        self.stats["total_requests"] += 1
        self.stats["total_response_time"] += response_time
        
        if success:
            self.stats["successful_requests"] += 1
        else:
            self.stats["failed_requests"] += 1
        
        self.stats["average_response_time"] = (
            self.stats["total_response_time"] / self.stats["total_requests"]
        )
    
    def _create_request_info(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        """リクエスト情報作成"""
        return {
            "method": method.upper(),
            "url": url,
            "service_name": self.service_name,
            "timestamp": time.time(),
            "timeout": kwargs.get('timeout', self.config.timeout),
            "has_data": 'json' in kwargs or 'data' in kwargs
        }
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> APIResponse:
        """実際のHTTPリクエスト実行"""
        url = urljoin(self.config.base_url + '/', endpoint.lstrip('/'))
        
        # タイムアウト設定
        kwargs.setdefault('timeout', self.config.timeout)
        
        # リクエスト情報
        request_info = self._create_request_info(method, url, **kwargs)
        
        start_time = time.time()
        
        try:
            # HTTPリクエスト実行
            response = self.session.request(method, url, **kwargs)
            response_time = time.time() - start_time
            
            self.logger.debug(
                f"[{self.service_name}] {method} {url} -> "
                f"{response.status_code} ({response_time:.3f}s)"
            )
            
            # エラーステータスの場合は例外発生
            if not (200 <= response.status_code < 300):
                self._update_stats(False, response_time)
                raise APIConnectionError(
                    f"HTTP {response.status_code}: {response.text}",
                    api_url=url,
                    status_code=response.status_code,
                    response_text=response.text[:500],  # レスポンステキストを制限
                    timeout=kwargs.get('timeout')
                )
            
            self._update_stats(True, response_time)
            return APIResponse(response, request_info)
            
        except requests.exceptions.Timeout as e:
            response_time = time.time() - start_time
            self._update_stats(False, response_time)
            raise APIConnectionError(
                f"Request timeout after {kwargs.get('timeout', self.config.timeout)}s",
                api_url=url,
                timeout=kwargs.get('timeout', self.config.timeout)
            )
        
        except requests.exceptions.ConnectionError as e:
            response_time = time.time() - start_time
            self._update_stats(False, response_time)
            raise APIConnectionError(
                f"Connection error: {str(e)}",
                api_url=url
            )
        
        except requests.exceptions.RequestException as e:
            response_time = time.time() - start_time
            self._update_stats(False, response_time)
            raise APIConnectionError(
                f"Request error: {str(e)}",
                api_url=url
            )
    
    def _execute_with_protection(self, operation_name: str, operation_func) -> APIResponse:
        """保護機構付きでAPIコールを実行"""
        
        def protected_operation():
            if self.circuit_breaker:
                with self.circuit_breaker.context():
                    return operation_func()
            else:
                return operation_func()
        
        if self.retry_manager:
            with self.retry_manager.retry_context(operation_name):
                return protected_operation()
        else:
            return protected_operation()
    
    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, **kwargs) -> APIResponse:
        """GETリクエスト"""
        operation_name = f"GET {endpoint}"
        
        def operation():
            return self._make_request('GET', endpoint, params=params, **kwargs)
        
        return self._execute_with_protection(operation_name, operation)
    
    def post(self, endpoint: str, 
             json: Optional[Dict[str, Any]] = None,
             data: Optional[Union[Dict[str, Any], str]] = None,
             **kwargs) -> APIResponse:
        """POSTリクエスト"""
        operation_name = f"POST {endpoint}"
        
        def operation():
            return self._make_request('POST', endpoint, json=json, data=data, **kwargs)
        
        return self._execute_with_protection(operation_name, operation)
    
    def put(self, endpoint: str,
            json: Optional[Dict[str, Any]] = None,
            data: Optional[Union[Dict[str, Any], str]] = None,
            **kwargs) -> APIResponse:
        """PUTリクエスト"""
        operation_name = f"PUT {endpoint}"
        
        def operation():
            return self._make_request('PUT', endpoint, json=json, data=data, **kwargs)
        
        return self._execute_with_protection(operation_name, operation)
    
    def delete(self, endpoint: str, **kwargs) -> APIResponse:
        """DELETEリクエスト"""
        operation_name = f"DELETE {endpoint}"
        
        def operation():
            return self._make_request('DELETE', endpoint, **kwargs)
        
        return self._execute_with_protection(operation_name, operation)
    
    def get_health_status(self) -> Dict[str, Any]:
        """ヘルスステータス取得"""
        status = {
            "service_name": self.service_name,
            "base_url": self.config.base_url,
            "stats": self.stats.copy()
        }
        
        # 回路ブレーカー情報
        if self.circuit_breaker:
            status["circuit_breaker"] = self.circuit_breaker.get_metrics()
        
        # リトライ情報
        if self.retry_manager:
            status["retry"] = self.retry_manager.get_statistics()
        
        return status
    
    def reset_protection(self):
        """保護機構のリセット"""
        if self.circuit_breaker:
            self.circuit_breaker.reset()
        
        if self.retry_manager:
            self.retry_manager.reset_statistics()
    
    def close(self):
        """リソースクリーンアップ"""
        if self.session:
            self.session.close()


class ToorPIAAPIClient(EnhancedAPIClient):
    """toorPIA API専用クライアント"""
    
    def __init__(self, 
                 api_url: str,
                 session_key: Optional[str] = None,
                 logger: Optional[logging.Logger] = None):
        """
        Args:
            api_url: toorPIA API URL
            session_key: セッションキー
            logger: ロガー
        """
        config = APIClientConfig(
            base_url=api_url,
            timeout=300.0,  # toorPIA APIは処理時間が長い
            headers={
                'Content-Type': 'application/json',
                'session-key': session_key or ''
            }
        )
        
        super().__init__(config, "toorpia_api", logger)
        self.session_key = session_key
    
    def update_session_key(self, session_key: str):
        """セッションキー更新"""
        self.session_key = session_key
        self.session.headers['session-key'] = session_key
    
    def authenticate(self, api_key: str) -> str:
        """認証してセッションキー取得"""
        try:
            response = self.post('/auth/login', json={"apiKey": api_key})
            
            if not response.is_success():
                raise AuthenticationError(
                    f"Authentication failed: {response.status_code}",
                    auth_type="api_key",
                    api_key_provided=bool(api_key)
                )
            
            session_key = response.data.get('sessionKey')
            if not session_key:
                raise AuthenticationError(
                    "No session key in authentication response",
                    auth_type="api_key",
                    api_key_provided=bool(api_key)
                )
            
            self.update_session_key(session_key)
            self.logger.info("toorPIA authentication successful")
            return session_key
            
        except APIConnectionError:
            raise
        except Exception as e:
            raise AuthenticationError(
                f"Authentication error: {str(e)}",
                auth_type="api_key",
                api_key_provided=bool(api_key)
            )
    
    def fit_transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """basemap生成（fit_transform）"""
        response = self.post('/data/fit_transform', json=data)
        
        if not response.is_success():
            raise ValidationError(
                "fit_transform API call failed",
                validation_type="api_response",
                actual_data=response.to_dict()
            )
        
        return response.data
    
    def addplot(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """追加プロット"""
        response = self.post('/data/addplot', json=data)
        
        if not response.is_success():
            raise ValidationError(
                "addplot API call failed",
                validation_type="api_response",
                actual_data=response.to_dict()
            )
        
        return response.data


class IFHubAPIClient(EnhancedAPIClient):
    """IF-HUB API専用クライアント"""
    
    def __init__(self, 
                 api_url: str = "http://localhost:3001",
                 logger: Optional[logging.Logger] = None):
        """
        Args:
            api_url: IF-HUB API URL
            logger: ロガー
        """
        config = APIClientConfig(
            base_url=api_url,
            timeout=60.0,
            headers={'Content-Type': 'application/json'}
        )
        
        super().__init__(config, "ifhub_api", logger)
    
    def get_tags(self, equipment: str, include_gtags: bool = True) -> List[Dict[str, Any]]:
        """設備のタグ一覧取得"""
        params = {
            "equipment": equipment,
            "includeGtags": include_gtags
        }
        
        response = self.get('/api/tags', params=params)
        
        if not response.is_success():
            raise DataFetchError(
                f"Failed to fetch tags for equipment {equipment}",
                equipment_name=equipment
            )
        
        tags = response.data.get('tags', [])
        if not tags:
            raise DataFetchError(
                f"No tags found for equipment {equipment}",
                equipment_name=equipment
            )
        
        return tags
    
    def get_tag_data(self, 
                    tag_name: str, 
                    start_time: str, 
                    end_time: str) -> List[Dict[str, Any]]:
        """タグデータ取得"""
        params = {
            "start": start_time,
            "end": end_time
        }
        
        response = self.get(f'/api/data/{tag_name}', params=params)
        
        if not response.is_success():
            raise DataFetchError(
                f"Failed to fetch data for tag {tag_name}",
                tag_names=[tag_name],
                time_range={"start": start_time, "end": end_time}
            )
        
        return response.data.get('data', [])


# ファクトリー関数
def create_toorpia_client(api_url: str, 
                         api_key: Optional[str] = None,
                         logger: Optional[logging.Logger] = None) -> ToorPIAAPIClient:
    """toorPIA APIクライアント作成"""
    client = ToorPIAAPIClient(api_url, logger=logger)
    
    if api_key:
        client.authenticate(api_key)
    
    return client


def create_ifhub_client(api_url: str = "http://localhost:3001",
                       logger: Optional[logging.Logger] = None) -> IFHubAPIClient:
    """IF-HUB APIクライアント作成"""
    return IFHubAPIClient(api_url, logger)
