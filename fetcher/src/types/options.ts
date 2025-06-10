/**
 * ランタイムオプションの型定義
 */

export interface RuntimeOptions {
  /**
   * 開始時刻（ISO 8601形式）
   * 例: "2023-01-01T00:00:00Z"
   * 省略された場合は利用可能な最も古いデータ時刻を使用
   */
  start?: string;
  
  /**
   * 終了時刻（ISO 8601形式）
   * 例: "2023-01-31T23:59:59Z"
   * 省略された場合は現在時刻（最新データ）を使用
   */
  end?: string;
  
  /**
   * 最新データのみ取得するフラグ
   * trueの場合、既存データの最終時刻以降のデータのみを取得
   */
  latest?: boolean;
  
  /**
   * 1ファイルあたりの最大行数
   * デフォルト値はconfig.yamlで設定
   */
  max_rows_per_file?: number;
  
  /**
   * 1リクエストあたりの最大レコード数
   * デフォルト値はconfig.yamlで設定
   */
  max_records_per_request?: number;
  
  /**
   * ページングの際の1ページサイズ
   * デフォルト値はconfig.yamlで設定
   */
  page_size?: number;
  
  /**
   * 設定ファイルのパス
   * デフォルト: "./config.yaml"
   */
  config_file?: string;
  
  /**
   * 詳細ログ出力フラグ
   */
  verbose?: boolean;
}

/**
 * コマンドライン引数の型定義
 * RuntimeOptionsを拡張
 */
export interface CliOptions extends RuntimeOptions {
  /**
   * 設備名（カンマ区切りで複数指定可能）
   */
  equipment: string | string[];
  
  /**
   * 開始日付（YYYY-MM-DD形式）
   */
  startDate: string;
  
  /**
   * 終了日付（YYYY-MM-DD形式、省略可能）
   */
  endDate?: string;
  
  /**
   * IF-HubのホストIP/ドメイン
   */
  host?: string;
  
  /**
   * IF-Hubのポート番号
   */
  port?: number;
  
  /**
   * CSV出力先ディレクトリ
   */
  outputDir?: string;
  
  /**
   * タグ名（カンマ区切りで複数指定可能）
   * 設定ファイルの値を上書き
   */
  tags?: string | string[];
  
}

/**
 * Fetcherの実行結果
 */
export interface FetcherResult {
  success: boolean;
  outputFiles?: string[];
  error?: Error;
  stats?: {
    totalRecords: number;
    duration: number;
  };
}

/**
 * Fetcherの入力パラメータ
 */
export interface FetcherParams {
  config: any; // FetcherConfig型を使用予定
  equipment: string;
  options: RuntimeOptions;
}
