/**
 * データフィルタリングモジュール
 * 条件に基づいてデータポイントをフィルタリングする純粋関数を提供
 */
import { DataPoint, GroupedDataPoints } from './types/data';
import { ConditionsConfig, FilterCondition } from './types/config';

/**
 * データポイントをタイムスタンプでグループ化
 * @param data データポイント配列
 * @returns グループ化されたデータポイント
 */
export function groupDataByTimestamp(data: DataPoint[]): GroupedDataPoints {
  const grouped: GroupedDataPoints = {};

  for (const point of data) {
    if (!grouped[point.timestamp]) {
      grouped[point.timestamp] = {};
    }
    grouped[point.timestamp][point.tag || ''] = point;
  }

  return grouped;
}

/**
 * 条件に基づいてデータポイントをフィルタリング
 * @param data フィルタリング対象のデータポイント配列
 * @param conditions フィルタリング条件
 * @returns フィルタリングされたデータポイント配列
 */
export function filterDataByConditions(
  data: DataPoint[],
  conditions?: ConditionsConfig
): DataPoint[] {
  // 条件が指定されていない場合はそのまま返す
  if (!conditions || !conditions.only_when || conditions.only_when.length === 0) {
    return data;
  }

  // データポイントをタイムスタンプでグループ化
  const dataByTimestamp = groupDataByTimestamp(data);

  // 条件に一致するタイムスタンプを特定
  const validTimestamps = new Set<string>();

  for (const timestamp of Object.keys(dataByTimestamp)) {
    const pointsAtTime = dataByTimestamp[timestamp];
    if (evaluateConditions(pointsAtTime, conditions.only_when)) {
      validTimestamps.add(timestamp);
    }
  }

  // 条件に一致するデータポイントのみを返す
  return data.filter(point => validTimestamps.has(point.timestamp));
}

/**
 * すべての条件を評価
 * @param dataPoints タイムスタンプごとのデータポイント
 * @param conditions 条件配列
 * @returns すべての条件を満たす場合はtrue
 */
function evaluateConditions(
  dataPoints: Record<string, DataPoint>,
  conditions: FilterCondition[]
): boolean {
  // すべての条件を評価（AND条件）
  for (const condition of conditions) {
    const point = dataPoints[condition.tag];
    
    // 対象のタグが存在しない場合はスキップ
    if (!point) continue;

    // データポイントの値がnullの場合は条件を満たさない
    if (point.value === null) {
      return false;
    }

    // 条件式を評価
    if (!evaluateExpression(point.value, condition.condition)) {
      return false;
    }
  }

  return true;
}

/**
 * 条件式を評価する
 * @param value 評価対象の値
 * @param expression 条件式文字列（例: "> 50", "== 10", "< 100"）
 * @returns 条件を満たす場合はtrue
 */
export function evaluateExpression(value: number, expression: string): boolean {
  // 式の整形（空白を削除）
  const trimmedExpr = expression.trim();

  // 等号、不等号の抽出
  const operatorMatch = trimmedExpr.match(/^([<>=!]{1,2})\s*(.+)$/);
  if (!operatorMatch) {
    throw new Error(`無効な条件式: ${expression}`);
  }

  const [, operator, rightSideStr] = operatorMatch;
  
  // 右辺の値を数値に変換
  const rightValue = parseFloat(rightSideStr);
  if (isNaN(rightValue)) {
    throw new Error(`条件式の右辺が数値ではありません: ${rightSideStr}`);
  }

  // 演算子に基づいて評価
  switch (operator) {
    case '==':
      return value === rightValue;
    case '!=':
      return value !== rightValue;
    case '>':
      return value > rightValue;
    case '>=':
      return value >= rightValue;
    case '<':
      return value < rightValue;
    case '<=':
      return value <= rightValue;
    default:
      throw new Error(`未サポートの演算子です: ${operator}`);
  }
}
