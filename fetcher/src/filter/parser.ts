/**
 * フィルタ条件文字列のパーサー
 */
import { FilterCondition, FilterExpression, LogicalOperator, ComparisonOperator } from './types';

/**
 * 条件文字列をパースしてFilterExpressionに変換
 * @param expression 条件文字列 例: "Pump01|Temperature > 50 AND Pump01|Flow <= 100"
 * @param defaultEquipment デフォルト設備名（設備名省略時に使用）
 * @returns パースされた条件式
 */
export function parseFilterExpression(expression: string, defaultEquipment?: string): FilterExpression {
  if (!expression || expression.trim() === '') {
    throw new Error('フィルタ条件が空です');
  }

  // 文字列を正規化（余分な空白を削除）
  const normalized = expression.trim().replace(/\s+/g, ' ');
  
  // 論理演算子で分割してトークン化
  const tokens = tokenize(normalized);
  
  // トークンから条件式を構築
  return parseTokens(tokens, defaultEquipment);
}

/**
 * 文字列をトークンに分割
 * @param expression 正規化された条件文字列
 * @returns トークンの配列
 */
function tokenize(expression: string): string[] {
  // 論理演算子を境界として分割（AND/ORの前後にスペースを追加してから分割）
  const withSpaces = expression
    .replace(/\s+(AND|OR)\s+/g, ' $1 ')
    .replace(/\s+/g, ' ');
  
  return withSpaces.split(' ').filter(token => token.trim() !== '');
}

/**
 * トークンから条件式を構築
 * @param tokens トークンの配列
 * @param defaultEquipment デフォルト設備名
 * @returns 構築された条件式
 */
function parseTokens(tokens: string[], defaultEquipment?: string): FilterExpression {
  if (tokens.length === 0) {
    throw new Error('条件式が空です');
  }

  // 単一条件の場合
  if (tokens.length === 3) {
    const condition = parseCondition(tokens, defaultEquipment);
    return { left: condition };
  }

  // 複合条件の場合
  if (tokens.length < 5) {
    throw new Error('条件式の形式が正しくありません');
  }

  // 最初の条件をパース
  const leftCondition = parseCondition(tokens.slice(0, 3), defaultEquipment);
  
  // 論理演算子
  const logicalOp = tokens[3] as LogicalOperator;
  if (!['AND', 'OR'].includes(logicalOp)) {
    throw new Error(`サポートされていない論理演算子です: ${logicalOp}`);
  }

  // 残りの部分を再帰的にパース
  const remainingTokens = tokens.slice(4);
  const rightExpression = parseTokens(remainingTokens, defaultEquipment);

  return {
    left: leftCondition,
    operator: logicalOp,
    right: rightExpression
  };
}

/**
 * 単一条件をパース
 * @param tokens 3つのトークン [タグ名, 演算子, 値]
 * @param defaultEquipment デフォルト設備名（設備名省略時に使用）
 * @returns パースされた条件
 */
function parseCondition(tokens: string[], defaultEquipment?: string): FilterCondition {
  if (tokens.length !== 3) {
    throw new Error(`条件の形式が正しくありません: ${tokens.join(' ')}`);
  }

  const [rawTagName, operatorStr, valueStr] = tokens;

  // タグ名の検証
  if (!rawTagName || rawTagName.trim() === '') {
    throw new Error('タグ名が空です');
  }

  // 設備名とタグ名の分離処理
  const trimmedTagName = rawTagName.trim();
  let equipmentName: string;
  let tagName: string;
  let originalExpression: string;
  
  if (trimmedTagName.includes('|')) {
    // パイプ区切り形式（推奨）: "設備名|タグ名"
    const parts = trimmedTagName.split('|');
    if (parts.length !== 2) {
      throw new Error(`パイプ区切りの形式が正しくありません。"{設備名}|{タグ名}"の形式で指定してください: ${trimmedTagName}`);
    }
    equipmentName = parts[0].trim();
    tagName = parts[1].trim();
    originalExpression = trimmedTagName;
  } else if (trimmedTagName.includes('.')) {
    // ピリオド区切り形式（後方互換性）: "設備名.タグ名"
    // 設備名にピリオドが含まれないことが保証されているので、最初のピリオドで分離
    const firstDotIndex = trimmedTagName.indexOf('.');
    equipmentName = trimmedTagName.substring(0, firstDotIndex).trim();
    tagName = trimmedTagName.substring(firstDotIndex + 1).trim();
    originalExpression = trimmedTagName;
  } else {
    // 設備名省略形式: "タグ名"のみ
    if (!defaultEquipment) {
      throw new Error(`設備名が省略されていますが、デフォルト設備名が指定されていません: ${trimmedTagName}`);
    }
    equipmentName = defaultEquipment;
    tagName = trimmedTagName;
    originalExpression = `${defaultEquipment}|${trimmedTagName}`; // ログ表示用にパイプ区切り形式で記録
  }
  
  // 設備名とタグ名の空チェック
  if (!equipmentName || !tagName) {
    throw new Error(`設備名またはタグ名が空です: ${trimmedTagName}`);
  }

  // 演算子の検証
  const operator = operatorStr as ComparisonOperator;
  if (!['>', '>=', '<', '<=', '==', '!='].includes(operator)) {
    throw new Error(`サポートされていない比較演算子です: ${operator}`);
  }

  // 値の検証
  const value = parseFloat(valueStr);
  if (isNaN(value)) {
    throw new Error(`数値ではありません: ${valueStr}`);
  }

  return {
    equipmentName,
    tagName,
    originalExpression,
    operator,
    value
  };
}

/**
 * 条件式を文字列に変換（デバッグ用）
 * @param expression 条件式
 * @returns 文字列表現
 */
export function expressionToString(expression: FilterExpression): string {
  if ('equipmentName' in expression.left) {
    // leftが単一条件の場合
    const leftStr = `${expression.left.originalExpression} ${expression.left.operator} ${expression.left.value}`;
    
    if (!expression.operator || !expression.right) {
      return leftStr;
    }
    
    const rightStr = expressionToString(expression.right as FilterExpression);
    return `${leftStr} ${expression.operator} ${rightStr}`;
  } else {
    // leftが式の場合
    const leftStr = expressionToString(expression.left as FilterExpression);
    
    if (!expression.operator || !expression.right) {
      return `(${leftStr})`;
    }
    
    const rightStr = expressionToString(expression.right as FilterExpression);
    return `(${leftStr}) ${expression.operator} ${rightStr}`;
  }
}

/**
 * 条件式に含まれるすべてのタグ名を抽出（元の形式で）
 * @param expression 条件式
 * @returns 元の形式のタグ名の配列（重複なし）
 */
export function extractTagNames(expression: FilterExpression): string[] {
  const tagNames = new Set<string>();
  
  function extractFromExpression(expr: FilterExpression) {
    if ('equipmentName' in expr.left) {
      tagNames.add(expr.left.originalExpression);
    } else {
      extractFromExpression(expr.left as FilterExpression);
    }
    
    if (expr.right) {
      if ('equipmentName' in expr.right) {
        tagNames.add(expr.right.originalExpression);
      } else {
        extractFromExpression(expr.right as FilterExpression);
      }
    }
  }
  
  extractFromExpression(expression);
  return Array.from(tagNames);
}
