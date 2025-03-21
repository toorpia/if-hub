# gtagシステム開発ガイド

gtagは「生成タグ」（Generated Tag）の略で、既存のタグデータを加工して新しい価値を持つデータを生成するための機能です。本ガイドでは、gtagの仕組みと特にカスタム処理スクリプトの開発方法について説明します。

## 1. gtagの基本構造

各gtagは以下の構造で構成されています：

```
gtags/
  └── [タグ名]/               # 例: Tank01.MovingAverage
      ├── def.json           # 定義ファイル（必須）
      └── bin/               # 実行可能スクリプトディレクトリ（オプション）
          └── processor.py   # 実行可能スクリプト (任意の言語で実装可能)
```

## 2. def.jsonの仕様

`def.json`は各gtagの設定と振る舞いを定義するJSONファイルです。

```json
{
  "name": "Tank01.MovingAverage",
  "type": "custom",
  "inputs": ["Tank01.Level"],
  "prog": "bin/processor.py",
  "args": ["--window=5"],
  "description": "タンク01の水位の5ポイント移動平均",
  "unit": "m"
}
```

主な設定項目：
- `name`: gtagの名前（一意）
- `type`: 処理タイプ
  - `custom`: カスタム実装（bin内のスクリプトを使用）
  - `calculation`: 計算式ベース
  - `moving_average`: 移動平均
  - `zscore`: Z-score計算
  - `deviation`: 偏差値計算
  - `raw`: 生データ
- `inputs`: 入力となるタグのリスト
- `prog`: カスタム実装の場合、実行するスクリプトへのパス
- `args`: プログラムに渡すコマンドライン引数の配列
- `description`: 説明
- `unit`: 単位

## 3. カスタムスクリプト開発 (bin/ ディレクトリ内)

### 3.1 スクリプトの基本要件

- スクリプトは実行可能である必要があります（`chmod +x`）
- シバン（`#!/usr/bin/env python3`など）を先頭に記述
- 標準入力（stdin）からデータを読み取り、標準出力（stdout）に結果を出力
- エラーは標準エラー出力（stderr）に出力
- コマンドライン引数を通じてパラメータを受け取る

### 3.2 入出力形式

#### 入力形式
システムからスクリプトへは、標準入力を通じて行単位でデータが渡されます：

```
2025-03-21T10:00:00Z,23.5,24.1,25.0
2025-03-21T10:01:00Z,24.1,24.3,25.2
2025-03-21T10:02:00Z,24.8,24.5,25.5
...
```

各行は `タイムスタンプ,値1,値2,...` の形式で、以下のデータが含まれます：
- 1列目: ISO8601形式のタイムスタンプ
- 2列目以降: 入力タグの値（定義されたinputsの順）

#### 出力形式
スクリプトからシステムへの出力も行単位で行われます：

```
2025-03-21T10:00:00Z,23.5
2025-03-21T10:01:00Z,24.0
2025-03-21T10:02:00Z,24.13
...
```

出力は `タイムスタンプ,値` の形式で、計算結果を返します。

### 3.3 コマンドライン引数

スクリプトは実行時に`def.json`の`args`フィールドで定義されたコマンドライン引数を受け取ります。

```bash
./processor.py --window=5 --verbose  # argsで定義された引数
```

各種パラメータは、コマンドライン引数として渡すことで設定できます。

### 3.4 エラー処理

- エラーは標準エラー出力に書き込みます
- スクリプトは問題があれば非ゼロの終了コードで終了します
- 正常終了の場合は終了コード0を返します

## 4. 実装例（各言語）

### 4.1 Python実装例

```python
#!/usr/bin/env python3
import sys
from collections import deque
import argparse

# コマンドライン引数
parser = argparse.ArgumentParser(description='移動平均の計算')
parser.add_argument('--window', type=int, default=5, help='移動平均の窓サイズ')
args = parser.parse_args()

# 移動平均のバッファ
window = deque(maxlen=args.window)

# 標準入力の各行を処理
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    
    try:
        # カンマ区切りの値を解析
        values = line.split(',')
        timestamp = values[0]  # タイムスタンプは常に最初のフィールド
        value = float(values[1])  # 最初のタグ値
        
        # 移動平均計算
        window.append(value)
        avg = sum(window) / len(window)
        
        # 結果を出力
        print(f"{timestamp},{avg}")
        sys.stdout.flush()
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.stderr.flush()
```

### 4.2 Ruby実装例

```ruby
#!/usr/bin/env ruby
require 'optparse'

# コマンドライン引数
options = {window: 5}
OptionParser.new do |opts|
  opts.on("--window N", Integer, "移動平均の窓サイズ") {|n| options[:window] = n }
end.parse!

# 移動平均のバッファ
buffer = []
window_size = options[:window]

# 標準入力から行単位で処理
$stdin.each_line do |line|
  line.chomp!
  next if line.empty?
  
  begin
    # カンマ区切りの値を解析
    values = line.split(',')
    timestamp = values[0]  # タイムスタンプは常に最初のフィールド
    value = values[1].to_f  # 最初のタグ値
    
    # バッファ管理
    buffer << value
    buffer.shift if buffer.size > window_size
    
    # 移動平均を計算
    avg = buffer.sum / buffer.size
    
    # 結果を出力
    puts "#{timestamp},#{avg}"
    STDOUT.flush  # 即時出力を保証
  rescue => e
    STDERR.puts "Error: #{e.message}"
    STDERR.flush
  end
end
```


## 6. 効率的な実装のためのベストプラクティス

### 6.1 メモリ効率

大量のデータを処理する場合は、以下の点に注意してください：

- データを一度にすべてメモリに読み込まない
- 行単位の処理を基本とする
- 固定サイズのバッファ（dequeなど）を使用する
- 必要に応じてチャンク処理を実装する

### 6.2 パフォーマンスチューニング

- 計算コストの高い処理は最小限に抑える
- 必要に応じて効率的なアルゴリズムやデータ構造を使用する
- 出力はバッファリングせず即時フラッシュする

### 6.3 エラー回復性

- 一部のデータにエラーがあっても処理を継続できるようにする
- 可能な限り適切なデフォルト値や代替処理を提供する

## 7. 新しいgtagの追加手順

1. `gtags/[新しいタグ名]` ディレクトリを作成
2. `def.json` ファイルを作成して設定
3. `bin` ディレクトリを作成
4. 処理スクリプトを作成し、実行権限を付与 (`chmod +x`)
5. スクリプトをテストし、正しく動作することを確認

## 8. その他の注意点

- スクリプトは任意の言語で実装可能（Python、Ruby、Go、C、シェルスクリプトなど）
- スクリプトは1プログラムで単一の機能を持つように設計する
- 多くのライブラリに依存する場合は、必要なライブラリをスクリプトと一緒にバンドルするか、システム全体で利用可能にする

## 9. トラブルシューティング

### 9.1 スクリプトが実行されない
- 実行権限が付与されているか確認 (`chmod +x`)
- sh bangが正しく設定されているか確認
- パスが正しいか確認

### 9.2 データが正しく処理されない
- 入力形式が正しいか確認
- 出力形式が仕様通りか確認
- エラー出力を確認

### 9.3 パフォーマンス問題
- メモリリークがないか確認
- 効率的なアルゴリズムを使用しているか確認
- 大量データの処理方法を見直す
