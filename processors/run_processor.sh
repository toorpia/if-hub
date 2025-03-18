#!/bin/bash
# 指定された処理プロセッサを実行するためのラッパー

# エラーがあれば中断
set -e

# スクリプトディレクトリ
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# 引数の解析
PROCESSOR=$1
shift

if [ -z "$PROCESSOR" ]; then
    echo "使用方法: $0 <処理名> [引数...]" >&2
    exit 1
fi

# プロセッサ処理のディレクトリとファイルパスを特定
PROCESSOR_DIR="${SCRIPT_DIR}/${PROCESSOR}"
PROCESSOR_PYTHON="${PROCESSOR_DIR}/${PROCESSOR}.py"
PROCESSOR_BINARY="${PROCESSOR_DIR}/${PROCESSOR}"

# 実行可能なプロセッサを探す
if [ -f "$PROCESSOR_PYTHON" ] && [ -x "$PROCESSOR_PYTHON" ]; then
    # Python実装が実行可能であれば使用
    echo "Pythonプロセッサを実行: ${PROCESSOR_PYTHON}"
    exec python3 "$PROCESSOR_PYTHON" "$@"
elif [ -f "$PROCESSOR_PYTHON" ]; then
    # Python実装があるが実行権限がない場合
    echo "Pythonプロセッサを実行: ${PROCESSOR_PYTHON}"
    exec python3 "$PROCESSOR_PYTHON" "$@"
elif [ -f "$PROCESSOR_BINARY" ] && [ -x "$PROCESSOR_BINARY" ]; then
    # コンパイル済みバイナリがあれば使用
    echo "バイナリプロセッサを実行: ${PROCESSOR_BINARY}"
    exec "$PROCESSOR_BINARY" "$@"
else
    echo "エラー: プロセッサ '${PROCESSOR}' が見つかりません" >&2
    echo "以下のいずれかが必要です:" >&2
    echo "- ${PROCESSOR_PYTHON}" >&2
    echo "- ${PROCESSOR_BINARY}" >&2
    exit 1
fi
