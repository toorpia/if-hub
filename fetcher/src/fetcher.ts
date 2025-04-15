/**
 * Fetcherモジュール
 * コアロジックを実装（Pure関数アプローチ）
 */
import { FetcherParams, FetcherResult } from './types/options';
import { DataPoint } from './types/data';
import { FetcherConfig } from './types/config';
import { ApiClient } from './api-client';
import { validateTags } from './tag-validator';
import { filterDataByConditions } from './filter';
import { CsvFormatter } from './formatters/csv';
import { findLatestCsvFile, extractLastTimestampFromCsv } from './io/file';
import * as path from 'path';

/**
 * コアロジック：データの取得・フィルタリング・出力を行う
 * @param params 取得パラメータ
 * @returns 実行結果
 */
export async function fetchData(params: FetcherParams): Promise<FetcherResult> {
  const { config, equipment, options } = params;
  const startTime = Date.now();
  
  try {
    // 整合性検証
    if (config.tag_validation?.enabled !== false) {
      const validationResult = await validateTags(config, equipment);
      if (!validationResult.valid && config.tag_validation?.stop_on_missing_tag !== false) {
        return {
          success: false,
          error: new Error(`タグ検証エラー: ${validationResult.errors.join(', ')}`)
        };
      }
    }
    
    // 設備の設定を取得
    const equipmentConfig = config.equipment.find((e: FetcherConfig['equipment'][0]) => e.name === equipment);
    if (!equipmentConfig) {
      return {
        success: false,
        error: new Error(`設備 "${equipment}" が設定ファイルに見つかりません`)
      };
    }
    
    // 取得対象のタグリスト
    const tags = equipmentConfig.tags;
    if (tags.length === 0) {
      return {
        success: false,
        error: new Error(`設備 "${equipment}" のタグが設定されていません`)
      };
    }
    
    // 期間設定の解決
    const { start, end } = await resolvePeriod(config, equipment, options);
    console.log(`取得期間: ${start || '最古'} から ${end || '最新'}`);
    
    // APIクライアントの初期化
    const apiClient = new ApiClient(config.if_hub_api);
    
    // データ取得（ページング処理付き）
    console.log(`設備 ${equipment} のタグデータ取得を開始します (${tags.length}タグ)`);
    const data = await apiClient.fetchWithPagination({
      equipment,
      tags,
      start,
      end,
      pageSize: options.page_size || config.if_hub_api.page_size
    });
    
    // 条件フィルタリング
    console.log(`取得完了: ${data.length} レコード`);
    const conditions = equipmentConfig.conditions;
    let filteredData: DataPoint[] = data;
    
    if (conditions) {
      console.log('条件フィルタリングを適用します...');
      filteredData = filterDataByConditions(data, conditions);
      console.log(`フィルタリング後: ${filteredData.length} レコード (${Math.round(filteredData.length / data.length * 100)}%)`);
    }
    
    // ファイル出力
    const formatter = new CsvFormatter(config.output);
    const outputFiles = await formatter.writeData(equipment, filteredData, start, end);
    
    // 処理時間の計算
    const duration = Date.now() - startTime;
    
    // 結果を返す
    return {
      success: true,
      outputFiles,
      stats: {
        totalRecords: data.length,
        filteredRecords: filteredData.length,
        duration
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * 期間設定を解決する
 * @param config 設定
 * @param equipment 設備名
 * @param options ランタイムオプション
 * @returns 開始・終了時刻
 */
async function resolvePeriod(
  config: FetcherConfig, 
  equipment: string,
  options: { start?: string, end?: string, latest?: boolean }
): Promise<{ start?: string, end?: string }> {
  let { start, end, latest } = options;
  
  // --latest オプションが指定された場合、既存ファイルから最終タイムスタンプを取得
  if (latest) {
    const latestTimestamp = await getLatestTimestamp(config, equipment);
    if (latestTimestamp) {
      console.log(`最新データモード: 最終タイムスタンプ ${latestTimestamp} 以降のデータを取得します`);
      start = latestTimestamp;
    } else {
      console.log('最新データモード: 既存ファイルが見つかりません。全期間を取得します。');
    }
  }
  
  // 終了時刻が指定されていない場合は現在時刻とする
  if (!end) {
    end = new Date().toISOString();
  }
  
  return { start, end };
}

/**
 * 設備の既存ファイルから最終タイムスタンプを取得
 * @param config 設定
 * @param equipment 設備名
 * @returns 最終タイムスタンプ、取得できない場合はnull
 */
async function getLatestTimestamp(config: FetcherConfig, equipment: string): Promise<string | null> {
  try {
    // 設備ディレクトリ
    const equipmentDir = path.join(config.output.directory, equipment);
    
    // 最新のCSVファイルを検索
    const latestFile = await findLatestCsvFile(equipmentDir, equipment);
    if (!latestFile) {
      return null;
    }
    
    // ファイルから最終タイムスタンプを抽出
    const lastTimestamp = await extractLastTimestampFromCsv(latestFile);
    
    if (lastTimestamp) {
      // ISO文字列をDateに変換して1ミリ秒進める（開始時刻は含まない）
      const nextDate = new Date(new Date(lastTimestamp).getTime() + 1);
      return nextDate.toISOString();
    }
    
    return null;
  } catch (error) {
    console.error('最終タイムスタンプの取得中にエラーが発生しました:', error);
    return null;
  }
}
