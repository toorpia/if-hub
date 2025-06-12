/**
 * Fetcherモジュール
 * コアロジックを実装（Pure関数アプローチ）
 */
import { FetcherParams, FetcherResult } from './types/options';
import { DataPoint } from './types/data';
import { FetcherConfig } from './types/config';
import { ApiClient } from './api-client';
import { validateTags } from './tag-validator';
import { CsvFormatter } from './formatters/csv';
import { findLatestCsvFile, extractLastTimestampFromCsv } from './io/file';
import { parseFilterExpression, extractTagNames, filterData, generateFilterStats, validateRequiredTags } from './filter';
import * as path from 'path';

/**
 * コアロジック：データの取得・出力を行う
 * @param params 取得パラメータ
 * @returns 実行結果
 */
export async function fetchData(params: FetcherParams): Promise<FetcherResult> {
  const { config, equipment, options } = params;
  const startTime = Date.now();
  
  try {
    // フィルタ条件の解析（早期に実行してエラーチェック）
    let filterExpression = null;
    let filterRequiredTags: string[] = [];
    
    if ('filter' in options && options.filter) {
      try {
        filterExpression = parseFilterExpression(options.filter, equipment);
        filterRequiredTags = extractTagNames(filterExpression);
        console.log(`フィルタ条件: ${options.filter}`);
        console.log(`フィルタ必要タグ: ${filterRequiredTags.join(', ')}`);
      } catch (error) {
        return {
          success: false,
          error: new Error(`フィルタ条件の解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
        };
      }
    }
    
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
    let tags = equipmentConfig.tags;
    
    // タグが設定されていない場合は、IF-Hub APIから動的取得
    if (tags.length === 0) {
      console.log(`設備 "${equipment}" のタグが設定されていません。IF-Hub APIから動的取得します...`);
      try {
        const apiClient = new ApiClient(config.if_hub_api);
        tags = await apiClient.fetchAvailableTags(equipment);
        console.log(`動的取得完了: ${tags.length}個のタグを取得しました`);
        
        if (tags.length === 0) {
          return {
            success: false,
            error: new Error(`設備 "${equipment}" にタグが存在しません`)
          };
        }
      } catch (error) {
        return {
          success: false,
          error: new Error(`設備 "${equipment}" のタグ取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
        };
      }
    }
    
    // フィルタに必要なタグを追加
    if (filterRequiredTags.length > 0) {
      const allTags = new Set([...tags, ...filterRequiredTags]);
      tags = Array.from(allTags);
      console.log(`フィルタ条件により追加タグを含めて取得: ${tags.length}タグ`);
    }
    
    // 期間設定の解決
    const { start, end } = await resolvePeriod(config, equipment, options);
    console.log(`取得期間: ${start || '最古'} から ${end || '最新'}`);
    
    // APIクライアントの初期化
    const apiClient = new ApiClient(config.if_hub_api);
    
    // データ取得（ページング処理付き）
    console.log(`設備 ${equipment} のタグデータ取得を開始します (${tags.length}タグ)`);
    let data = await apiClient.fetchWithPagination({
      equipment,
      tags,
      start,
      end,
      pageSize: options.page_size || config.if_hub_api.page_size
    });
    
    // データ取得完了ログ
    const uniqueTimestamps = new Set(data.map(point => point.timestamp));
    console.log(`取得完了: ${data.length} データポイント (${uniqueTimestamps.size} タイムスタンプ)`);
    
    // フィルタリング処理
    let originalDataCount = data.length;
    if (filterExpression) {
      // フィルタに必要なタグの存在確認
      const missingTags = validateRequiredTags(data, filterRequiredTags);
      if (missingTags.length > 0) {
        console.warn(`警告: フィルタに必要なタグが見つかりません: ${missingTags.join(', ')}`);
        console.warn('フィルタ条件を満たすデータは存在しない可能性があります');
      }
      
      // フィルタリング実行
      console.log('フィルタリング処理を開始します...');
      data = filterData(data, filterExpression);
      
      // フィルタリング結果のログ
      const filterStats = generateFilterStats(originalDataCount, data.length);
      console.log(filterStats);
    }
    
    // ファイル出力
    const formatter = new CsvFormatter(config.output);
    const outputFiles = await formatter.writeData(equipment, data, start, end);
    
    // 処理時間の計算
    const duration = Date.now() - startTime;
    
    // 結果を返す
    return {
      success: true,
      outputFiles,
      stats: {
        totalRecords: data.length,
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
