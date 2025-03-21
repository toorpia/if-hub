// src/utils/data-processing.js
/**
 * データ処理ユーティリティ関数
 * 移動平均、Z-score、偏差値などの計算を行う
 */

/**
 * 移動平均を計算（スライディングウィンドウアルゴリズム使用）
 * @param {Array} data - 計算対象のデータ
 * @param {number} windowSize - 窓サイズ
 * @param {boolean} isSorted - データが既にタイムスタンプでソート済みかどうか
 * @returns {Array} 計算結果
 */
function calculateMovingAverage(data, windowSize = 5, isSorted = false) {
  if (!data || data.length === 0) return [];
  
  // データがソート済みの場合は直接使用、そうでなければソート
  const sortedData = isSorted ? data : [...data].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const result = [];
  let sum = 0;
  
  // 最初のウィンドウを処理
  for (let i = 0; i < Math.min(windowSize, sortedData.length); i++) {
    sum += sortedData[i].value;
    const windowLength = i + 1;
    result.push({
      timestamp: sortedData[i].timestamp,
      value: sum / windowLength,
      original: sortedData[i].value
    });
  }
  
  // 残りのデータポイントをスライディングウィンドウで処理
  for (let i = windowSize; i < sortedData.length; i++) {
    // 窓の先頭（出ていく要素）を削除
    sum -= sortedData[i - windowSize].value;
    // 窓の末尾（入ってくる要素）を追加
    sum += sortedData[i].value;
    
    result.push({
      timestamp: sortedData[i].timestamp,
      value: sum / windowSize,
      original: sortedData[i].value
    });
  }
  
  return result;
}

/**
 * Z-scoreを計算
 * @param {Array} data - 計算対象のデータ
 * @param {number} windowSize - 窓サイズ (nullの場合は全データを使用)
 * @param {boolean} isSorted - データが既にタイムスタンプでソート済みかどうか
 * @returns {Array} 計算結果
 */
function calculateZScore(data, windowSize = null, isSorted = false) {
  if (!data || data.length === 0) return [];
  
  // データがソート済みの場合は直接使用、そうでなければソート
  const sortedData = isSorted ? data : [...data].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // windowSizeがnullの場合は全データを使用するモード
  const useFullData = windowSize === null;
  
  const result = [];
  let sum = 0;
  let sumSquared = 0;
  let count = 0;
  
  // 全データモードの場合
  if (useFullData) {
    for (let i = 0; i < sortedData.length; i++) {
      const value = sortedData[i].value;
      sum += value;
      sumSquared += value * value;
      count++;
      
      // 平均と標準偏差を計算
      const mean = sum / count;
      const variance = (sumSquared / count) - (mean * mean);
      const stdDev = Math.sqrt(Math.max(0, variance)); // 負の分散を避ける
      
      // Z-scoreを計算 (標準偏差が0の場合は0を返す)
      const zScore = stdDev === 0 ? 0 : (value - mean) / stdDev;
      
      result.push({
        timestamp: sortedData[i].timestamp,
        value: zScore,
        original: value,
        mean: mean,
        stdDev: stdDev
      });
    }
  }
  // 固定ウィンドウサイズモードの場合
  else {
    // キューを使って窓内の値を保持
    const windowValues = [];
    
    for (let i = 0; i < sortedData.length; i++) {
      const value = sortedData[i].value;
      
      // 窓に新しい値を追加
      windowValues.push(value);
      sum += value;
      sumSquared += value * value;
      
      // 窓がサイズを超えた場合、最も古い値を削除
      if (windowValues.length > windowSize) {
        const oldValue = windowValues.shift();
        sum -= oldValue;
        sumSquared -= oldValue * oldValue;
      }
      
      // 現在の窓のサイズ
      const currentWindowSize = windowValues.length;
      
      // 平均と標準偏差を計算
      const mean = sum / currentWindowSize;
      const variance = (sumSquared / currentWindowSize) - (mean * mean);
      const stdDev = Math.sqrt(Math.max(0, variance)); // 負の分散を避ける
      
      // Z-scoreを計算
      const zScore = stdDev === 0 ? 0 : (value - mean) / stdDev;
      
      result.push({
        timestamp: sortedData[i].timestamp,
        value: zScore,
        original: value,
        mean: mean,
        stdDev: stdDev
      });
    }
  }
  
  return result;
}

/**
 * 偏差値を計算
 * @param {Array} data - 計算対象のデータ
 * @param {number} windowSize - 窓サイズ (nullの場合は全データを使用)
 * @param {boolean} isSorted - データが既にタイムスタンプでソート済みかどうか
 * @returns {Array} 計算結果
 */
function calculateDeviation(data, windowSize = null, isSorted = false) {
  if (!data || data.length === 0) return [];
  
  // Z-scoreを計算（最適化されたバージョンを使用）
  const zScores = calculateZScore(data, windowSize, isSorted);
  
  // 偏差値に変換 (Z-score * 10 + 50)
  return zScores.map(point => ({
    timestamp: point.timestamp,
    value: point.value * 10 + 50,
    original: point.original,
    mean: point.mean,
    stdDev: point.stdDev
  }));
}

module.exports = {
  calculateMovingAverage,
  calculateZScore,
  calculateDeviation
};
