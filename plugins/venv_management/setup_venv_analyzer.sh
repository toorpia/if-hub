#!/bin/bash
# IF-Hub Analyzer Plugin 仮想環境構築スクリプト
# Ubuntu 22.04 LTS環境用（オフライン配布対応）

set -e

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$PLUGINS_ROOT")"

# 使用方法表示
show_usage() {
    echo "使用方法: $0 <analyzer_name> [options]"
    echo ""
    echo "Arguments:"
    echo "  analyzer_name    Analyzerプラグイン名 (例: toorpia_backend)"
    echo ""
    echo "Options:"
    echo "  --force         既存の仮想環境を強制削除して再作成"
    echo "  --requirements  カスタムrequirementsファイルを指定"
    echo "  --python        Pythonバイナリを指定 (デフォルト: python3)"
    echo "  --help          このヘルプを表示"
    echo ""
    echo "例:"
    echo "  $0 toorpia_backend"
    echo "  $0 toorpia_backend --force"
    echo "  $0 ngboost --requirements ./custom_requirements.txt"
}

# 引数解析
ANALYZER_NAME=""
FORCE_RECREATE=false
CUSTOM_REQUIREMENTS=""
PYTHON_BINARY="python3"

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_RECREATE=true
            shift
            ;;
        --requirements)
            CUSTOM_REQUIREMENTS="$2"
            shift 2
            ;;
        --python)
            PYTHON_BINARY="$2"
            shift 2
            ;;
        --help)
            show_usage
            exit 0
            ;;
        -*)
            echo "エラー: 不明なオプション $1"
            show_usage
            exit 1
            ;;
        *)
            if [ -z "$ANALYZER_NAME" ]; then
                ANALYZER_NAME="$1"
            else
                echo "エラー: 複数のanalyzer名が指定されました"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# 必須引数チェック
if [ -z "$ANALYZER_NAME" ]; then
    echo "エラー: analyzer名が指定されていません"
    show_usage
    exit 1
fi

# パス設定
VENV_DIR="$PLUGINS_ROOT/venvs/analyzers/$ANALYZER_NAME"
REQUIREMENTS_FILE="$SCRIPT_DIR/requirements/analyzers/${ANALYZER_NAME}_requirements.txt"

# カスタムrequirements指定時
if [ -n "$CUSTOM_REQUIREMENTS" ]; then
    REQUIREMENTS_FILE="$CUSTOM_REQUIREMENTS"
fi

echo "========================================================"
echo "🚀 IF-Hub Analyzer仮想環境構築: $ANALYZER_NAME"
echo "========================================================"
echo "Python Binary: $PYTHON_BINARY"
echo "仮想環境Path: $VENV_DIR"
echo "Requirements: $REQUIREMENTS_FILE"
echo ""

# Pythonバージョン確認
echo "🔍 Python環境確認..."
if ! command -v "$PYTHON_BINARY" &> /dev/null; then
    echo "❌ $PYTHON_BINARY が見つかりません"
    echo "   Ubuntu 22.04では 'sudo apt install python3 python3-venv python3-pip' でインストールしてください"
    exit 1
fi

PYTHON_VERSION=$($PYTHON_BINARY --version 2>&1 | cut -d' ' -f2)
echo "✅ Python $PYTHON_VERSION を使用"

# 最小バージョンチェック（3.8以上）
PYTHON_MAJOR_MINOR=$($PYTHON_BINARY -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if ! $PYTHON_BINARY -c "import sys; exit(0 if sys.version_info >= (3, 8) else 1)"; then
    echo "❌ Python 3.8以上が必要です (現在: $PYTHON_VERSION)"
    exit 1
fi

# Requirements ファイル確認
if [ ! -f "$REQUIREMENTS_FILE" ]; then
    echo "❌ Requirements ファイルが見つかりません: $REQUIREMENTS_FILE"
    exit 1
fi

echo "✅ Requirements ファイル確認完了: $(basename "$REQUIREMENTS_FILE")"

# 既存仮想環境チェック
if [ -d "$VENV_DIR" ]; then
    if [ "$FORCE_RECREATE" = true ]; then
        echo "🗑️  既存仮想環境を削除: $VENV_DIR"
        rm -rf "$VENV_DIR"
    else
        echo "⚠️  仮想環境が既に存在します: $VENV_DIR"
        echo "   --force オプションで再作成するか、別名を使用してください"
        exit 1
    fi
fi

# 仮想環境作成
echo ""
echo "📦 仮想環境を作成しています..."
if ! $PYTHON_BINARY -m venv "$VENV_DIR" --prompt "if-hub-$ANALYZER_NAME"; then
    echo "❌ 仮想環境の作成に失敗しました"
    echo "   python3-venv がインストールされていることを確認してください"
    exit 1
fi

echo "✅ 仮想環境作成完了"

# pip アップグレード
echo ""
echo "⬆️  pip をアップグレードしています..."
"$VENV_DIR/bin/python" -m pip install --upgrade pip

# 依存関係インストール
echo ""
echo "📦 依存関係をインストールしています..."
echo "   Requirements: $REQUIREMENTS_FILE"

if ! "$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_FILE"; then
    echo "❌ 依存関係のインストールに失敗しました"
    echo "   ネットワーク接続とrequirementsファイルの内容を確認してください"
    exit 1
fi

# インストール済みパッケージ一覧
echo ""
echo "📋 インストール済みパッケージ一覧:"
echo "============================================================"
"$VENV_DIR/bin/pip" list --format=table
echo "============================================================"

# Python最適化（.pycファイル事前生成）
echo ""
echo "⚡ Python バイトコード最適化を実行しています..."
"$VENV_DIR/bin/python" -m compileall "$VENV_DIR/lib/" -q

# 動作確認テスト
echo ""
echo "🔧 基本動作確認テスト..."

# 主要モジュールのimportテスト
echo "   requests import テスト..."
if ! "$VENV_DIR/bin/python" -c "import requests; print(f'requests {requests.__version__}')"; then
    echo "❌ requests のimportに失敗"
    exit 1
fi

echo "   pandas import テスト..."
if ! "$VENV_DIR/bin/python" -c "import pandas; print(f'pandas {pandas.__version__}')"; then
    echo "❌ pandas のimportに失敗"
    exit 1
fi

echo "   yaml import テスト..."
if ! "$VENV_DIR/bin/python" -c "import yaml; print(f'PyYAML (yaml)')"; then
    echo "❌ yaml のimportに失敗"
    exit 1
fi

# 仮想環境サイズ確認
VENV_SIZE=$(du -sh "$VENV_DIR" | cut -f1)
echo ""
echo "📊 仮想環境統計:"
echo "   パス: $VENV_DIR"
echo "   サイズ: $VENV_SIZE"
echo "   Python: $("$VENV_DIR/bin/python" --version)"

# アクティベーションスクリプト確認
if [ -f "$VENV_DIR/bin/activate" ]; then
    echo "   アクティベーション: source $VENV_DIR/bin/activate"
fi

echo ""
echo "🎉 仮想環境構築が完了しました！"
echo ""
echo "📋 使用方法:"
echo "   直接実行: $VENV_DIR/bin/python"
echo "   アクティベーション: source $VENV_DIR/bin/activate"
echo ""
echo "🔧 プラグイン実行例:"
echo "   $VENV_DIR/bin/python plugins/analyzers/$ANALYZER_NAME/run.py configs/equipments/7th-untan/config.yaml"
echo ""
echo "========================================================"
