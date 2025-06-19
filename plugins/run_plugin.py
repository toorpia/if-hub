#!/usr/bin/env python3
"""
IF-HUB 統一プラグイン実行システム
"""

import sys
import os
import argparse
import importlib
import json
from typing import Dict, Any, Optional
from pathlib import Path

# プラグインディレクトリをPythonパスに追加
plugin_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(plugin_dir)
sys.path.insert(0, project_root)

# プラグインタイプマッピング
PLUGIN_TYPES = {
    'analyzer': 'analyzers',
    'notifier': 'notifiers',
    'presenter': 'presenters'
}

def load_plugin(plugin_type: str, plugin_name: str):
    """
    プラグイン動的読み込み
    
    Args:
        plugin_type: プラグインタイプ (analyzer, notifier, presenter)
        plugin_name: プラグイン名
    
    Returns:
        プラグインのrun関数
    """
    if plugin_type not in PLUGIN_TYPES:
        raise ValueError(f"Unknown plugin type: {plugin_type}")
    
    # プラグインモジュール動的読み込み
    module_path = f"plugins.{PLUGIN_TYPES[plugin_type]}.{plugin_name}.run"
    
    try:
        module = importlib.import_module(module_path)
        return module.run
    except ImportError as e:
        raise ImportError(f"Failed to load plugin {plugin_type}/{plugin_name}: {e}")

def load_plugin_meta(plugin_type: str, plugin_name: str) -> Optional[Dict[str, Any]]:
    """
    プラグインメタデータ読み込み
    
    Args:
        plugin_type: プラグインタイプ
        plugin_name: プラグイン名
    
    Returns:
        メタデータ辞書
    """
    if plugin_type not in PLUGIN_TYPES:
        return None
    
    meta_path = Path(f"plugins/{PLUGIN_TYPES[plugin_type]}/{plugin_name}/plugin_meta.yaml")
    
    if not meta_path.exists():
        return None
    
    try:
        import yaml
        with open(meta_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"Warning: Failed to load plugin metadata: {e}")
        return None

def validate_plugin_requirements(plugin_type: str, plugin_name: str) -> bool:
    """
    プラグイン要件バリデーション
    
    Args:
        plugin_type: プラグインタイプ
        plugin_name: プラグイン名
    
    Returns:
        バリデーション結果
    """
    meta = load_plugin_meta(plugin_type, plugin_name)
    if not meta:
        return True  # メタデータがない場合はスキップ
    
    # オフラインモードの場合は仮想環境での実行を前提とし、
    # システムレベルでの依存関係チェックをスキップ
    venv_info = meta.get('venv_requirements', {})
    if venv_info.get('offline_mode', False):
        # 仮想環境の存在確認のみ実施
        if 'venv_path' in venv_info:
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            venv_path = os.path.join(project_root, "plugins", venv_info["venv_path"])
            python_exe = os.path.join(venv_path, "bin", "python")
            
            if os.path.isfile(python_exe) and os.access(python_exe, os.X_OK):
                return True  # 仮想環境があれば依存関係はOKとみなす
            else:
                print(f"Virtual environment not found: {venv_path}")
                return False
        return True
    
    requirements = meta.get('requirements', {})
    
    # Python バージョンチェック
    python_version = requirements.get('system', {}).get('python_version')
    if python_version:
        import sys
        current_major = sys.version_info.major
        current_minor = sys.version_info.minor
        
        # 簡易バージョン比較（数値比較で正確に）
        if python_version.startswith('>='):
            required_version = python_version[2:]
            try:
                req_major, req_minor = map(int, required_version.split('.'))
                if (current_major, current_minor) < (req_major, req_minor):
                    print(f"Python version {current_major}.{current_minor} < required {req_major}.{req_minor}")
                    return False
            except ValueError:
                print(f"Invalid version format: {required_version}")
                return False
    
    # 依存関係チェック（簡易実装）
    dependencies = requirements.get('dependencies', [])
    for dep in dependencies:
        package_name = dep.split('>=')[0].split('==')[0]
        try:
            importlib.import_module(package_name)
        except ImportError:
            print(f"Missing dependency: {package_name}")
            return False
    
    return True

def get_python_executable(plugin_type: str, plugin_name: str) -> str:
    """
    プラグイン用Python実行ファイルパス取得（仮想環境優先）
    
    Args:
        plugin_type: プラグインタイプ
        plugin_name: プラグイン名
    
    Returns:
        Python実行ファイルパス
    """
    # プラグインメタデータから仮想環境情報取得
    meta = load_plugin_meta(plugin_type, plugin_name)
    
    if meta and "venv_requirements" in meta:
        venv_info = meta["venv_requirements"]
        
        # オフラインモードかつvenv_pathが指定されている場合
        if venv_info.get("offline_mode", False) and "venv_path" in venv_info:
            # プロジェクトルートからの相対パス
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            venv_path = os.path.join(project_root, "plugins", venv_info["venv_path"])
            python_exe = os.path.join(venv_path, "bin", "python")
            
            # 仮想環境のPythonが存在するかチェック
            if os.path.isfile(python_exe) and os.access(python_exe, os.X_OK):
                return python_exe
    
    # フォールバック: システムのpython3
    return "python3"

def run_plugin(plugin_type: str, plugin_name: str, config_path: str, **kwargs) -> Dict[str, Any]:
    """
    プラグイン実行（仮想環境自動選択対応）
    
    Args:
        plugin_type: プラグインタイプ
        plugin_name: プラグイン名
        config_path: 設定ファイルパス
        **kwargs: 追加オプション
    
    Returns:
        実行結果
    """
    try:
        # プラグイン要件バリデーション
        if not validate_plugin_requirements(plugin_type, plugin_name):
            return {
                "status": "error",
                "error": {
                    "code": "REQUIREMENTS_NOT_MET",
                    "message": "Plugin requirements validation failed"
                }
            }
        
        # Python実行ファイル取得（仮想環境優先）
        python_exe = get_python_executable(plugin_type, plugin_name)
        
        # オフライン環境での直接Python実行
        meta = load_plugin_meta(plugin_type, plugin_name)
        if meta and meta.get("venv_requirements", {}).get("offline_mode", False):
            # 仮想環境でプラグインを直接実行
            result = run_plugin_with_venv(plugin_type, plugin_name, config_path, python_exe, **kwargs)
        else:
            # 通常のプラグイン読み込み実行
            plugin_run = load_plugin(plugin_type, plugin_name)
            result = plugin_run(config_path, **kwargs)
        
        return result
        
    except Exception as e:
        return {
            "status": "error",
            "error": {
                "code": "PLUGIN_EXECUTION_FAILED",
                "message": str(e)
            }
        }

def run_plugin_with_venv(plugin_type: str, plugin_name: str, config_path: str, python_exe: str, **kwargs) -> Dict[str, Any]:
    """
    仮想環境でプラグインを直接実行
    
    Args:
        plugin_type: プラグインタイプ
        plugin_name: プラグイン名
        config_path: 設定ファイルパス
        python_exe: 使用するPython実行ファイル
        **kwargs: 追加オプション
    
    Returns:
        実行結果
    """
    import subprocess
    import json
    
    # プラグインrun.pyのパス
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    plugin_run_script = os.path.join(project_root, "plugins", PLUGIN_TYPES[plugin_type], plugin_name, "run.py")
    
    if not os.path.isfile(plugin_run_script):
        return {
            "status": "error",
            "error": {
                "code": "PLUGIN_SCRIPT_NOT_FOUND",
                "message": f"Plugin run script not found: {plugin_run_script}"
            }
        }
    
    # 実行コマンド構築
    cmd = [python_exe, plugin_run_script, config_path]
    
    # オプション追加
    if kwargs.get("mode"):
        cmd.extend(["--mode", kwargs["mode"]])
    if kwargs.get("verbose"):
        cmd.append("--verbose")
    
    try:
        # プラグイン実行
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        # JSON結果をパース
        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {
                    "status": "success",
                    "message": "Plugin executed successfully",
                    "output": result.stdout
                }
        else:
            return {
                "status": "error",
                "error": {
                    "code": "PLUGIN_EXECUTION_FAILED",
                    "message": f"Plugin execution failed (exit code: {result.returncode})",
                    "stderr": result.stderr,
                    "stdout": result.stdout
                }
            }
    
    except subprocess.TimeoutExpired:
        return {
            "status": "error",
            "error": {
                "code": "PLUGIN_TIMEOUT",
                "message": "Plugin execution timed out (300s)"
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": {
                "code": "SUBPROCESS_FAILED",
                "message": str(e)
            }
        }

def list_available_plugins() -> Dict[str, Dict[str, Any]]:
    """
    利用可能プラグイン一覧取得
    
    Returns:
        プラグイン一覧辞書
    """
    plugins = {}
    
    for plugin_type, type_dir in PLUGIN_TYPES.items():
        plugins[plugin_type] = {}
        type_path = Path(f"plugins/{type_dir}")
        
        if type_path.exists():
            for plugin_dir in type_path.iterdir():
                if plugin_dir.is_dir() and not plugin_dir.name.startswith('_'):
                    plugin_name = plugin_dir.name
                    meta = load_plugin_meta(plugin_type, plugin_name)
                    
                    plugins[plugin_type][plugin_name] = {
                        "path": str(plugin_dir),
                        "metadata": meta,
                        "available": (plugin_dir / "run.py").exists()
                    }
    
    return plugins

def main():
    """コマンドライン実行エントリーポイント"""
    parser = argparse.ArgumentParser(description='IF-HUB Plugin Runner')
    
    # サブコマンド
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # run サブコマンド
    run_parser = subparsers.add_parser('run', help='Run plugin')
    run_parser.add_argument('--type', required=True, choices=list(PLUGIN_TYPES.keys()),
                           help='Plugin type')
    run_parser.add_argument('--name', required=True, help='Plugin name')
    run_parser.add_argument('--config', required=True, help='Configuration file path')
    run_parser.add_argument('--mode', help='Execution mode')
    run_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    # list サブコマンド
    list_parser = subparsers.add_parser('list', help='List available plugins')
    list_parser.add_argument('--type', choices=list(PLUGIN_TYPES.keys()),
                            help='Filter by plugin type')
    
    # validate サブコマンド
    validate_parser = subparsers.add_parser('validate', help='Validate plugin configuration')
    validate_parser.add_argument('--type', required=True, choices=list(PLUGIN_TYPES.keys()),
                                help='Plugin type')
    validate_parser.add_argument('--name', required=True, help='Plugin name')
    validate_parser.add_argument('--config', required=True, help='Configuration file path')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    if args.command == 'run':
        # プラグイン実行
        kwargs = {}
        if args.mode:
            kwargs['mode'] = args.mode
        if args.verbose:
            kwargs['verbose'] = True
        
        result = run_plugin(args.type, args.name, args.config, **kwargs)
        
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0 if result.get('status') == 'success' else 1)
    
    elif args.command == 'list':
        # プラグイン一覧表示
        plugins = list_available_plugins()
        
        if args.type:
            plugins = {args.type: plugins.get(args.type, {})}
        
        print(json.dumps(plugins, indent=2, ensure_ascii=False))
        sys.exit(0)
    
    elif args.command == 'validate':
        # 設定バリデーション
        try:
            # プラグイン読み込み
            module_path = f"plugins.{PLUGIN_TYPES[args.type]}.{args.name}.run"
            module = importlib.import_module(module_path)
            
            if hasattr(module, 'validate_config'):
                is_valid = module.validate_config(args.config)
                print(f"Config validation: {'PASSED' if is_valid else 'FAILED'}")
                sys.exit(0 if is_valid else 1)
            else:
                print("Plugin does not support config validation")
                sys.exit(1)
        
        except Exception as e:
            print(f"Validation failed: {e}")
            sys.exit(1)

# 後方互換性のための直接実行サポート
def direct_run():
    """
    後方互換性のための直接実行関数
    python plugins/run_plugin.py --type analyzer --name toorpia_backend --config ... の形式をサポート
    """
    parser = argparse.ArgumentParser(description='IF-HUB Plugin Runner (Direct Mode)')
    parser.add_argument('--type', required=True, choices=list(PLUGIN_TYPES.keys()),
                       help='Plugin type')
    parser.add_argument('--name', required=True, help='Plugin name')
    parser.add_argument('--config', required=True, help='Configuration file path')
    parser.add_argument('--mode', help='Execution mode')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    kwargs = {}
    if args.mode:
        kwargs['mode'] = args.mode
    if args.verbose:
        kwargs['verbose'] = True
    
    result = run_plugin(args.type, args.name, args.config, **kwargs)
    
    print(json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result.get('status') == 'success' else 1)

if __name__ == '__main__':
    # コマンドライン引数をチェックして適切な関数を呼び出し
    if len(sys.argv) > 1 and sys.argv[1] in ['run', 'list', 'validate']:
        main()
    else:
        direct_run()
