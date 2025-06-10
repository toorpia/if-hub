/**
 * Fetcherモジュールのメインエントリーポイント
 * 
 * 外部からのインポート用エクスポート一覧
 */
import { fetchData } from './fetcher';
import { ApiClient } from './api-client';
import { validateTags } from './tag-validator';
import { CsvFormatter } from './formatters/csv';

// メインのfetcher関数をエクスポート
export { fetchData };

// APIクライアント
export { ApiClient };

// タグ検証
export { validateTags };

// フォーマッタ
export { CsvFormatter };

// 型定義をエクスポート
export * from './types/config';
export * from './types/data';
export * from './types/options';

/**
 * メインモジュール情報
 */
export const VERSION = '0.1.0';
export const MODULE_NAME = 'if-hub-fetcher';
