/**
 * コマンドライン引数パーサー
 */
import { Command } from 'commander';
import { CliOptions } from '../src/types/options';
import { VERSION, MODULE_NAME } from '../src';

/**
 * コマンドライン引数を解析し、オプションオブジェクトを返す
 * @param args コマンドライン引数
 * @returns 解析されたオプション
 */
export function parseOptions(args: string[]): CliOptions {
  const program = new Command();
  
  // プログラム情報の設定
  program
    .name(MODULE_NAME)
    .description('IF-HUBからデータを抽出・条件フィルタリングするツール')
    .version(VERSION);
  
  // 必須オプション
  program
    .requiredOption(
      '-e, --equipment <name>',
      '設備名 (カンマ区切りで複数指定可能)',
    );
  
  // オプション引数
  program
    .option(
      '-t, --tags <names>',
      'タグ名 (カンマ区切りで複数指定可能、設定ファイルの値を上書き)',
    )
    .option(
      '-s, --start <time>',
      '開始時刻 (ISO 8601形式: YYYY-MM-DDThh:mm:ssZ)',
    )
    .option(
      '-n, --end <time>',
      '終了時刻 (ISO 8601形式: YYYY-MM-DDThh:mm:ssZ)',
    )
    .option(
      '-l, --latest',
      '最新データのみ取得 (既存データの最終時刻以降)',
      false
    )
    .option(
      '-c, --config-file <path>',
      '設定ファイルのパス',
      './fetcher/config.yaml'
    )
    .option(
      '-o, --only-when <expression>',
      '条件式 (例: "Tag1 > 50", カンマ区切りで複数指定可能)',
    )
    .option(
      '-m, --max-rows-per-file <number>',
      '1ファイルあたりの最大行数',
      parseIntOption
    )
    .option(
      '-p, --page-size <number>',
      'APIリクエストの1ページあたりのレコード数',
      parseIntOption
    )
    .option(
      '-v, --verbose',
      '詳細ログを出力',
      false
    );
  
  // ヘルプテキスト
  program.addHelpText('after', `
例:
  $ ./run.sh --equipment Pump01
  $ ./run.sh --equipment Pump01 --tags Pump01.Temperature,Pump01.Pressure
  $ ./run.sh --equipment Pump01 --start "2023-01-01T00:00:00Z" --end "2023-01-31T23:59:59Z"
  $ ./run.sh --equipment Pump01 --latest
  $ ./run.sh --equipment Pump01 --only-when "Pump01.Status == 1,Pump01.Temperature > 50"
  `);
  
  // 引数の解析
  program.parse(args);
  const options = program.opts();
  
  // 複数値の処理（カンマ区切り文字列を配列に変換）
  if (options.equipment && options.equipment.includes(',')) {
    options.equipment = options.equipment.split(',');
  }
  
  if (options.tags && options.tags.includes(',')) {
    options.tags = options.tags.split(',');
  }
  
  if (options.onlyWhen && options.onlyWhen.includes(',')) {
    options.onlyWhen = options.onlyWhen.split(',');
  }
  
  return options as CliOptions;
}

/**
 * 数値オプションのパース
 * @param value 文字列値
 * @returns 数値（変換できない場合はundefined）
 */
function parseIntOption(value: string): number | undefined {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}
