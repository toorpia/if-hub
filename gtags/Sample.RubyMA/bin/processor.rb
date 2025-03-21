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
