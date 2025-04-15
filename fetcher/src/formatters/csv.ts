/**
 * CSVフォーマッタ
 * データポイントをCSVファイルに出力するモジュール
 */
import * as path from 'path';
import { DataPoint } from '../types/data';
import { OutputConfig } from '../types/config';
import { 
  ensureDirectoryExists, 
  writeDataToCsv,
  extractLastTimestampFromCsv
} from '../io/file';

/**
 * CSVフォーマッタクラス
 */
export class CsvFormatter {
  /**
   * @param config 出力設定
   */
  constructor(private config: OutputConfig) {}

  /**
   * データをCSVファイルに書き込む
   * @param equipment 設備名
   * @param data データポイント配列
   * @param startTime 開始時刻（ISO 8601形式）
   * @param endTime 終了時刻（ISO 8601形式）
   * @returns 出力ファイルパスの配列
   */
  async writeData(
    equipment: string,
    data: DataPoint[],
    startTime?: string,
    endTime?: string
  ): Promise<string[]> {
    try {
      // 空のデータの場合、早期リターン
      if (!data || data.length === 0) {
        console.warn(`警告: 設備 ${equipment} のデータがありません。`);
        return [];
      }

      // 設備ごとのディレクトリを作成
      const equipmentDir = path.join(this.config.directory, equipment);
      await ensureDirectoryExists(equipmentDir);

      // データをソート
      const sortedData = this.sortDataByTimestamp(data);

      // データを最大行数ごとのバッチに分割
      const batches = this.splitDataIntoBatches(sortedData, this.config.max_rows_per_file);
      console.log(`設備 ${equipment} のデータを ${batches.length} 個のファイルに分割します (最大行数: ${this.config.max_rows_per_file})`);

      const outputFiles: string[] = [];
      
      // 各バッチをファイルに書き込み
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (batch.length === 0) continue;

        // ファイル名の生成
        const filename = this.generateFilename(equipment, batch);
        const filePath = path.join(equipmentDir, filename);

        // CSVファイルに書き込み
        await writeDataToCsv(filePath, batch, true);
        outputFiles.push(filePath);

        console.log(`[${i + 1}/${batches.length}] ファイル作成: ${filename} (${batch.length} レコード)`);
      }

      return outputFiles;
    } catch (error) {
      console.error(`データの書き込み中にエラーが発生しました:`, error);
      throw new Error(`ファイル出力エラー: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * データをタイムスタンプでソート
   * @param data ソート対象のデータ
   * @returns ソートされたデータ
   */
  private sortDataByTimestamp(data: DataPoint[]): DataPoint[] {
    return [...data].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * データを指定行数のバッチに分割
   * @param data データポイント配列
   * @param maxRowsPerFile 1ファイルあたりの最大行数
   * @returns バッチの配列
   */
  private splitDataIntoBatches(data: DataPoint[], maxRowsPerFile: number): DataPoint[][] {
    const batches: DataPoint[][] = [];
    
    // 最大行数が0以下の場合は分割なし
    if (maxRowsPerFile <= 0) {
      return [data];
    }

    // データを最大行数ごとに分割
    for (let i = 0; i < data.length; i += maxRowsPerFile) {
      const batch = data.slice(i, i + maxRowsPerFile);
      batches.push(batch);
    }

    return batches;
  }

  /**
   * ファイル名を生成
   * @param equipment 設備名
   * @param batch データバッチ
   * @returns ファイル名
   */
  private generateFilename(equipment: string, batch: DataPoint[]): string {
    if (batch.length === 0) {
      return `${equipment}_empty.csv`;
    }

    // バッチ内の最初と最後のデータポイントのタイムスタンプを使用
    const firstPoint = batch[0];
    const lastPoint = batch[batch.length - 1];

    const firstTimestamp = this.formatTimestamp(firstPoint.timestamp);
    const lastTimestamp = this.formatTimestamp(lastPoint.timestamp);

    return `${equipment}_${firstTimestamp}-${lastTimestamp}.csv`;
  }

  /**
   * ISO形式のタイムスタンプをファイル名用にフォーマット
   * @param isoString ISO 8601形式のタイムスタンプ
   * @returns フォーマットされたタイムスタンプ
   */
  private formatTimestamp(isoString: string): string {
    // 例: '2023-01-01T00:00:00Z' → '20230101_000000'
    const date = new Date(isoString);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }
}
