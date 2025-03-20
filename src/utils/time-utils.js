// src/utils/time-utils.js

/**
 * タイムシフト関数（過去データを現在時刻にシフト）
 * @param {Array} tagData タグデータの配列
 * @param {boolean} shiftToPresent 現在時刻にシフトするかどうか
 * @returns {Array} シフトされたタグデータの配列
 */
function getTimeShiftedData(tagData, shiftToPresent = true) {
  if (!tagData || tagData.length === 0) return [];
  
  if (!shiftToPresent) return tagData;
  
  const now = new Date();
  
  // データの時間範囲を取得
  const timestamps = tagData.map(point => new Date(point.timestamp).getTime());
  const oldestTime = new Date(Math.min(...timestamps));
  const newestTime = new Date(Math.max(...timestamps));
  
  // 最新時刻が現在になるようにシフト
  const timeShift = now - newestTime;
  
  return tagData.map(point => ({
    timestamp: new Date(new Date(point.timestamp).getTime() + timeShift),
    value: point.value
  }));
}

/**
 * 時間範囲でフィルタリング
 * @param {Array} data データの配列
 * @param {string} startTime 開始時間
 * @param {string} endTime 終了時間
 * @returns {Array} フィルタリングされたデータの配列
 */
function filterByTimeRange(data, startTime, endTime) {
  if (!startTime && !endTime) return data;
  
  const start = startTime ? new Date(startTime) : new Date(0);
  const end = endTime ? new Date(endTime) : new Date();
  
  return data.filter(point => {
    const pointTime = new Date(point.timestamp);
    return pointTime >= start && pointTime <= end;
  });
}

module.exports = {
  getTimeShiftedData,
  filterByTimeRange
};
