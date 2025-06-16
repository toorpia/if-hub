#!/usr/bin/env python3
"""
toorPIA Backend Plugin Scheduler
toorPIA連携プラグインのスケジュール管理
"""

import os
import yaml
import subprocess
import tempfile
import shutil
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import re

class ToorpiaBackendScheduler:
    """toorPIA Backend プラグインスケジューラー"""
    
    def __init__(self):
        self.plugin_name = "toorpia_backend"
        self.plugin_type = "analyzer"
        self.cron_comment_prefix = "# IF-HUB toorPIA"
        
        # IF-HUBプロジェクトルートを取得
        current_dir = os.path.dirname(__file__)
        self.project_root = os.path.abspath(os.path.join(current_dir, "..", "..", ".."))
        
    def setup_schedules(self, config_files: List[str]) -> bool:
        """スケジュール初期セットアップ"""
        try:
            print(f"🔧 Setting up cron schedules for {len(config_files)} equipment(s)")
            
            # 現在のcrontabをバックアップ
            if not self._backup_crontab():
                print("⚠️  Failed to backup crontab, but continuing...")
            
            # 各設備の設定を解析してcronエントリを生成
            cron_entries = []
            for config_path in config_files:
                entries = self._generate_cron_entries(config_path)
                cron_entries.extend(entries)
            
            if not cron_entries:
                print("⚠️  No valid cron entries generated")
                return False
            
            # crontabを更新
            return self._update_crontab(cron_entries)
            
        except Exception as e:
            print(f"❌ Setup failed: {e}")
            return False
    
    def get_schedule_status(self) -> Dict[str, Any]:
        """現在のスケジュール状況を取得"""
        try:
            # 現在のcrontabを取得
            result = subprocess.run(['crontab', '-l'], 
                                  capture_output=True, text=True)
            
            if result.returncode != 0:
                return {
                    "status": "error",
                    "message": "Failed to read crontab",
                    "error": result.stderr
                }
            
            crontab_content = result.stdout
            
            # toorPIA関連のエントリを抽出
            toorpia_entries = []
            lines = crontab_content.split('\n')
            
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                if line.startswith(self.cron_comment_prefix):
                    # コメント行とその次の実際のcronエントリ
                    if i + 1 < len(lines):
                        cron_line = lines[i + 1].strip()
                        if cron_line and not cron_line.startswith('#'):
                            toorpia_entries.append({
                                "comment": line,
                                "cron_expression": cron_line,
                                "parsed": self._parse_cron_entry(cron_line)
                            })
                        i += 2
                    else:
                        i += 1
                else:
                    i += 1
            
            return {
                "status": "success",
                "plugin": f"{self.plugin_type}/{self.plugin_name}",
                "total_entries": len(toorpia_entries),
                "entries": toorpia_entries,
                "last_updated": self._get_crontab_mtime()
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to get schedule status: {e}"
            }
    
    def add_equipment_schedule(self, config_path: str) -> bool:
        """新規設備のスケジュール追加"""
        try:
            print(f"➕ Adding schedule for equipment: {os.path.basename(os.path.dirname(config_path))}")
            
            # 新規エントリを生成
            new_entries = self._generate_cron_entries(config_path)
            if not new_entries:
                print("⚠️  No valid cron entries generated for this equipment")
                return False
            
            # 現在のcrontabを取得
            result = subprocess.run(['crontab', '-l'], 
                                  capture_output=True, text=True)
            
            if result.returncode == 0:
                current_crontab = result.stdout
            else:
                current_crontab = ""
            
            # 重複チェック
            equipment_name = self._extract_equipment_name(config_path)
            if self._has_equipment_entries(current_crontab, equipment_name):
                print(f"⚠️  Schedule for equipment '{equipment_name}' already exists")
                return False
            
            # 新規エントリを追加
            updated_crontab = current_crontab.rstrip('\n') + '\n\n'
            for entry in new_entries:
                updated_crontab += entry + '\n'
            
            # crontabを更新
            return self._apply_crontab(updated_crontab)
            
        except Exception as e:
            print(f"❌ Add equipment failed: {e}")
            return False
    
    def remove_schedules(self) -> bool:
        """toorPIA関連のスケジュールを削除"""
        try:
            print(f"🗑️  Removing all toorPIA schedules")
            
            # 現在のcrontabを取得
            result = subprocess.run(['crontab', '-l'], 
                                  capture_output=True, text=True)
            
            if result.returncode != 0:
                print("⚠️  No crontab found or error reading crontab")
                return True  # 削除対象がないので成功とする
            
            current_crontab = result.stdout
            
            # toorPIA関連行を除去
            filtered_lines = []
            lines = current_crontab.split('\n')
            
            i = 0
            while i < len(lines):
                line = lines[i]
                if line.strip().startswith(self.cron_comment_prefix):
                    # コメント行とその次のcron行をスキップ
                    i += 2  # コメント行 + cron行
                else:
                    filtered_lines.append(line)
                    i += 1
            
            # 更新されたcrontabを適用
            updated_crontab = '\n'.join(filtered_lines)
            return self._apply_crontab(updated_crontab)
            
        except Exception as e:
            print(f"❌ Remove schedules failed: {e}")
            return False
    
    def enable_schedules(self) -> bool:
        """スケジュールを有効化（コメントアウトを解除）"""
        try:
            print("▶️  Enabling toorPIA schedules")
            
            result = subprocess.run(['crontab', '-l'], 
                                  capture_output=True, text=True)
            
            if result.returncode != 0:
                print("⚠️  No crontab found")
                return False
            
            current_crontab = result.stdout
            
            # 無効化されたtoorPIA エントリを有効化
            lines = current_crontab.split('\n')
            updated_lines = []
            
            for line in lines:
                # コメントアウトされたtoorPIA cronエントリを検出
                if line.strip().startswith('# ') and 'TOORPIA_MODE=' in line:
                    # コメントアウトを解除
                    updated_lines.append(line[2:])  # '# ' を削除
                else:
                    updated_lines.append(line)
            
            updated_crontab = '\n'.join(updated_lines)
            return self._apply_crontab(updated_crontab)
            
        except Exception as e:
            print(f"❌ Enable schedules failed: {e}")
            return False
    
    def disable_schedules(self) -> bool:
        """スケジュールを無効化（コメントアウト）"""
        try:
            print("⏸️  Disabling toorPIA schedules")
            
            result = subprocess.run(['crontab', '-l'], 
                                  capture_output=True, text=True)
            
            if result.returncode != 0:
                print("⚠️  No crontab found")
                return False
            
            current_crontab = result.stdout
            
            # toorPIA cronエントリをコメントアウト
            lines = current_crontab.split('\n')
            updated_lines = []
            
            for line in lines:
                if 'TOORPIA_MODE=' in line and not line.strip().startswith('#'):
                    # cronエントリをコメントアウト
                    updated_lines.append('# ' + line)
                else:
                    updated_lines.append(line)
            
            updated_crontab = '\n'.join(updated_lines)
            return self._apply_crontab(updated_crontab)
            
        except Exception as e:
            print(f"❌ Disable schedules failed: {e}")
            return False
    
    def _generate_cron_entries(self, config_path: str) -> List[str]:
        """設定ファイルからcronエントリを生成（新しい設定構造に対応）"""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            
            toorpia_config = config.get('toorpia_integration', {})
            if not toorpia_config.get('enabled', False):
                return []
            
            basemap_config = config.get('basemap', {})
            equipment_name = self._extract_equipment_name(config_path)
            
            entries = []
            
            # basemap更新スケジュール
            update_config = basemap_config.get('update', {})
            update_type = update_config.get('type', 'periodic')
            
            if update_type == 'periodic':
                schedule_config = update_config.get('schedule', {})
                cron_expr = self._schedule_to_cron(schedule_config)
                if cron_expr:
                    comment = f"{self.cron_comment_prefix} basemap update ({equipment_name})"
                    command = self._build_command('basemap_update', config_path)
                    entries.extend([comment, f"{cron_expr} {command}"])
            
            # addplot更新スケジュール
            addplot_config = basemap_config.get('addplot', {})
            addplot_interval = addplot_config.get('interval', '10m')
            addplot_cron = self._interval_to_cron(addplot_interval, 'addplot')
            if addplot_cron:
                comment = f"{self.cron_comment_prefix} addplot update ({equipment_name})"
                command = self._build_command('addplot_update', config_path)
                entries.extend([comment, f"{addplot_cron} {command}"])
            
            return entries
            
        except Exception as e:
            print(f"❌ Failed to generate cron entries for {config_path}: {e}")
            return []
    
    def _schedule_to_cron(self, schedule_config: Dict[str, Any]) -> Optional[str]:
        """新しいschedule設定をcron式に変換"""
        try:
            interval = schedule_config.get('interval', 'weekly')
            time = schedule_config.get('time', '02:00')
            weekday = schedule_config.get('weekday', 'sunday')
            
            # 時刻の解析
            hour, minute = self._parse_time(time)
            
            if interval == 'daily':
                return f"{minute} {hour} * * *"
            
            elif interval == 'weekly':
                weekday_num = self._weekday_to_num(weekday)
                return f"{minute} {hour} * * {weekday_num}"
            
            elif interval == 'monthly':
                # 毎月1日に実行
                return f"{minute} {hour} 1 * *"
            
            elif interval.endswith('D') or interval.endswith('d'):
                # "7D" 形式
                days = int(interval[:-1])
                if days == 1:
                    return f"{minute} {hour} * * *"  # 毎日
                elif days == 7:
                    return f"{minute} {hour} * * 0"  # 毎週日曜
                else:
                    return f"{minute} {hour} */{days} * *"
            
            elif interval.endswith('H') or interval.endswith('h'):
                # "6H" 形式
                hours = int(interval[:-1])
                if hours < 24:
                    return f"0 */{hours} * * *"
                else:
                    days = hours // 24
                    return f"{minute} {hour} */{days} * *"
            
            else:
                print(f"❌ Unknown interval format: {interval}")
                return None
                
        except Exception as e:
            print(f"❌ Failed to parse schedule config: {e}")
            return None
    
    def _parse_time(self, time_str: str) -> tuple:
        """時刻文字列を解析 (HH:MM)"""
        try:
            parts = time_str.split(':')
            if len(parts) == 2:
                hour = int(parts[0])
                minute = int(parts[1])
                if 0 <= hour <= 23 and 0 <= minute <= 59:
                    return hour, minute
            
            # デフォルト: 2:00
            print(f"⚠️  Invalid time format '{time_str}', using default 02:00")
            return 2, 0
            
        except ValueError:
            print(f"⚠️  Invalid time format '{time_str}', using default 02:00")
            return 2, 0
    
    def _weekday_to_num(self, weekday: str) -> int:
        """曜日名を数値に変換 (0=日曜, 1=月曜, ...)"""
        weekday_map = {
            'sunday': 0, 'sun': 0,
            'monday': 1, 'mon': 1,
            'tuesday': 2, 'tue': 2,
            'wednesday': 3, 'wed': 3,
            'thursday': 4, 'thu': 4,
            'friday': 5, 'fri': 5,
            'saturday': 6, 'sat': 6
        }
        
        return weekday_map.get(weekday.lower(), 0)  # デフォルト: 日曜
    
    def _interval_to_cron(self, interval: str, mode: str) -> Optional[str]:
        """間隔指定をcron式に変換"""
        try:
            # 間隔の解析
            if interval.endswith('m'):
                minutes = int(interval[:-1])
                if minutes < 60:
                    return f"*/{minutes} * * * *"
                else:
                    # 60分以上は時間単位に変換
                    hours = minutes // 60
                    return f"0 */{hours} * * *"
            
            elif interval.endswith('H') or interval.endswith('h'):
                hours = int(interval[:-1])
                if hours < 24:
                    return f"0 */{hours} * * *"
                else:
                    # 24時間以上は日単位に変換
                    days = hours // 24
                    return f"0 0 */{days} * *"
            
            elif interval.endswith('D') or interval.endswith('d'):
                days = int(interval[:-1])
                
                # basemapの場合は実行時刻を調整
                if mode == 'basemap':
                    # 深夜2時に実行（システム負荷を考慮）
                    if days == 1:
                        return "0 2 * * *"  # 毎日2時
                    elif days == 7:
                        return "0 2 * * 0"  # 毎週日曜2時
                    else:
                        return f"0 2 */{days} * *"
                else:
                    # addplotの場合は通常の日次
                    return f"0 0 */{days} * *"
            
            else:
                # 数値のみの場合は分として扱う
                minutes = int(interval)
                if minutes < 60:
                    return f"*/{minutes} * * * *"
                else:
                    hours = minutes // 60
                    return f"0 */{hours} * * *"
                    
        except ValueError:
            print(f"❌ Invalid interval format: {interval}")
            return None
    
    def _build_command(self, mode: str, config_path: str) -> str:
        """プラグイン実行コマンドを構築"""
        return (f"cd {self.project_root} && "
                f"TOORPIA_MODE={mode} "
                f"python3 plugins/run_plugin.py run "
                f"--type {self.plugin_type} "
                f"--name {self.plugin_name} "
                f"--config {config_path} "
                f"--mode {mode} "
                f">> logs/toorpia_scheduler.log 2>&1")
    
    def _extract_equipment_name(self, config_path: str) -> str:
        """設定ファイルパスから設備名を抽出"""
        return os.path.basename(os.path.dirname(config_path))
    
    def _backup_crontab(self) -> bool:
        """現在のcrontabをバックアップ"""
        try:
            backup_dir = os.path.join(self.project_root, "logs", "crontab_backups")
            os.makedirs(backup_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = os.path.join(backup_dir, f"crontab_backup_{timestamp}.txt")
            
            result = subprocess.run(['crontab', '-l'], 
                                  capture_output=True, text=True)
            
            if result.returncode == 0:
                with open(backup_file, 'w') as f:
                    f.write(result.stdout)
                print(f"📋 Crontab backed up to: {backup_file}")
                return True
            else:
                print("⚠️  No existing crontab to backup")
                return True
                
        except Exception as e:
            print(f"❌ Backup failed: {e}")
            return False
    
    def _update_crontab(self, entries: List[str]) -> bool:
        """crontabを完全更新"""
        try:
            # 現在のcrontabを取得
            result = subprocess.run(['crontab', '-l'], 
                                  capture_output=True, text=True)
            
            if result.returncode == 0:
                current_crontab = result.stdout
            else:
                current_crontab = ""
            
            # 既存のtoorPIA エントリを削除
            filtered_lines = []
            lines = current_crontab.split('\n')
            
            i = 0
            while i < len(lines):
                line = lines[i]
                if line.strip().startswith(self.cron_comment_prefix):
                    i += 2  # コメント行 + cron行をスキップ
                else:
                    filtered_lines.append(line)
                    i += 1
            
            # 新しいエントリを追加
            updated_crontab = '\n'.join(filtered_lines).rstrip('\n') + '\n\n'
            for entry in entries:
                updated_crontab += entry + '\n'
            
            return self._apply_crontab(updated_crontab)
            
        except Exception as e:
            print(f"❌ Update crontab failed: {e}")
            return False
    
    def _apply_crontab(self, crontab_content: str) -> bool:
        """crontabを適用"""
        try:
            # 一時ファイルに書き込み
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.cron') as temp_file:
                temp_file.write(crontab_content)
                temp_file_path = temp_file.name
            
            # crontabを適用
            result = subprocess.run(['crontab', temp_file_path], 
                                  capture_output=True, text=True)
            
            # 一時ファイルを削除
            os.unlink(temp_file_path)
            
            if result.returncode == 0:
                print("✅ Crontab updated successfully")
                return True
            else:
                print(f"❌ Failed to update crontab: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Apply crontab failed: {e}")
            return False
    
    def _has_equipment_entries(self, crontab_content: str, equipment_name: str) -> bool:
        """指定設備のエントリが既に存在するかチェック"""
        return f"({equipment_name})" in crontab_content
    
    def _parse_cron_entry(self, cron_line: str) -> Dict[str, Any]:
        """cronエントリを解析"""
        try:
            parts = cron_line.split()
            if len(parts) >= 5:
                return {
                    "minute": parts[0],
                    "hour": parts[1], 
                    "day": parts[2],
                    "month": parts[3],
                    "weekday": parts[4],
                    "command": ' '.join(parts[5:])
                }
        except:
            pass
        
        return {"raw": cron_line}
    
    def _get_crontab_mtime(self) -> Optional[str]:
        """crontabの最終更新時刻を取得"""
        try:
            # システム依存だが、一般的な場所をチェック
            crontab_paths = [
                f"/var/spool/cron/crontabs/{os.getenv('USER', 'root')}",
                f"/var/spool/cron/{os.getenv('USER', 'root')}",
            ]
            
            for path in crontab_paths:
                if os.path.exists(path):
                    mtime = os.path.getmtime(path)
                    return datetime.fromtimestamp(mtime).isoformat()
            
            return None
        except:
            return None


# エイリアス（後方互換性）
PluginScheduler = ToorpiaBackendScheduler
