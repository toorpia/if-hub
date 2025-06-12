/**
 * フィルタリング機能用の型定義
 */

/**
 * 比較演算子の種類
 */
export type ComparisonOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

/**
 * 論理演算子の種類
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * 条件式の基本単位
 */
export interface FilterCondition {
  /** 設備名 */
  equipmentName: string;
  tagName: string;
  /** 元の入力形式（パイプ区切り） */
  originalExpression: string;
  /** 比較演算子 */
  operator: ComparisonOperator;
  /** 比較値 */
  value: number;
}

/**
 * 複合条件（論理演算子で結合された条件）
 */
export interface FilterExpression {
  /** 左側の条件または式 */
  left: FilterCondition | FilterExpression;
  /** 論理演算子 */
  operator?: LogicalOperator;
  /** 右側の条件または式 */
  right?: FilterCondition | FilterExpression;
}

/**
 * フィルタリングオプション
 */
export interface FilterOptions {
  /** フィルタ条件の文字列表現 */
  expression: string;
  /** パースされた条件式 */
  parsedExpression?: FilterExpression;
}

/**
 * フィルタリング結果
 */
export interface FilterResult {
  /** フィルタリングが成功したか */
  success: boolean;
  /** フィルタリング後のデータポイント数 */
  filteredCount: number;
  /** 元のデータポイント数 */
  originalCount: number;
  /** エラーメッセージ（エラー時のみ） */
  error?: string;
}

/**
 * データポイント（フィルタリング用）
 */
export interface DataPointForFilter {
  /** タイムスタンプ */
  timestamp: string;
  /** タグ名 */
  tag: string;
  /** 値 */
  value: number | null;
  /** 設備名 */
  equipment?: string;
}

/**
 * タイムスタンプごとのタグ値マップ
 */
export interface TimestampTagValues {
  [timestamp: string]: {
    [tagName: string]: number | null;
  };
}
