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
        """IF-HUB APIを直接使用した設備データ取得"""
        try:
            # 一時ファイルパス生成
            self.temp_csv_path = self.temp_manager.generate_temp_filename("csv")
            
            # basemap設定取得
            basemap_config = self.config['basemap']
            
            # データ期間計算
            from datetime import datetime, timedelta
            import dateutil.parser
            
            if self.processing_mode == "basemap_update":
                # basemap更新の場合は update 設定を使用
                update_config = basemap_config.get('update', {})
                start_time, end_time = self._calculate_time_range(update_config)
            else:  # addplot_update
                # addplot更新の場合は addplot 設定を使用
                addplot_config = basemap_config.get('addplot', {})
                lookback_period = addplot_config.get('lookback_period', '10D')
                end_time = datetime.now()
                start_time = self._parse_interval_to_start_time(lookback_period, end_time)
            
            # ISO形式に変換
            start_iso = start_time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            end_iso = end_time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            
            self.logger.info(f"Fetching data from {start_iso} to {end_iso}")
            
            # IF-HUB APIでデータ取得
            return self._fetch_data_via_api(start_iso, end_iso)
            
        except Exception as e:
            self.logger.error(f"Failed to fetch equipment data: {e}")
            return False
    
    def _fetch_data_via_api(self, start_iso: str, end_iso: str) -> bool:
        """IF-HUB APIを使用してデータ取得"""
        try:
            # 1. 設備のタグ一覧取得（gtagsも含む）
            tags_url = f"http://localhost:3001/api/tags?equipment={self.equipment_name}&includeGtags=true"
            tags_response = requests.get(tags_url, timeout=30)
            tags_response.raise_for_status()
            
            tags_data = tags_response.json()
            tags = tags_data.get('tags', [])
            
            if not tags:
                self.logger.error(f"No tags found for equipment: {self.equipment_name}")
                return False
            
            self.logger.info(f"Found {len(tags)} tags for equipment {self.equipment_name}")
            
            # 2. 各タグのデータ取得
            all_data = {}
            timestamps = set()
            
            for tag in tags:
                tag_name = tag['name']  # e.g., "7th-untan.POW:7I1032.PV"
                
                # source_tagまたはnameをカラム名として使用
                if tag.get('is_gtag', False):
                    # gtagの場合はnameを使用
                    column_name = tag_name.split('.')[-1] if '.' in tag_name else tag_name
                else:
                    # 通常タグの場合はsource_tagを使用
                    column_name = tag.get('source_tag', tag_name)
                
                # データAPI呼び出し
                data_url = f"http://localhost:3001/api/data/{tag_name}"
                params = {
                    'start': start_iso,
                    'end': end_iso
                }
                
                self.logger.debug(f"Fetching data for tag: {tag_name} -> {column_name}")
                data_response = requests.get(data_url, params=params, timeout=60)
                
                if data_response.status_code == 200:
                    tag_data = data_response.json()
                    data_points = tag_data.get('data', [])
                    
                    all_data[column_name] = {}
                    
                    for point in data_points:
                        timestamp = point['timestamp']
                        value = point['value']
                        all_data[column_name][timestamp] = value
                        timestamps.add(timestamp)
                    
                    self.logger.debug(f"Tag {column_name}: {len(data_points)} data points")
                else:
                    self.logger.warning(f"Failed to fetch data for tag {tag_name}: {data_response.status_code}")
            
            # 3. DataFrameに変換
            timestamps_sorted = sorted(list(timestamps))
            
            if not timestamps_sorted:
                self.logger.error("No data points found for any tags")
                return False
            
            # CSVデータ構築
            csv_data = []
            for timestamp in timestamps_sorted:
                # timestampを適切な形式に変換 (ISO -> "YYYY-MM-DD HH:MM:SS")
                from datetime import datetime as dt
                try:
                    dt_obj = dt.fromisoformat(timestamp.replace('Z', '+00:00'))
                    formatted_timestamp = dt_obj.strftime("%Y-%m-%d %H:%M:%S")
                except:
                    formatted_timestamp = timestamp
                
                row = {'timestamp': formatted_timestamp}
                for column_name in all_data.keys():
                    value = all_data[column_name].get(timestamp, '')
                    row[column_name] = value
                csv_data.append(row)
            
            # DataFrameに変換してCSV保存
            df = pd.DataFrame(csv_data)
            
            if not df.empty:
                df.to_csv(self.temp_csv_path, index=False)
                self.logger.info(f"Equipment data saved: {self.temp_csv_path} ({len(df)} rows, {len(df.columns)-1} tags)")
                return True
            else:
                self.logger.error("No data retrieved from API")
                return False
                
        except Exception as e:
            self.logger.error(f"API data fetch failed: {e}")
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
        auth_config = self.config.get('toorpia_integration', {}).get('auth', {})
        api_key = auth_config.get('session_key', '')  # これは実際にはAPIキー
        
        if not api_key:
            raise ValueError("API key not found in configuration")
        
        # APIキーを使ってセッションキーを取得
        auth_url = f"{self.api_url}/auth/login"
        auth_data = {"apiKey": api_key}
        
        self.logger.info("Authenticating with toorPIA Backend API")
        
        try:
            response = requests.post(
                auth_url,
                json=auth_data,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                session_key = result.get('sessionKey')
                if session_key:
                    self.logger.info("Authentication successful, session key obtained")
                    return session_key
                else:
                    raise ValueError("No session key in authentication response")
            else:
                error_msg = f"Authentication failed: {response.status_code} - {response.text}"
                self.logger.error(error_msg)
                raise Exception(error_msg)
                
        except Exception as e:
            self.logger.error(f"Authentication error: {e}")
            raise
    
    def _calculate_time_range(self, update_config: Dict[str, Any]) -> tuple:
        """basemap更新時の時間範囲計算（新しい設定構造に対応）"""
        from datetime import datetime
        import dateutil.parser
        
        update_type = update_config.get('type', 'periodic')
        
        if update_type == 'fix':
            # 固定期間モード
            data_config = update_config.get('data', {})
            start_time_str = data_config.get('start')
            end_time_str = data_config.get('end')
            
            if not start_time_str or not end_time_str:
                raise ValueError("type='fix' requires 'data.start' and 'data.end' parameters")
            
            try:
                start_time = dateutil.parser.parse(start_time_str)
                end_time = dateutil.parser.parse(end_time_str)
                self.logger.info(f"Using fixed time range: {start_time_str} to {end_time_str}")
                return start_time, end_time
            except Exception as e:
                raise ValueError(f"Invalid datetime format in data.start/end: {e}")
                
        elif update_type == 'periodic':
            # 周期モード - data.lookback を使用
            data_config = update_config.get('data', {})
            lookback_period = data_config.get('lookback', '10D')
            
            end_time = datetime.now()
            start_time = self._parse_interval_to_start_time(lookback_period, end_time)
            self.logger.info(f"Using periodic data range: {lookback_period} lookback from current time")
            return start_time, end_time
            
        else:
            raise ValueError(f"Invalid update type '{update_type}'. Must be 'fix' or 'periodic'")
    
    def _parse_interval_to_start_time(self, interval: str, end_time) -> 'datetime':
        """間隔文字列から開始時間を計算"""
        from datetime import timedelta
        
        try:
            if interval.endswith('D') or interval.endswith('d'):
                days = int(interval[:-1])
                return end_time - timedelta(days=days)
            elif interval.endswith('H') or interval.endswith('h'):
                hours = int(interval[:-1])
                return end_time - timedelta(hours=hours)
            elif interval.endswith('m'):
                minutes = int(interval[:-1])
                return end_time - timedelta(minutes=minutes)
            elif interval.endswith('s'):
                seconds = int(interval[:-1])
                return end_time - timedelta(seconds=seconds)
            else:
                # デフォルトは日数として扱う
                days = int(interval)
                self.logger.warning(f"No unit specified for interval '{interval}', treating as days")
                return end_time - timedelta(days=days)
        except ValueError as e:
            self.logger.error(f"Invalid interval format '{interval}': {e}")
            # フォールバック: 10日間
            return end_time - timedelta(days=10)
    
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
