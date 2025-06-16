import requests
import pandas as pd
import os
import subprocess
from typing import Dict, Any, Optional
from ...base.base_analyzer import BaseAnalyzer
from ...base.lock_manager import EquipmentLockManager
from ...base.temp_file_manager import TempFileManager

class ToorPIAAnalyzer(BaseAnalyzer):
    """toorPIA Backend API連携アナライザー"""
    
    def __init__(self, config_path: str):
        super().__init__(config_path)
        
        # 並列処理対応コンポーネント
        self.lock_manager = EquipmentLockManager(self.equipment_name)
        self.temp_manager = TempFileManager(self.equipment_name)
        
        # API設定
        toorpia_config = self.config.get('toorpia_integration', {})
        self.api_url = toorpia_config.get('api_url', 'http://localhost:3000')
        self.endpoints = toorpia_config.get('endpoints', {
            'fit_transform': '/data/fit_transform',
            'addplot': '/data/addplot'
        })
        self.timeout = toorpia_config.get('timeout', 300)
        
        # 処理モード
        self.processing_mode: Optional[str] = None
        self.temp_csv_path: Optional[str] = None
        
    def prepare(self) -> bool:
        """事前処理：データ取得とCSV準備"""
        try:
            # 処理モード判定
            self.processing_mode = self._determine_processing_mode()
            self.logger.info(f"Processing mode: {self.processing_mode}")
            
            # CSVデータ取得
            success = self._fetch_equipment_data()
            if not success:
                self.logger.error("Failed to fetch equipment data")
                return False
            
            self.logger.info("Preparation completed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Preparation failed: {e}")
            return False
    
    def validate_config(self) -> bool:
        """設定ファイルバリデーション"""
        try:
            # toorpia_integration セクション存在確認
            if 'toorpia_integration' not in self.config:
                self.logger.error("Missing 'toorpia_integration' section in config")
                return False
            
            toorpia_config = self.config['toorpia_integration']
            
            # enabled チェック
            if not toorpia_config.get('enabled', False):
                self.logger.warning("toorPIA integration is disabled")
                return False
            
            # basemap セクション存在確認
            if 'basemap' not in self.config:
                self.logger.error("Missing 'basemap' section in config")
                return False
            
            basemap_config = self.config['basemap']
            
            # source_tags 存在確認
            if 'source_tags' not in basemap_config or not basemap_config['source_tags']:
                self.logger.error("Missing or empty 'source_tags' in basemap config")
                return False
            
            self.logger.info("Config validation passed")
            return True
            
        except Exception as e:
            self.logger.error(f"Config validation failed: {e}")
            return False
    
    def execute(self) -> Dict[str, Any]:
        """排他制御付きメイン処理実行"""
        try:
            with self.lock_manager.acquire_lock(timeout=30):
                self.logger.info(f"Starting analysis for {self.equipment_name}")
                
                if not self.prepare():
                    return self._create_error_response("Preparation failed", "PREPARE_FAILED")
                
                if not self.validate_config():
                    return self._create_error_response("Config validation failed", "CONFIG_INVALID")
                
                # 処理モード別実行
                if self.processing_mode == "basemap_update":
                    result = self._execute_basemap_update()
                elif self.processing_mode == "addplot_update":
                    result = self._execute_addplot_update()
                else:
                    return self._create_error_response(f"Unknown processing mode: {self.processing_mode}", "MODE_UNKNOWN")
                
                # API応答バリデーション
                if not self.validate_api_response(result):
                    return self._create_error_response("API response validation failed", "RESPONSE_INVALID")
                
                self.logger.info(f"Analysis completed for {self.equipment_name}")
                return self._create_success_response(result)
                
        except TimeoutError:
            error_msg = "Another process is running for this equipment"
            self.logger.error(error_msg)
            return self._create_error_response(error_msg, "LOCK_TIMEOUT")
        
        except Exception as e:
            self.logger.error(f"Execution failed: {e}")
            return self._create_error_response(str(e), "EXECUTION_FAILED")
        
        finally:
            # 一時ファイルクリーンアップ
            self.temp_manager.cleanup_temp_files()
    
    def _determine_processing_mode(self) -> str:
        """処理モード判定"""
        # 実装では、cron実行時の引数やスケジュール設定から判定
        # 今回は環境変数やコマンドライン引数から取得
        mode = os.getenv('TOORPIA_MODE', 'addplot_update')
        return mode
    
    def _fetch_equipment_data(self) -> bool:
        """Fetcherを使用した設備データ取得"""
        try:
            # 一時ファイルパス生成
            self.temp_csv_path = self.temp_manager.generate_temp_filename("csv")
            
            # basemap設定取得
            basemap_config = self.config['basemap']
            
            # データ期間計算
            if self.processing_mode == "basemap_update":
                lookback_period = basemap_config.get('update', {}).get('interval', '10D')
            else:  # addplot_update
                lookback_period = basemap_config.get('addplot', {}).get('lookback_period', '10D')
            
            # 開始時刻計算
            from datetime import datetime, timedelta
            if lookback_period.endswith('D'):
                days = int(lookback_period[:-1])
                start_time = datetime.now() - timedelta(days=days)
            elif lookback_period.endswith('m'):
                minutes = int(lookback_period[:-1])
                start_time = datetime.now() - timedelta(minutes=minutes)
            else:
                start_time = datetime.now() - timedelta(days=10)  # デフォルト
            
            start_date = start_time.strftime("%Y%m%d%H%M")
            
            # Fetcher実行
            fetcher_cmd = [
                "node", "dist/bin/if-hub-fetcher",
                "--equipment", self.equipment_name,
                "--start-date", start_date,
                "--output-dir", "tmp",
                "--verbose"
            ]
            
            result = subprocess.run(fetcher_cmd, cwd="fetcher", capture_output=True, text=True)
            
            if result.returncode == 0:
                # 生成されたCSVファイルを一時ファイルパスにコピー
                generated_csv = f"fetcher/tmp/{self.equipment_name}_{start_date}.csv"
                if os.path.exists(generated_csv):
                    import shutil
                    shutil.copy2(generated_csv, self.temp_csv_path)
                    self.logger.info(f"Equipment data fetched: {self.temp_csv_path}")
                    return True
            
            self.logger.error(f"Fetcher execution failed: {result.stderr}")
            return False
            
        except Exception as e:
            self.logger.error(f"Failed to fetch equipment data: {e}")
            return False
    
    def _execute_basemap_update(self) -> Dict[str, Any]:
        """basemap更新処理"""
        try:
            self.logger.info("Executing basemap update (fit_transform)")
            
            # CSV データ読み込み
            df = pd.read_csv(self.temp_csv_path)
            
            # API リクエストデータ準備
            columns = df.columns.tolist()
            data = df.values.tolist()
            
            # basemap processing設定取得
            basemap_processing = self.config['toorpia_integration'].get('basemap_processing', {})
            parameters = basemap_processing.get('parameters', {})
            
            request_data = {
                "columns": columns,
                "data": data,
                "label": parameters.get('label', f"{self.equipment_name} Basemap"),
                "tag": f"{self.equipment_name}_basemap",
                "description": parameters.get('description', f"{self.equipment_name} baseline analysis"),
                "weight_option_str": parameters.get('weight_option_str', "1:0"),
                "type_option_str": parameters.get('type_option_str', "1:date")
            }
            
            # API 呼び出し
            response = self._call_toorpia_api('fit_transform', request_data)
            
            self.logger.info("Basemap update completed successfully")
            return response
            
        except Exception as e:
            self.logger.error(f"Basemap update failed: {e}")
            raise
    
    def _execute_addplot_update(self) -> Dict[str, Any]:
        """addplot追加処理"""
        try:
            self.logger.info("Executing addplot update")
            
            # CSV データ読み込み
            df = pd.read_csv(self.temp_csv_path)
            
            # API リクエストデータ準備
            columns = df.columns.tolist()
            data = df.values.tolist()
            
            # addplot processing設定取得
            addplot_processing = self.config['toorpia_integration'].get('addplot_processing', {})
            parameters = addplot_processing.get('parameters', {})
            
            # 既存マップ情報取得（実装では前回のbasemapのmapNo使用）
            map_no = self._get_latest_map_no()
            
            request_data = {
                "columns": columns,
                "data": data,
                "mapNo": map_no,
                "weight_option_str": parameters.get('weight_option_str', "1:0"),
                "type_option_str": parameters.get('type_option_str', "1:date")
            }
            
            # API 呼び出し
            response = self._call_toorpia_api('addplot', request_data)
            
            self.logger.info("Addplot update completed successfully")
            return response
            
        except Exception as e:
            self.logger.error(f"Addplot update failed: {e}")
            raise
    
    def _call_toorpia_api(self, endpoint_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """toorPIA API呼び出し"""
        endpoint = self.endpoints.get(endpoint_type)
        if not endpoint:
            raise ValueError(f"Unknown endpoint type: {endpoint_type}")
        
        url = f"{self.api_url}{endpoint}"
        
        # セッションキー取得（実装では認証処理）
        session_key = self._get_session_key()
        
        headers = {
            'Content-Type': 'application/json',
            'session-key': session_key
        }
        
        self.logger.info(f"Calling toorPIA API: {endpoint_type} -> {url}")
        
        response = requests.post(
            url,
            json=data,
            headers=headers,
            timeout=self.timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            self.logger.info(f"API call successful: {endpoint_type}")
            return result
        else:
            error_msg = f"API call failed: {response.status_code} - {response.text}"
            self.logger.error(error_msg)
            raise Exception(error_msg)
    
    def _get_session_key(self) -> str:
        """toorPIA認証セッションキー取得"""
        # 実装では認証API呼び出し、キャッシュ管理等
        # 簡易実装では設定ファイルから取得
        auth_config = self.config.get('toorpia_integration', {}).get('auth', {})
        return auth_config.get('session_key', 'default_session_key')
    
    def _get_latest_map_no(self) -> int:
        """最新のマップ番号取得"""
        # 実装では前回のbasemap処理結果から取得
        # 簡易実装では設定ファイルから取得
        return self.config.get('toorpia_integration', {}).get('state', {}).get('last_map_no', 1)
    
    def get_status(self) -> Dict[str, Any]:
        """ステータス取得"""
        return {
            "equipment": self.equipment_name,
            "processing_mode": self.processing_mode,
            "api_url": self.api_url,
            "lock_status": self.lock_manager.is_locked(),
            "temp_files": self.temp_manager.list_temp_files()
        }
    
    def validate_api_response(self, response: Dict[str, Any]) -> bool:
        """toorPIA API応答バリデーション"""
        try:
            validation_config = self.config.get('toorpia_integration', {}).get('validation', {})
            required_fields = validation_config.get('required_response_fields', ['message', 'resdata'])
            
            # 必須フィールド確認
            for field in required_fields:
                if field not in response:
                    self.logger.error(f"Missing required field in API response: {field}")
                    return False
            
            # resdata内のバリデーション
            if 'resdata' in response:
                resdata_fields = validation_config.get('required_resdata_fields', ['mapNo'])
                for field in resdata_fields:
                    if field not in response['resdata']:
                        self.logger.error(f"Missing required field in resdata: {field}")
                        return False
            
            # HTTP status確認
            if 'status' in response and response['status'] != 'success':
                self.logger.warning(f"API returned non-success status: {response['status']}")
            
            self.logger.info("API response validation passed")
            return True
            
        except Exception as e:
            self.logger.error(f"API response validation failed: {e}")
            return False
