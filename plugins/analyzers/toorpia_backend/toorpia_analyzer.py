import requests
import pandas as pd
import os
import subprocess
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from ...base.base_analyzer import BaseAnalyzer
from ...base.lock_manager import EquipmentLockManager
from ...base.temp_file_manager import TempFileManager
from ...base.errors import (
    ConfigurationError, APIConnectionError, DataFetchError, 
    ValidationError, AuthenticationError, ProcessingModeError,
    TempFileError, LockError, PluginError, get_error_severity
)
from ...base.api_client import create_toorpia_client, create_ifhub_client

class ToorPIAAnalyzer(BaseAnalyzer):
    """toorPIA Backend API連携アナライザー"""
    
    def __init__(self, config_path: str, mode: Optional[str] = None):
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
        self.processing_mode: Optional[str] = mode
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
        """設定ファイルバリデーション（強化版）"""
        try:
            # toorpia_integration セクション存在確認
            if 'toorpia_integration' not in self.config:
                raise ConfigurationError(
                    "Missing 'toorpia_integration' section in config",
                    config_path=self.config_path,
                    invalid_field="toorpia_integration"
                )
            
            toorpia_config = self.config['toorpia_integration']
            
            # enabled チェック
            if not toorpia_config.get('enabled', False):
                raise ConfigurationError(
                    "toorPIA integration is disabled",
                    config_path=self.config_path,
                    invalid_field="toorpia_integration.enabled"
                )
            
            # basemap セクション存在確認
            if 'basemap' not in self.config:
                raise ConfigurationError(
                    "Missing 'basemap' section in config",
                    config_path=self.config_path,
                    invalid_field="basemap"
                )
            
            basemap_config = self.config['basemap']
            
            # source_tags 存在確認
            if 'source_tags' not in basemap_config or not basemap_config['source_tags']:
                raise ConfigurationError(
                    "Missing or empty 'source_tags' in basemap config",
                    config_path=self.config_path,
                    invalid_field="basemap.source_tags"
                )
            
            # API URL検証
            if not toorpia_config.get('api_url'):
                raise ConfigurationError(
                    "Missing API URL in toorpia_integration config",
                    config_path=self.config_path,
                    invalid_field="toorpia_integration.api_url"
                )
            
            # API認証設定の検証
            auth_config = toorpia_config.get('auth', {})
            if not auth_config.get('api_key'):
                raise ConfigurationError(
                    "Missing API key in toorpia_integration.auth config",
                    config_path=self.config_path,
                    invalid_field="toorpia_integration.auth.api_key"
                )
            
            # APIキーフォーマットの簡易チェック
            api_key = auth_config['api_key']
            if not api_key.startswith('toorpia_') or len(api_key) < 40:
                self.logger.warning("API key format may be invalid")
            
            self.logger.info("Config validation passed")
            return True
            
        except ConfigurationError as e:
            self.logger.error(f"Configuration error: {e}")
            self.logger.error(f"Suggestions: {', '.join(e.suggestions)}")
            return False
        except Exception as e:
            self.logger.error(f"Config validation failed: {e}")
            return False
    
    def execute(self) -> Dict[str, Any]:
        """排他制御付きメイン処理実行（強化版エラーハンドリング）"""
        accumulated_errors = []
        
        try:
            with self.lock_manager.acquire_lock(timeout=30):
                self.logger.info(f"Starting analysis for {self.equipment_name}")
                
                # 1. 事前処理
                if not self.prepare():
                    error = DataFetchError(
                        "Preparation phase failed - could not prepare data for analysis",
                        equipment_name=self.equipment_name
                    )
                    return self._create_detailed_error_response(error)
                
                # 2. 設定バリデーション
                if not self.validate_config():
                    error = ConfigurationError(
                        "Configuration validation failed",
                        config_path=self.config_path
                    )
                    return self._create_detailed_error_response(error)
                
                # 3. 処理モード別実行
                try:
                    if self.processing_mode == "basemap_update":
                        result = self._execute_basemap_update()
                    elif self.processing_mode == "addplot_update":
                        result = self._execute_addplot_update()
                    else:
                        error = ProcessingModeError(
                            f"Unknown processing mode: {self.processing_mode}",
                            specified_mode=self.processing_mode,
                            supported_modes=["basemap_update", "addplot_update"]
                        )
                        return self._create_detailed_error_response(error)
                
                except (APIConnectionError, AuthenticationError, ValidationError) as e:
                    # API関連エラーは詳細ログ付きで返す
                    self.logger.error(f"API operation failed: {e}")
                    return self._create_detailed_error_response(e)
                
                # 4. API応答バリデーション
                try:
                    if not self.validate_api_response(result):
                        error = ValidationError(
                            "API response validation failed",
                            validation_type="api_response",
                            actual_data=result
                        )
                        return self._create_detailed_error_response(error)
                
                except Exception as e:
                    error = ValidationError(
                        f"Response validation error: {str(e)}",
                        validation_type="response_structure"
                    )
                    return self._create_detailed_error_response(error)
                
                self.logger.info(f"Analysis completed successfully for {self.equipment_name}")
                return self._create_success_response(result)
                
        except TimeoutError:
            error = LockError(
                "Failed to acquire equipment lock - another process may be running",
                equipment_name=self.equipment_name,
                lock_timeout=30
            )
            return self._create_detailed_error_response(error)
        
        except Exception as e:
            # 予期しないエラーの場合
            self.logger.error(f"Unexpected execution error: {e}", exc_info=True)
            
            # エラータイプに基づいて適切なPluginErrorに変換
            if "config" in str(e).lower():
                error = ConfigurationError(f"Configuration issue: {str(e)}", config_path=self.config_path)
            elif "api" in str(e).lower() or "connection" in str(e).lower():
                error = APIConnectionError(f"API connection issue: {str(e)}")
            else:
                # 汎用的なプラグインエラー
                error = PluginError(
                    f"Plugin execution failed: {str(e)}",
                    "EXECUTION_FAILED",
                    details={"equipment": self.equipment_name, "mode": self.processing_mode}
                )
            
            return self._create_detailed_error_response(error)
        
        finally:
            # 一時ファイルクリーンアップ
            try:
                self.temp_manager.cleanup_temp_files()
            except Exception as cleanup_error:
                self.logger.warning(f"Failed to cleanup temp files: {cleanup_error}")
    
    def _determine_processing_mode(self) -> str:
        """処理モード判定"""
        # コンストラクタで指定されたモードを使用、未指定の場合はaddplot_update
        return self.processing_mode or 'addplot_update'
    
    def _fetch_equipment_data(self) -> bool:
        """IF-HUB APIを直接使用した設備データ取得"""
        try:
            # 一時ファイルパス生成
            self.temp_csv_path = self.temp_manager.generate_temp_filename("csv")
            
            # basemap設定取得
            basemap_config = self.config['basemap']
            
            # データ期間計算
            import dateutil.parser
            
            if self.processing_mode == "basemap_update":
                # basemap更新の場合は update 設定を使用
                update_config = basemap_config.get('update', {})
                start_time, end_time = self._calculate_time_range(update_config)
            else:  # addplot_update
                # addplotテスト用: basemap期間から少量データを取得
                start_time = dateutil.parser.parse("2024-01-15T10:00:00+09:00")
                end_time = dateutil.parser.parse("2024-01-15T10:10:00+09:00")
                self.logger.info("Using test data period for addplot (10 minutes from basemap period)")
            
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
        """basemap更新処理（identna対応版）"""
        try:
            self.logger.info("Executing basemap update (fit_transform)")
            
            # CSV データ読み込み
            df = pd.read_csv(self.temp_csv_path)
            
            # API リクエストデータ準備（toorpiaクライアントと同じ形式）
            columns = df.columns.tolist()
            data = df.values.tolist()
            
            # basemap processing設定取得
            basemap_processing = self.config['toorpia_integration'].get('basemap_processing', {})
            parameters = basemap_processing.get('parameters', {})
            
            request_data = {
                "columns": columns,
                "data": data,
                "label": self.equipment_name,
                "tag": f"{self.equipment_name}_basemap",
                "description": parameters.get('description', f"{self.equipment_name} baseline analysis"),
                "weight_option_str": parameters.get('weight_option_str', "1:0"),
                "type_option_str": parameters.get('type_option_str', "1:date")
            }
            
            # identnaパラメータの追加（値がある場合のみ）
            if parameters.get('identna_resolution') is not None:
                request_data['identna_resolution'] = parameters['identna_resolution']
            if parameters.get('identna_effective_radius') is not None:
                request_data['identna_effective_radius'] = parameters['identna_effective_radius']
            
            # API 呼び出し
            response = self._call_toorpia_api('fit_transform', request_data)
            
            # 正常領域生成の確認
            if response.get('normalAreaGenerated'):
                self.logger.info("Normal area file generated successfully")
            
            self.logger.info("Basemap update completed successfully")
            return response
            
        except Exception as e:
            self.logger.error(f"Basemap update failed: {e}")
            raise
    
    def _execute_addplot_update(self) -> Dict[str, Any]:
        """addplot追加処理（detabn対応版）"""
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
            
            # 設備名で最新の有効なbasemapを検索
            map_no = self._get_latest_basemap_no(self.equipment_name)
            self.logger.info(f"Using basemap {map_no} for addplot processing")
            
            request_data = {
                "columns": columns,
                "data": data,
                "mapNo": map_no,
                "weight_option_str": parameters.get('weight_option_str', "1:0"),
                "type_option_str": parameters.get('type_option_str', "1:date")
            }
            
            # detabnパラメータの追加（値がある場合のみ）
            if parameters.get('detabn_max_window') is not None:
                request_data['detabn_max_window'] = parameters['detabn_max_window']
            if parameters.get('detabn_rate_threshold') is not None:
                request_data['detabn_rate_threshold'] = parameters['detabn_rate_threshold']
            if parameters.get('detabn_threshold') is not None:
                request_data['detabn_threshold'] = parameters['detabn_threshold']
            if parameters.get('detabn_print_score') is not None:
                request_data['detabn_print_score'] = parameters['detabn_print_score']
            
            # API 呼び出し
            response = self._call_toorpia_api('addplot', request_data)
            
            # 異常度情報の取得とログ出力
            abnormality_status = response.get('abnormalityStatus', 'unknown')
            abnormality_score = response.get('abnormalityScore')
            
            self.logger.info(f"Abnormality detection result: status={abnormality_status}, " 
                            f"score={abnormality_score if abnormality_score is not None else 'N/A'}")
            
            # 異常と判定された場合は警告レベルでログ出力
            if abnormality_status == 'abnormal':
                self.logger.warning(f"ABNORMAL data detected for {self.equipment_name}: "
                                  f"score={abnormality_score}")
                
                # 必要に応じて通知システムとの連携をここに追加
                # self._send_abnormal_notification(abnormality_status, abnormality_score)
            
            self.logger.info("Addplot update completed successfully")
            return response
            
        except Exception as e:
            if "No basemap found" in str(e) or "No valid basemap found" in str(e):
                raise ProcessingModeError(
                    f"Cannot perform addplot: {str(e)}. Please create a basemap first using basemap_update mode.",
                    specified_mode="addplot_update",
                    suggested_action="Run basemap_update mode first"
                )
            else:
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
        api_key = auth_config.get('api_key', '')  # 'session_key' から 'api_key' に変更
        
        if not api_key:
            raise AuthenticationError(
                "API key not found in configuration",
                auth_type="api_key",
                config_path=self.config_path
            )
        
        # APIキーを使ってセッションキーを取得（toorpiaクライアントと同じ実装）
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
                    raise AuthenticationError(
                        "No session key in authentication response",
                        auth_type="response_format",
                        response_data=result
                    )
            else:
                error_msg = f"Authentication failed: {response.status_code} - {response.text}"
                self.logger.error(error_msg)
                raise AuthenticationError(
                    error_msg,
                    auth_type="http_error",
                    status_code=response.status_code
                )
                
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Network error during authentication: {e}")
            raise APIConnectionError(
                f"Failed to connect to authentication endpoint: {str(e)}",
                api_url=auth_url
            )
    
    def _calculate_time_range(self, update_config: Dict[str, Any]) -> tuple:
        """basemap更新時の時間範囲計算（新しい設定構造に対応）"""
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
    
    def _parse_interval_to_start_time(self, interval: str, end_time) -> datetime:
        """間隔文字列から開始時間を計算"""
        
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
    
    def _get_equipment_basemaps(self, equipment_name: str) -> List[Dict]:
        """設備名でbasemap一覧を取得"""
        try:
            session_key = self._get_session_key()
            url = f"{self.api_url}/maps"
            headers = {'session-key': session_key}
            
            self.logger.info(f"Fetching basemap list for equipment: {equipment_name}")
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            all_maps = response.json()
            
            # 設備名でフィルタ
            equipment_maps = [m for m in all_maps if m.get('label') == equipment_name]
            
            self.logger.info(f"Found {len(equipment_maps)} basemaps for equipment {equipment_name}")
            for i, basemap in enumerate(equipment_maps):
                self.logger.debug(f"  Basemap {i+1}: mapNo={basemap.get('mapNo')}, "
                                f"nRecord={basemap.get('nRecord')}, "
                                f"createdAt={basemap.get('createdAt')}")
            
            # 作成日時でソート（最新順）
            return sorted(equipment_maps, key=lambda x: x['createdAt'], reverse=True)
            
        except Exception as e:
            self.logger.error(f"Failed to fetch basemap list: {e}")
            raise APIConnectionError(f"Failed to retrieve basemap list: {str(e)}")
    
    def _get_latest_basemap_no(self, equipment_name: str) -> int:
        """設備の最新basemapのmapNoを取得（データ点数確認付き）"""
        basemaps = self._get_equipment_basemaps(equipment_name)
        
        if not basemaps:
            raise Exception(f"No basemap found for equipment: {equipment_name}")
        
        # 最新のbasemapから順に確認
        for basemap in basemaps:
            map_no = basemap['mapNo']
            nRecord = basemap.get('nRecord', 0)
            created_at = basemap.get('createdAt', 'unknown')
            
            self.logger.info(f"Checking basemap {map_no}: {nRecord} records, created at {created_at}")
            
            if nRecord > 0:
                self.logger.info(f"Selected basemap {map_no} with {nRecord} data points")
                return map_no
            else:
                self.logger.warning(f"Basemap {map_no} has no data points (nRecord={nRecord}), skipping")
        
        # すべてのbasemapがデータ点数0の場合
        raise Exception(f"No valid basemap found for equipment {equipment_name} - all basemaps have 0 data points")
    
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
        """toorPIA API応答バリデーション（処理モード別対応）"""
        try:
            validation_config = self.config.get('toorpia_integration', {}).get('validation', {})
            required_fields = validation_config.get('required_response_fields', ['message', 'resdata'])
            
            # 必須フィールド確認
            missing_fields = []
            for field in required_fields:
                if field not in response:
                    missing_fields.append(field)
            
            if missing_fields:
                raise ValidationError(
                    f"Missing required fields in API response: {', '.join(missing_fields)}",
                    validation_type="api_response_structure",
                    expected_fields=required_fields,
                    actual_data=response
                )
            
            # resdata内のバリデーション（処理モード別）
            if 'resdata' in response:
                if self.processing_mode == "basemap_update":
                    # basemapの場合はmapNoが必要
                    resdata_fields = validation_config.get('required_resdata_fields', ['mapNo'])
                else:
                    # addplotの場合はmapNoは不要（入力として使用するが出力では不要）
                    resdata_fields = []
                
                missing_resdata_fields = []
                
                for field in resdata_fields:
                    if field not in response['resdata']:
                        missing_resdata_fields.append(field)
                
                if missing_resdata_fields:
                    raise ValidationError(
                        f"Missing required fields in resdata: {', '.join(missing_resdata_fields)}",
                        validation_type="api_resdata_structure",
                        expected_fields=resdata_fields,
                        actual_data=response.get('resdata', {})
                    )
            
            # addplotの場合は異常度情報も検証
            if self.processing_mode == "addplot_update" and 'resdata' in response:
                # 異常度情報が含まれている場合の追加検証
                if 'abnormalityStatus' in response:
                    valid_statuses = ['normal', 'abnormal', 'unknown']
                    if response['abnormalityStatus'] not in valid_statuses:
                        self.logger.warning(f"Unexpected abnormality status: {response['abnormalityStatus']}")
                
                # 異常度スコアの型チェック
                if 'abnormalityScore' in response and response['abnormalityScore'] is not None:
                    if not isinstance(response['abnormalityScore'], (int, float)):
                        self.logger.warning(f"Invalid abnormality score type: {type(response['abnormalityScore'])}")
            
            # HTTP status確認
            if 'status' in response and response['status'] != 'success':
                self.logger.warning(f"API returned non-success status: {response['status']}")
            
            self.logger.info(f"API response validation passed for {self.processing_mode}")
            return True
            
        except ValidationError:
            raise  # ValidationErrorはそのまま再発生
        except Exception as e:
            self.logger.error(f"API response validation failed: {e}")
            raise ValidationError(
                f"Validation process error: {str(e)}",
                validation_type="validation_process",
                actual_data=response
            )
    
    def _create_success_response(self, api_response: Dict[str, Any]) -> Dict[str, Any]:
        """成功レスポンス生成（異常度情報を含む）"""
        
        response = {
            "status": "success",
            "equipment": self.equipment_name,
            "timestamp": self._get_timestamp(),
            "processing_mode": self.processing_mode,
            "api_response": api_response
        }
        
        # addplot_updateの場合は異常度情報を追加
        if self.processing_mode == "addplot_update":
            response["abnormality_detection"] = {
                "status": api_response.get('abnormalityStatus', 'unknown'),
                "score": api_response.get('abnormalityScore'),
                "addplot_no": api_response.get('addPlotNo')
            }
        
        return response

    def _create_detailed_error_response(self, error: PluginError) -> Dict[str, Any]:
        """詳細エラー応答生成（PluginError対応）"""
        
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
                "processing_mode": self.processing_mode,
                "config_path": self.config_path,
                "api_url": self.api_url,
                "temp_files": self.temp_manager.list_temp_files() if hasattr(self, 'temp_manager') else []
            }
        }
