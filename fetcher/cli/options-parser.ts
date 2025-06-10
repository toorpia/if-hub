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
    .description('IF-HUBからデータを抽出するツール')
    .version(VERSION);
  
  // 必須オプション
  program
    .requiredOption(
      '-e, --equipment <name>',
      '設備名 (カンマ区切りで複数指定可能)',
    );
  
  // 必須オプション  
  program
    .requiredOption(
      '-s, --start-date <datetime>',
      '開始日時 (YYYYMMDDHHmm形式、例: 202501011400)',
    );

  // オプション引数
  program
    .option(
      '-n, --end-date <datetime>',
      '終了日時 (YYYYMMDDHHmm形式、省略時は最新データまで)',
    )
    .option(
      '--host <host>',
      'IF-HubのホストIP/ドメイン',
      'localhost'
    )
    .option(
      '-p, --port <number>',
      'IF-Hubのポート番号',
      '3001'
    )
    .option(
      '-o, --output-dir <path>',
      'CSV出力先ディレクトリ',
      '.'
    )
    .option(
      '-v, --verbose',
      '詳細ログを出力',
      false
    );
  
  // ヘルプテキスト
  program.addHelpText('after', `
例:
  # 必須オプションのみ（最新まで）
  $ if-hub-fetcher --equipment Pump01 --start-date 202501010900

  # 期間指定
  $ if-hub-fetcher --equipment Pump01,Tank01 --start-date 202501010900 --end-date 202501011700

  # ポート・出力先カスタマイズ
  $ if-hub-fetcher --equipment Pump01 --start-date 202501010900 --port 3002 --output-dir /custom/path

  # リモートIF-Hub指定
  $ if-hub-fetcher --equipment Pump01 --start-date 202501010900 --host 192.168.1.100 --port 3001
  `);
  
  // 引数の解析
  program.parse(args);
  const options = program.opts();
  
  // 複数値の処理（カンマ区切り文字列を配列に変換）
  if (options.equipment && typeof options.equipment === 'string' && options.equipment.includes(',')) {
    options.equipment = options.equipment.split(',').map((s: string) => s.trim());
  }
  
  // ポート番号を数値に変換
  if (options.port) {
    options.port = parseInt(options.port, 10);
    if (isNaN(options.port)) {
      throw new Error('ポート番号は数値である必要があります');
    }
  }
  
  // 日時形式のバリデーション
  if (options.startDate) {
    validateDateTimeFormat(options.startDate, '--start-date');
  }
  
  if (options.endDate) {
    validateDateTimeFormat(options.endDate, '--end-date');
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

/**
 * YYYYMMDDHHmm形式の日時をバリデーションする
 * @param value 日時文字列
 * @param optionName オプション名
 * @throws バリデーションエラー
 */
function validateDateTimeFormat(value: string, optionName: string): void {
  // YYYYMMDDHHmm形式（12桁）のチェック
  if (!/^\d{12}$/.test(value)) {
    throw new Error(`${optionName} は YYYYMMDDHHmm形式（12桁の数字）で指定してください（例: 202501011400）`);
  }
  
  // 各部分を抽出
  const year = parseInt(value.substring(0, 4), 10);
  const month = parseInt(value.substring(4, 6), 10);
  const day = parseInt(value.substring(6, 8), 10);
  const hour = parseInt(value.substring(8, 10), 10);
  const minute = parseInt(value.substring(10, 12), 10);
  
  // 範囲チェック
  if (year < 1900 || year > 2100) {
    throw new Error(`${optionName} の年は1900-2100の範囲で指定してください`);
  }
  
  if (month < 1 || month > 12) {
    throw new Error(`${optionName} の月は01-12の範囲で指定してください`);
  }
  
  if (day < 1 || day > 31) {
    throw new Error(`${optionName} の日は01-31の範囲で指定してください`);
  }
  
  if (hour < 0 || hour > 23) {
    throw new Error(`${optionName} の時は00-23の範囲で指定してください`);
  }
  
  if (minute < 0 || minute > 59) {
    throw new Error(`${optionName} の分は00-59の範囲で指定してください`);
  }
  
  // 実際の日付として有効かチェック
  const date = new Date(year, month - 1, day, hour, minute);
  if (date.getFullYear() !== year || 
      date.getMonth() !== month - 1 || 
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute) {
    throw new Error(`${optionName} に無効な日時が指定されました: ${value}`);
  }
}
