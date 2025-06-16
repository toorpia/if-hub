#!/bin/bash
# IF-Hub プラグイン仮想環境配布パッケージ作成スクリプト
# オフライン環境配布用最適化版

set -e

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$PLUGINS_ROOT")"

# 使用方法表示
show_usage() {
    echo "使用方法: $0 <plugin_type> <plugin_name> [options]"
    echo ""
    echo "Arguments:"
    echo "  plugin_type     プラグインタイプ (analyzers, notifiers, presenters)"
    echo "  plugin_name     プラグイン名 (例: toorpia_backend)"
    echo ""
    echo "Options:"
    echo "  --output-dir    出力ディレクトリ (デフォルト: ./packages)"
    echo "  --no-cleanup    一時ファイルを削除しない（デバッグ用）"
    echo "  --no-optimize   バイトコード最適化をスキップ"
    echo "  --no-compress   圧縮せずディレクトリのまま出力"
    echo "  --verbose       詳細ログを表示"
    echo "  --help          このヘルプを表示"
    echo ""
    echo "例:"
    echo "  $0 analyzers toorpia_backend"
    echo "  $0 analyzers toorpia_backend --output-dir /tmp/packages"
    echo "  $0 notifiers slack --verbose"
}

# 引数解析
PLUGIN_TYPE=""
PLUGIN_NAME=""
OUTPUT_DIR="./packages"
NO_CLEANUP=false
NO_OPTIMIZE=false
NO_COMPRESS=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --no-cleanup)
            NO_CLEANUP=true
            shift
            ;;
        --no-optimize)
            NO_OPTIMIZE=true
            shift
            ;;
        --no-compress)
            NO_COMPRESS=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
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
            if [ -z "$PLUGIN_TYPE" ]; then
                PLUGIN_TYPE="$1"
            elif [ -z "$PLUGIN_NAME" ]; then
                PLUGIN_NAME="$1"
            else
                echo "エラー: 余分な引数 $1"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# 必須引数チェック
if [ -z "$PLUGIN_TYPE" ] || [ -z "$PLUGIN_NAME" ]; then
    echo "エラー: plugin_type と plugin_name が必要です"
    show_usage
    exit 1
fi

# サポートされているプラグインタイプチェック
if [[ ! "$PLUGIN_TYPE" =~ ^(analyzers|notifiers|presenters)$ ]]; then
    echo "エラー: サポートされていないプラグインタイプ: $PLUGIN_TYPE"
    echo "サポート対象: analyzers, notifiers, presenters"
    exit 1
fi

# パス設定
VENV_DIR="$PLUGINS_ROOT/venvs/$PLUGIN_TYPE/$PLUGIN_NAME"
PACKAGE_NAME="if-hub-plugin-${PLUGIN_TYPE%-s}-${PLUGIN_NAME}"
TEMP_DIR="/tmp/${PACKAGE_NAME}-$$"
FINAL_OUTPUT_DIR="$(realpath "$OUTPUT_DIR")"

# ログ関数
log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo "$1"
    fi
}

echo "========================================================"
echo "📦 IF-Hub プラグイン仮想環境パッケージ作成"
echo "========================================================"
echo "プラグイン: $PLUGIN_TYPE/$PLUGIN_NAME"
echo "仮想環境: $VENV_DIR"
echo "出力先: $FINAL_OUTPUT_DIR"
echo "パッケージ名: $PACKAGE_NAME"
echo ""

# 仮想環境存在確認
if [ ! -d "$VENV_DIR" ]; then
    echo "❌ 仮想環境が見つかりません: $VENV_DIR"
    echo "   先に setup_venv_analyzer.sh を実行してください"
    exit 1
fi

# Python実行ファイル確認
PYTHON_BIN="$VENV_DIR/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
    echo "❌ Python実行ファイルが見つかりません: $PYTHON_BIN"
    exit 1
fi

echo "✅ 仮想環境確認完了"

# 出力ディレクトリ作成
mkdir -p "$FINAL_OUTPUT_DIR"
echo "✅ 出力ディレクトリ作成: $FINAL_OUTPUT_DIR"

# 一時作業ディレクトリ作成
mkdir -p "$TEMP_DIR"
log_verbose "🔧 一時ディレクトリ作成: $TEMP_DIR"

# 仮想環境のコピー（symlink無効化）
echo ""
echo "📂 仮想環境をコピーしています（symlink解決中）..."
VENV_COPY_DIR="$TEMP_DIR/venv"

# rsyncを使用してsymlinkを実ファイルに変換
if command -v rsync &> /dev/null; then
    log_verbose "   rsync を使用してコピー中..."
    rsync -av --copy-links --exclude='__pycache__' --exclude='*.pyc' --exclude='.mypy_cache' \
          "$VENV_DIR/" "$VENV_COPY_DIR/"
else
    # rsyncがない場合はcpでフォールバック（symlinkの警告あり）
    echo "⚠️  rsync が見つかりません。cp でコピーします（symlinkが残る可能性があります）"
    cp -rL "$VENV_DIR" "$VENV_COPY_DIR" 2>/dev/null || {
        echo "❌ コピーに失敗しました。rsync をインストールすることを推奨します"
        exit 1
    }
fi

echo "✅ 仮想環境コピー完了"

# 不要ファイル削除
echo ""
echo "🗑️  不要ファイルを削除しています..."

# __pycache__ ディレクトリ削除
PYCACHE_COUNT=$(find "$VENV_COPY_DIR" -type d -name "__pycache__" | wc -l)
if [ "$PYCACHE_COUNT" -gt 0 ]; then
    find "$VENV_COPY_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    log_verbose "   __pycache__ ディレクトリ削除: ${PYCACHE_COUNT}個"
fi

# .pyc ファイル削除
PYC_COUNT=$(find "$VENV_COPY_DIR" -name "*.pyc" | wc -l)
if [ "$PYC_COUNT" -gt 0 ]; then
    find "$VENV_COPY_DIR" -name "*.pyc" -delete
    log_verbose "   .pyc ファイル削除: ${PYC_COUNT}個"
fi

# .mypy_cache ディレクトリ削除
find "$VENV_COPY_DIR" -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true

# .git ディレクトリ削除（稀にあるため）
find "$VENV_COPY_DIR" -type d -name ".git" -exec rm -rf {} + 2>/dev/null || true

# その他の不要ファイル
find "$VENV_COPY_DIR" -name "*.pyo" -delete 2>/dev/null || true
find "$VENV_COPY_DIR" -name ".DS_Store" -delete 2>/dev/null || true

echo "✅ 不要ファイル削除完了"

# バイトコード最適化
if [ "$NO_OPTIMIZE" = false ]; then
    echo ""
    echo "⚡ バイトコード最適化を実行しています..."
    
    # 新しいPythonパス（コピー後）
    PYTHON_COPY_BIN="$VENV_COPY_DIR/bin/python"
    
    if [ -x "$PYTHON_COPY_BIN" ]; then
        # レベル0とレベル1の最適化
        log_verbose "   レベル0最適化..."
        "$PYTHON_COPY_BIN" -m compileall -f "$VENV_COPY_DIR/lib/" -q || true
        
        log_verbose "   レベル1最適化..."
        "$PYTHON_COPY_BIN" -O -m compileall -f "$VENV_COPY_DIR/lib/" -q || true
        
        echo "✅ バイトコード最適化完了"
    else
        echo "⚠️  コピー後のPythonが実行できません、最適化をスキップ"
    fi
else
    echo "⏭️  バイトコード最適化をスキップ"
fi

# 依存関係整合性チェック
echo ""
echo "🔍 依存関係整合性チェック..."

# 主要モジュールのimportテスト
PYTHON_TEST_BIN="$VENV_COPY_DIR/bin/python"
if [ -x "$PYTHON_TEST_BIN" ]; then
    # plugin_meta.yamlから依存関係読み取り
    PLUGIN_META_FILE="$PLUGINS_ROOT/${PLUGIN_TYPE}/${PLUGIN_NAME}/plugin_meta.yaml"
    
    if [ -f "$PLUGIN_META_FILE" ]; then
        log_verbose "   プラグインメタデータから依存関係確認: $PLUGIN_META_FILE"
        
        # YAMLから依存関係抽出してテスト（簡易版）
        while IFS= read -r line; do
            if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*\"(.+)\" ]]; then
                dependency="${BASH_REMATCH[1]}"
                module_name=$(echo "$dependency" | cut -d'>=' -f1 | cut -d'=' -f1)
                
                log_verbose "     $module_name import テスト..."
                if ! "$PYTHON_TEST_BIN" -c "import $module_name" 2>/dev/null; then
                    echo "❌ モジュール $module_name のimportに失敗"
                    exit 1
                fi
            fi
        done < "$PLUGIN_META_FILE"
    fi
    
    echo "✅ 整合性チェック完了"
else
    echo "⚠️  整合性チェックをスキップ（Pythonが実行できません）"
fi

# パッケージサイズ測定
PACKAGE_SIZE_BEFORE=$(du -sh "$VENV_COPY_DIR" | cut -f1)
log_verbose "   最適化後サイズ: $PACKAGE_SIZE_BEFORE"

# 最終パッケージ作成
echo ""
if [ "$NO_COMPRESS" = true ]; then
    # 非圧縮出力
    echo "📁 非圧縮パッケージを作成しています..."
    FINAL_PACKAGE_DIR="$FINAL_OUTPUT_DIR/$PACKAGE_NAME"
    
    if [ -d "$FINAL_PACKAGE_DIR" ]; then
        rm -rf "$FINAL_PACKAGE_DIR"
    fi
    
    mv "$VENV_COPY_DIR" "$FINAL_PACKAGE_DIR"
    FINAL_OUTPUT="$FINAL_PACKAGE_DIR"
    
else
    # tar.gz圧縮
    echo "📦 圧縮パッケージを作成しています..."
    FINAL_PACKAGE_FILE="$FINAL_OUTPUT_DIR/${PACKAGE_NAME}.tar.gz"
    
    cd "$TEMP_DIR"
    tar -czf "$FINAL_PACKAGE_FILE" venv/ --transform "s/^venv/$PACKAGE_NAME/"
    cd - > /dev/null
    
    FINAL_OUTPUT="$FINAL_PACKAGE_FILE"
fi

# 一時ファイルクリーンアップ
if [ "$NO_CLEANUP" = false ]; then
    log_verbose "🗑️  一時ファイルをクリーンアップ中..."
    rm -rf "$TEMP_DIR"
else
    echo "🔧 一時ファイルを保持: $TEMP_DIR （--no-cleanup指定）"
fi

# 最終結果表示
FINAL_SIZE=$(du -sh "$FINAL_OUTPUT" | cut -f1)

echo ""
echo "🎉 パッケージ作成が完了しました！"
echo ""
echo "📊 パッケージ情報:"
echo "   種類: $PLUGIN_TYPE/$PLUGIN_NAME"
echo "   出力: $FINAL_OUTPUT"
echo "   サイズ: $FINAL_SIZE"
echo ""
echo "📋 顧客環境での展開方法:"
if [ "$NO_COMPRESS" = true ]; then
    echo "   1. cp -r $PACKAGE_NAME plugins/venvs/$PLUGIN_TYPE/"
else
    echo "   1. tar -xzf ${PACKAGE_NAME}.tar.gz -C plugins/venvs/$PLUGIN_TYPE/"
fi
echo "   2. plugins/venvs/$PLUGIN_TYPE/$PACKAGE_NAME/bin/python でプラグイン実行"
echo ""
echo "🔧 実行テスト例:"
echo "   plugins/venvs/$PLUGIN_TYPE/$PACKAGE_NAME/bin/python plugins/${PLUGIN_TYPE}/${PLUGIN_NAME}/run.py --status"
echo ""
echo "========================================================"
