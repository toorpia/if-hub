#!/usr/bin/env python3
"""
IF-HUB Plugin Schedule Manager
プラグインのスケジュール機能管理ツール
"""

import os
import sys
import argparse
import json
import yaml
from typing import Dict, Any, Optional, List
from datetime import datetime
import importlib.util

class PluginScheduleManager:
    """プラグインスケジュール管理"""
    
    def __init__(self, plugin_root: str = None):
        self.plugin_root = plugin_root or os.path.join(os.path.dirname(__file__))
        self.supported_types = ['analyzer', 'notifier', 'presenter']
        
    def load_plugin_scheduler(self, plugin_type: str, plugin_name: str):
        """プラグインのスケジューラークラスをロード"""
        try:
            # プラグインディレクトリパス
            plugin_dir = os.path.join(self.plugin_root, f"{plugin_type}s", plugin_name)
            scheduler_path = os.path.join(plugin_dir, "scheduler.py")
            
            if not os.path.exists(scheduler_path):
                raise FileNotFoundError(f"Scheduler module not found: {scheduler_path}")
            
            # 動的インポート
            spec = importlib.util.spec_from_file_location(f"{plugin_name}_scheduler", scheduler_path)
            scheduler_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(scheduler_module)
            
            # スケジューラークラスを取得
            scheduler_class = getattr(scheduler_module, f"{plugin_name.replace('_', '').title()}Scheduler", None)
            if not scheduler_class:
                # フォールバック: 一般的な名前
                scheduler_class = getattr(scheduler_module, "PluginScheduler", None)
            
            if not scheduler_class:
                raise AttributeError(f"Scheduler class not found in {scheduler_path}")
            
            return scheduler_class()
            
        except Exception as e:
            print(f"❌ Failed to load scheduler for {plugin_type}/{plugin_name}: {e}")
            return None
    
    def list_available_plugins(self) -> Dict[str, List[str]]:
        """利用可能なプラグイン一覧を取得"""
        available = {}
        
        for plugin_type in self.supported_types:
            type_dir = os.path.join(self.plugin_root, f"{plugin_type}s")
            available[plugin_type] = []
            
            if os.path.exists(type_dir):
                for item in os.listdir(type_dir):
                    plugin_path = os.path.join(type_dir, item)
                    if os.path.isdir(plugin_path):
                        # scheduler.py が存在するかチェック
                        scheduler_path = os.path.join(plugin_path, "scheduler.py")
                        if os.path.exists(scheduler_path):
                            available[plugin_type].append(item)
        
        return available
    
    def find_config_files(self, plugin_type: str = None, plugin_name: str = None) -> List[str]:
        """設定ファイルを検索"""
        config_files = []
        config_root = os.path.join(os.path.dirname(self.plugin_root), "configs", "equipments")
        
        if not os.path.exists(config_root):
            return config_files
        
        for equipment_dir in os.listdir(config_root):
            config_path = os.path.join(config_root, equipment_dir, "config.yaml")
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r', encoding='utf-8') as f:
                        config = yaml.safe_load(f)
                    
                    # プラグイン関連設定があるかチェック
                    if plugin_type == 'analyzer' and plugin_name == 'toorpia_backend':
                        if config.get('toorpia_integration', {}).get('enabled', False):
                            config_files.append(config_path)
                    else:
                        # 他のプラグインタイプの場合の判定ロジック
                        config_files.append(config_path)
                        
                except Exception as e:
                    print(f"⚠️  Failed to parse config {config_path}: {e}")
        
        return config_files
    
    def setup_schedules(self, plugin_type: str, plugin_name: str, configs: List[str] = None) -> bool:
        """スケジュール初期セットアップ"""
        print(f"🔧 Setting up schedules for {plugin_type}/{plugin_name}")
        
        # プラグインスケジューラーをロード
        scheduler = self.load_plugin_scheduler(plugin_type, plugin_name)
        if not scheduler:
            return False
        
        # 設定ファイルを取得
        if not configs:
            configs = self.find_config_files(plugin_type, plugin_name)
        
        if not configs:
            print(f"⚠️  No valid configuration files found for {plugin_type}/{plugin_name}")
            return False
        
        print(f"📄 Found {len(configs)} configuration file(s)")
        for config in configs:
            print(f"  - {config}")
        
        # スケジューラーのセットアップを実行
        try:
            result = scheduler.setup_schedules(configs)
            if result:
                print(f"✅ Successfully set up schedules for {plugin_type}/{plugin_name}")
            else:
                print(f"❌ Failed to set up schedules for {plugin_type}/{plugin_name}")
            return result
        except Exception as e:
            print(f"❌ Setup failed: {e}")
            return False
    
    def show_status(self, plugin_type: str, plugin_name: str) -> bool:
        """スケジュール状況表示"""
        print(f"📊 Schedule status for {plugin_type}/{plugin_name}")
        
        scheduler = self.load_plugin_scheduler(plugin_type, plugin_name)
        if not scheduler:
            return False
        
        try:
            status = scheduler.get_schedule_status()
            
            if isinstance(status, dict):
                print(json.dumps(status, indent=2, ensure_ascii=False))
            else:
                print(status)
            
            return True
        except Exception as e:
            print(f"❌ Failed to get status: {e}")
            return False
    
    def add_equipment(self, config_path: str) -> bool:
        """新規設備のスケジュール追加"""
        print(f"➕ Adding schedule for equipment: {config_path}")
        
        if not os.path.exists(config_path):
            print(f"❌ Config file not found: {config_path}")
            return False
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
        except Exception as e:
            print(f"❌ Failed to parse config: {e}")
            return False
        
        # プラグインタイプを判定
        plugin_type = None
        plugin_name = None
        
        if config.get('toorpia_integration', {}).get('enabled', False):
            plugin_type = 'analyzer'
            plugin_name = 'toorpia_backend'
        
        if not plugin_type or not plugin_name:
            print(f"⚠️  No supported plugin configuration found in {config_path}")
            return False
        
        scheduler = self.load_plugin_scheduler(plugin_type, plugin_name)
        if not scheduler:
            return False
        
        try:
            result = scheduler.add_equipment_schedule(config_path)
            if result:
                print(f"✅ Successfully added schedule for {config_path}")
            else:
                print(f"❌ Failed to add schedule for {config_path}")
            return result
        except Exception as e:
            print(f"❌ Add failed: {e}")
            return False
    
    def remove_schedules(self, plugin_type: str, plugin_name: str) -> bool:
        """スケジュール削除"""
        print(f"🗑️  Removing schedules for {plugin_type}/{plugin_name}")
        
        scheduler = self.load_plugin_scheduler(plugin_type, plugin_name)
        if not scheduler:
            return False
        
        try:
            result = scheduler.remove_schedules()
            if result:
                print(f"✅ Successfully removed schedules for {plugin_type}/{plugin_name}")
            else:
                print(f"❌ Failed to remove schedules for {plugin_type}/{plugin_name}")
            return result
        except Exception as e:
            print(f"❌ Remove failed: {e}")
            return False
    
    def enable_schedules(self, plugin_type: str, plugin_name: str) -> bool:
        """スケジュール有効化"""
        print(f"▶️  Enabling schedules for {plugin_type}/{plugin_name}")
        
        scheduler = self.load_plugin_scheduler(plugin_type, plugin_name)
        if not scheduler:
            return False
        
        try:
            result = scheduler.enable_schedules()
            if result:
                print(f"✅ Successfully enabled schedules for {plugin_type}/{plugin_name}")
            else:
                print(f"❌ Failed to enable schedules for {plugin_type}/{plugin_name}")
            return result
        except Exception as e:
            print(f"❌ Enable failed: {e}")
            return False
    
    def disable_schedules(self, plugin_type: str, plugin_name: str) -> bool:
        """スケジュール無効化"""
        print(f"⏸️  Disabling schedules for {plugin_type}/{plugin_name}")
        
        scheduler = self.load_plugin_scheduler(plugin_type, plugin_name)
        if not scheduler:
            return False
        
        try:
            result = scheduler.disable_schedules()
            if result:
                print(f"✅ Successfully disabled schedules for {plugin_type}/{plugin_name}")
            else:
                print(f"❌ Failed to disable schedules for {plugin_type}/{plugin_name}")
            return result
        except Exception as e:
            print(f"❌ Disable failed: {e}")
            return False


def main():
    """メイン処理"""
    parser = argparse.ArgumentParser(
        description='IF-HUB Plugin Schedule Manager',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Setup schedules for toorpia_backend
  python3 schedule_plugin.py --setup --type analyzer --name toorpia_backend
  
  # Check status
  python3 schedule_plugin.py --status --type analyzer --name toorpia_backend
  
  # Add new equipment
  python3 schedule_plugin.py --add --config configs/equipments/new-eq/config.yaml
  
  # List available plugins
  python3 schedule_plugin.py --list
        """
    )
    
    # メインアクション
    action_group = parser.add_mutually_exclusive_group(required=True)
    action_group.add_argument('--setup', action='store_true', help='Setup schedules')
    action_group.add_argument('--status', action='store_true', help='Show schedule status')
    action_group.add_argument('--add', action='store_true', help='Add equipment schedule')
    action_group.add_argument('--remove', action='store_true', help='Remove schedules')
    action_group.add_argument('--enable', action='store_true', help='Enable schedules')
    action_group.add_argument('--disable', action='store_true', help='Disable schedules')
    action_group.add_argument('--list', action='store_true', help='List available plugins')
    
    # プラグイン指定
    parser.add_argument('--type', choices=['analyzer', 'notifier', 'presenter'], 
                       help='Plugin type')
    parser.add_argument('--name', help='Plugin name')
    parser.add_argument('--config', help='Configuration file path (for --add)')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without applying')
    
    args = parser.parse_args()
    
    # 引数バリデーション
    if args.list:
        manager = PluginScheduleManager()
        available = manager.list_available_plugins()
        
        print("📋 Available plugins with schedule support:")
        for plugin_type, plugins in available.items():
            if plugins:
                print(f"\n{plugin_type}s:")
                for plugin in plugins:
                    print(f"  - {plugin}")
            else:
                print(f"\n{plugin_type}s: None")
        return 0
    
    if args.add and not args.config:
        parser.error("--add requires --config")
    
    if not args.add and (args.type is None or args.name is None):
        parser.error("--type and --name are required (except for --add and --list)")
    
    # プラグインスケジュールマネージャー初期化
    manager = PluginScheduleManager()
    
    # アクション実行
    success = False
    
    try:
        if args.setup:
            success = manager.setup_schedules(args.type, args.name)
        elif args.status:
            success = manager.show_status(args.type, args.name)
        elif args.add:
            success = manager.add_equipment(args.config)
        elif args.remove:
            success = manager.remove_schedules(args.type, args.name)
        elif args.enable:
            success = manager.enable_schedules(args.type, args.name)
        elif args.disable:
            success = manager.disable_schedules(args.type, args.name)
    
    except KeyboardInterrupt:
        print("\n🛑 Operation cancelled by user")
        return 1
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return 1
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
