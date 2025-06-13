/**
 * 時刻処理ユーティリティ
 */

/**
 * YYYYMMDDHHmm形式のローカル時刻をUTC時刻（ISO文字列）に変換
 * @param dateTimeStr YYYYMMDDHHmm形式の文字列（例: "202301010000"）
 * @returns UTC時刻のISO文字列
 */
export function convertLocalToUtc(dateTimeStr: string): string {
  // YYYYMMDDHHmm形式から各部分を抽出
  const year = parseInt(dateTimeStr.substring(0, 4), 10);
  const month = parseInt(dateTimeStr.substring(4, 6), 10);
  const day = parseInt(dateTimeStr.substring(6, 8), 10);
  const hour = parseInt(dateTimeStr.substring(8, 10), 10);
  const minute = parseInt(dateTimeStr.substring(10, 12), 10);
  
  // ローカル時間としてDateオブジェクトを作成し、UTCに変換
  const localDate = new Date(year, month - 1, day, hour, minute);
  
  // ISO文字列として返す（自動的にUTCに変換される）
  return localDate.toISOString();
}

/**
 * UTC時刻をシステムのローカルタイムに変換
 * @param utcTimestamp UTC時刻のISO文字列
 * @returns ローカル時刻の文字列（YYYY-MM-DD HH:mm:ss形式）
 */
export function convertUtcToLocal(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);
  
  // 手動で YYYY-MM-DD HH:mm:ss 形式を構築（システム環境に依存しない固定フォーマット）
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * UTC時刻をローカルタイムに変換してファイル名用フォーマットで返す
 * @param utcTimestamp UTC時刻のISO文字列
 * @returns ローカル時刻の文字列（YYYYMMDD_HHmmss形式）
 */
export function convertUtcToLocalForFilename(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);
  
  // システムのローカルタイムで各要素を取得
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
