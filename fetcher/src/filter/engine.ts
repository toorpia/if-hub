/**
 * フィルタリング実行エンジン
 */
import { 
  FilterExpression, 
  FilterCondition, 
  FilterResult, 
  DataPointForFilter, 
  TimestampTagValues 
} from './types';
import { DataPoint } from '../types/data';

/**
 * データポイントに対してフィルタ条件を適用
 * @param data データポイントの配列
 * @param expression フィルタ条件式
 * @returns フィルタリング結果
 */
export function applyFilter(data: DataPoint[], expression: FilterExpression): FilterResult {
  try {
    const originalCount = data.length;
    
    if (originalCount === 0) {
      return {
        success: true,
        filteredCount: 0,
        originalCount: 0
      };
    }

    // データポイントをタイムスタンプ別にグループ化
    const timestampGroups = groupDataByTimestamp(data);
    
    // 各タイムスタンプで条件を評価
    const validTimestamps = new Set<string>();
    
    for (const [timestamp, tagValues] of Object.entries(timestampGroups)) {
      if (evaluateExpression(expression, tagValues)) {
        validTimestamps.add(timestamp);
      }
    }
    
    // 条件を満たすタイムスタンプのデータのみを抽出
    const filteredData = data.filter(point => validTimestamps.has(point.timestamp));
    
    return {
      success: true,
      filteredCount: filteredData.length,
      originalCount
    };
  } catch (error) {
    return {
      success: false,
      filteredCount: 0,
      originalCount: data.length,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * データポイントに対してフィルタ条件を適用し、フィルタリング済みデータを返す
 * @param data データポイントの配列
 * @param expression フィルタ条件式
 * @returns フィルタリング済みデータポイント
 */
export function filterData(data: DataPoint[], expression: FilterExpression): DataPoint[] {
  const originalCount = data.length;
  
  if (originalCount === 0) {
    return [];
  }

  // データポイントをタイムスタンプ別にグループ化
  const timestampGroups = groupDataByTimestamp(data);
  
  // 各タイムスタンプで条件を評価
  const validTimestamps = new Set<string>();
  
  for (const [timestamp, tagValues] of Object.entries(timestampGroups)) {
    if (evaluateExpression(expression, tagValues)) {
      validTimestamps.add(timestamp);
    }
  }
  
  // 条件を満たすタイムスタンプのデータのみを抽出
  return data.filter(point => validTimestamps.has(point.timestamp));
}

/**
 * データポイントをタイムスタンプ別にグループ化
 * @param data データポイントの配列
 * @returns タイムスタンプ別のタグ値マップ
 */
function groupDataByTimestamp(data: DataPoint[]): TimestampTagValues {
  const groups: TimestampTagValues = {};
  
  for (const point of data) {
    // タイムスタンプが存在することを確認
    if (!point.timestamp || !point.tag) {
      continue;
    }
    
    if (!groups[point.timestamp]) {
      groups[point.timestamp] = {};
    }
    groups[point.timestamp][point.tag] = point.value;
  }
  
  return groups;
}

/**
 * 特定のタイムスタンプでフィルタ条件式を評価
 * @param expression フィルタ条件式
 * @param tagValues そのタイムスタンプでのタグ値マップ
 * @returns 条件を満たす場合true
 */
function evaluateExpression(expression: FilterExpression, tagValues: { [tagName: string]: number | null }): boolean {
  // leftの評価
  const leftResult = evaluateNode(expression.left, tagValues);
  
  // 単一条件の場合
  if (!expression.operator || !expression.right) {
    return leftResult;
  }
  
  // rightの評価
  const rightResult = evaluateNode(expression.right, tagValues);
  
  // 論理演算子の適用
  switch (expression.operator) {
    case 'AND':
      return leftResult && rightResult;
    case 'OR':
      return leftResult || rightResult;
    default:
      throw new Error(`未知の論理演算子: ${expression.operator}`);
  }
}

/**
 * 条件ノード（条件または式）を評価
 * @param node 条件または式
 * @param tagValues タグ値マップ
 * @returns 評価結果
 */
function evaluateNode(node: FilterCondition | FilterExpression, tagValues: { [tagName: string]: number | null }): boolean {
  if ('equipmentName' in node) {
    // 単一条件の評価
    return evaluateCondition(node, tagValues);
  } else {
    // 式の評価
    return evaluateExpression(node, tagValues);
  }
}

/**
 * 単一条件を評価
 * @param condition フィルタ条件
 * @param tagValues タグ値マップ
 * @returns 条件を満たす場合true
 */
function evaluateCondition(condition: FilterCondition, tagValues: { [tagName: string]: number | null }): boolean {
  // 設備名とタグ名を結合してIF-Hub内部形式のタグキーを作成
  // IF-Hub内部では "{設備名}.{タグ名}" 形式でタグが管理されている
  const fullTagName = `${condition.equipmentName}.${condition.tagName}`;
  const tagValue = tagValues[fullTagName];
  
  // タグ値が存在しない、またはnullの場合はfalse
  if (tagValue === undefined || tagValue === null) {
    return false;
  }
  
  const { operator, value: conditionValue } = condition;
  
  // 比較演算子の適用
  switch (operator) {
    case '>':
      return tagValue > conditionValue;
    case '>=':
      return tagValue >= conditionValue;
    case '<':
      return tagValue < conditionValue;
    case '<=':
      return tagValue <= conditionValue;
    case '==':
      return tagValue === conditionValue;
    case '!=':
      return tagValue !== conditionValue;
    default:
      throw new Error(`未知の比較演算子: ${operator}`);
  }
}

/**
 * フィルタ条件で必要なタグがデータに含まれているかチェック
 * @param data データポイントの配列
 * @param requiredTags 必要なタグ名の配列（元の形式：パイプ区切りまたはピリオド区切り）
 * @returns 不足しているタグ名の配列
 */
export function validateRequiredTags(data: DataPoint[], requiredTags: string[]): string[] {
  const availableTags = new Set(data.map(point => point.tag));
  const missingTags: string[] = [];
  
  for (const tag of requiredTags) {
    let actualTagName = tag;
    
    // パイプ区切り形式の場合はピリオド区切り形式に変換
    if (tag.includes('|')) {
      const parts = tag.split('|');
      if (parts.length === 2) {
        actualTagName = `${parts[0].trim()}.${parts[1].trim()}`;
      }
    }
    
    // 実際のタグ名でチェック
    if (!availableTags.has(actualTagName)) {
      missingTags.push(tag); // 元の形式で報告
    }
  }
  
  return missingTags;
}

/**
 * フィルタリング統計情報を生成
 * @param originalCount 元のデータ数
 * @param filteredCount フィルタ後のデータ数
 * @returns 統計情報の文字列
 */
export function generateFilterStats(originalCount: number, filteredCount: number): string {
  const percentage = originalCount > 0 ? ((filteredCount / originalCount) * 100).toFixed(1) : '0.0';
  return `フィルタリング完了: ${originalCount} → ${filteredCount} レコード (${percentage}%)`;
}
