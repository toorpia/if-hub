/**
 * ファイル操作モジュール
 * ファイルの読み書き操作を提供
 */
import * as fs from 'fs';
import * as path from 'path';
import { DataPoint } from '../types/data';
import { convertUtcToLocal } from '../utils/time-utils';

/**
 * ディレクトリが存在しない場合は作成
 * @param dirPath ディレクトリパス
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.promises.access(dirPath);
  } catch (error) {
    // ディレクトリが存在しない場合は作成
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`ディレクトリを作成しました: ${dirPath}`);
  }
}

/**
 * データポイントの配列からCSVコンテンツを生成
 * @param data データポイント配列
 * @param includeTags タグ名をカラムに含めるかどうか
 * @returns CSVコンテンツ
 */
export function generateCsvContent(data: DataPoint[], includeTags: boolean = true): string {
  if (data.length === 0) {
    return 'timestamp,value';
  }

  // ユニークなタグのリストを取得
  const uniqueTags = new Set<string>();
  for (const point of data) {
    if (point.tag) {
      uniqueTags.add(point.tag);
    }
  }
  const tagsList = Array.from(uniqueTags);

  // 複数タグの場合は各タグを別カラムに
  if (includeTags && tagsList.length > 1) {
    // データをタイムスタンプでグループ化
    const groupedByTimestamp: Record<string, Record<string, number | null>> = {};
    
    for (const point of data) {
      if (!point.tag) continue;
      
      if (!groupedByTimestamp[point.timestamp]) {
        groupedByTimestamp[point.timestamp] = {};
      }
      
      groupedByTimestamp[point.timestamp][point.tag] = point.value;
    }

    // ヘッダー行: timestamp + タグ名のリスト
    const headerRow = ['timestamp', ...tagsList].join(',');
    
    // データ行
    const rows = Object.entries(groupedByTimestamp).map(([timestamp, values]) => {
      const rowValues = tagsList.map(tag => {
        const value = values[tag];
        return value === null ? '' : value;
      });
      
      // タイムスタンプをローカル時刻に変換
      const localTimestamp = convertUtcToLocal(timestamp);
      return [localTimestamp, ...rowValues].join(',');
    });

    return [headerRow, ...rows].join('\n');
  } 
  // 単一タグまたはタグなしの場合はシンプルなフォーマット
  else {
    // タイムスタンプでソート
    const sortedData = [...data].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // ヘッダー行
    const header = includeTags && tagsList.length === 1 
      ? 'timestamp,tag,value' 
      : 'timestamp,value';
    
    // データ行
    const rows = sortedData.map(point => {
      // タイムスタンプをローカル時刻に変換
      const localTimestamp = convertUtcToLocal(point.timestamp);
      
      if (includeTags && tagsList.length === 1) {
        return `${localTimestamp},${point.tag || ''},${point.value === null ? '' : point.value}`;
      } else {
        return `${localTimestamp},${point.value === null ? '' : point.value}`;
      }
    });

    return [header, ...rows].join('\n');
  }
}

/**
 * 指定されたデータバッチをCSVファイルに書き込む
 * @param filePath ファイルパス
 * @param data データポイント配列
 * @param includeTags タグ名をカラムに含めるかどうか
 */
export async function writeDataToCsv(filePath: string, data: DataPoint[], includeTags: boolean = true): Promise<void> {
  try {
    // ディレクトリが存在するか確認
    const dirPath = path.dirname(filePath);
    await ensureDirectoryExists(dirPath);

    // CSVコンテンツを生成
    const csvContent = generateCsvContent(data, includeTags);

    // ファイルに書き込み
    await fs.promises.writeFile(filePath, csvContent, 'utf-8');
  } catch (error) {
    console.error(`CSVファイルの書き込み中にエラーが発生しました: ${filePath}`, error);
    throw new Error(`ファイル書き込みエラー: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * CSVファイルから最終タイムスタンプを抽出
 * @param filePath CSVファイルパス
 * @returns 最終タイムスタンプ、取得できない場合はnull
 */
export async function extractLastTimestampFromCsv(filePath: string): Promise<string | null> {
  try {
    // ファイルが存在するか確認
    await fs.promises.access(filePath);

    // ファイルの内容を読み込み
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    // ヘッダー行を除いた最後の行を取得
    if (lines.length <= 1) {
      return null; // ヘッダー行のみ
    }

    const lastLine = lines[lines.length - 1];
    const columns = lastLine.split(',');

    // 最初のカラムがタイムスタンプと仮定
    const timestamp = columns[0].trim();
    if (!isValidTimestamp(timestamp)) {
      return null;
    }

    return timestamp;
  } catch (error) {
    // ファイルが存在しない場合など
    return null;
  }
}

/**
 * 文字列がタイムスタンプとして有効かチェック
 * @param timestamp タイムスタンプ文字列
 * @returns 有効な場合はtrue
 */
function isValidTimestamp(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

/**
 * ディレクトリ内の最新のCSVファイルを検索
 * @param dirPath ディレクトリパス
 * @param prefix ファイル名のプレフィックス
 * @returns 最新のCSVファイルパス、見つからない場合はnull
 */
export async function findLatestCsvFile(dirPath: string, prefix: string): Promise<string | null> {
  try {
    // ディレクトリが存在するか確認
    await fs.promises.access(dirPath);

    // ディレクトリ内のファイル一覧を取得
    const files = await fs.promises.readdir(dirPath);
    
    // プレフィックスに一致し、拡張子が.csvのファイルをフィルタリング
    const csvFiles = files.filter(file => 
      file.startsWith(prefix) && file.endsWith('.csv')
    );

    if (csvFiles.length === 0) {
      return null;
    }

    // ファイルの最終更新日時でソート
    const sortedFiles = await Promise.all(
      csvFiles.map(async file => {
        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        return { path: filePath, mtime: stats.mtime };
      })
    );

    sortedFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // 最新のファイルを返す
    return sortedFiles[0].path;
  } catch (error) {
    // ディレクトリが存在しない場合など
    return null;
  }
}
