from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import yaml
import logging
import os
from pathlib import Path

class BaseAnalyzer(ABC):
    """プラグインの基底クラス"""
    
    def __init__(self, config_path: str):
        """
        Args:
            config_path: 設備設定ファイルパス (configs/equipments/{equipment}/config.yaml)
        """
        self.config_path = config_path
        self.config: Dict[str, Any] = {}
        self.equipment_name: str = ""
        self.logger: Optional[logging.Logger] = None
        
        # 設備名抽出
        self.equipment_name = self._extract_equipment_name(config_path)
        
        # 設定ファイル読み込み
        self._load_config()
        
        # ログ設定
        self._setup_logging()
    
    def _extract_equipment_name(self, config_path: str) -> str:
        """設備設定ファイルパスから設備名を抽出"""
        # configs/equipments/7th-untan/config.yaml -> 7th-untan
        path_parts = Path(config_path).parts
        if 'equipments' in path_parts:
            idx = path_parts.index('equipments')
            if idx + 1 < len(path_parts):
                return path_parts[idx + 1]
        raise ValueError(f"Invalid config path format: {config_path}")
    
    def _load_config(self) -> None:
        """設定ファイル読み込み"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                self.config = yaml.safe_load(f)
        except Exception as e:
            raise ValueError(f"Failed to load config file {self.config_path}: {e}")
    
    def _setup_logging(self) -> None:
        """設備別ログ設定"""
        # logs/{equipment}/ ディレクトリ作成
        log_dir = Path("logs") / self.equipment_name
        log_dir.mkdir(parents=True, exist_ok=True)
        
        # ログ設定取得
        log_config = self.config.get('toorpia_integration', {}).get('logging', {})
        log_level = log_config.get('level', 'INFO')
        log_file = log_dir / log_config.get('filename', 'toorpia_analyzer.log')
        
        # ロガー作成
        logger_name = f'toorpia_{self.equipment_name}'
        self.logger = logging.getLogger(logger_name)
        self.logger.setLevel(getattr(logging, log_level.upper()))
        
        # ハンドラー設定（重複登録防止）
        if not self.logger.handlers:
            # ファイルハンドラー（ローテーション）
            from logging.handlers import RotatingFileHandler
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=log_config.get('max_size_mb', 10) * 1024 * 1024,
                backupCount=log_config.get('backup_count', 5)
            )
            
            # フォーマッター
            formatter = logging.Formatter(
                f'%(asctime)s - {self.equipment_name} - %(name)s - %(levelname)s - %(message)s'
            )
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)
            
            # コンソールハンドラー（オプション）
            if log_config.get('console', True):
                console_handler = logging.StreamHandler()
                console_handler.setFormatter(formatter)
                self.logger.addHandler(console_handler)
    
    @abstractmethod
    def prepare(self) -> bool:
        """事前処理・テンプレート展開"""
        pass
    
    @abstractmethod
    def validate_config(self) -> bool:
        """設定ファイルバリデーション"""
        pass
    
    @abstractmethod
    def execute(self) -> Dict[str, Any]:
        """メイン処理実行"""
        pass
    
    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """ステータス取得"""
        pass
    
    @abstractmethod
    def validate_api_response(self, response: Dict[str, Any]) -> bool:
        """API応答バリデーション"""
        pass
    
    def _create_success_response(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """成功応答生成"""
        return {
            "status": "success",
            "equipment": self.equipment_name,
            "timestamp": self._get_timestamp(),
            "data": data
        }
    
    def _create_error_response(self, message: str, error_code: str = "UNKNOWN") -> Dict[str, Any]:
        """エラー応答生成"""
        return {
            "status": "error",
            "equipment": self.equipment_name,
            "timestamp": self._get_timestamp(),
            "error": {
                "code": error_code,
                "message": message
            }
        }
    
    def _get_timestamp(self) -> str:
        """現在時刻取得（ISO形式）"""
        from datetime import datetime
        return datetime.now().isoformat()
