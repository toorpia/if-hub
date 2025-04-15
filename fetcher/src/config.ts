/**
 * 設定ファイル読み込み・解析モジュール
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { FetcherConfig } from './types/config';

/**
 * デフォルト設定値
 */
const defaultConfig: FetcherConfig = {
  equipment: [],
  output: {
    format: 'csv',
    directory: './data',
    max_rows_per_file: 100000,
    timestamp_format: 'YYYYMMDD_HHmmss'
  },
  if_hub_api: {
    base_url: 'http://localhost:3000',
    timeout: 5000,
    max_records_per_request: 10000,
    page_size: 1000
  },
  tag_validation: {
    enabled: true,
    stop_on_missing_tag: true
  }
};

/**
 * 設定ファイルを読み込み、解析する
 * @param configPath 設定ファイルのパス（デフォルト: './config.yaml'）
 * @returns 設定オブジェクト
 */
export async function loadConfig(configPath: string = './config.yaml'): Promise<FetcherConfig> {
  try {
    // ファイルの存在確認
    if (!fs.existsSync(configPath)) {
      console.warn(`警告: 設定ファイル ${configPath} が見つかりません。デフォルト設定を使用します。`);
      return { ...defaultConfig };
    }

    // ファイル読み込み
    const fileContent = await fs.promises.readFile(configPath, 'utf-8');
    
    // YAML解析
    const parsedConfig = yaml.load(fileContent) as Partial<FetcherConfig>;
    
    // デフォルト値とマージ
    const mergedConfig = mergeWithDefaults(parsedConfig);
    
    // 設定の検証
    validateConfig(mergedConfig);
    
    return mergedConfig;
  } catch (error) {
    console.error('設定ファイルの読み込み中にエラーが発生しました:', error);
    throw new Error(`設定ファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * ユーザー設定とデフォルト設定をマージする
 * @param userConfig ユーザー設定
 * @returns マージされた設定
 */
function mergeWithDefaults(userConfig: Partial<FetcherConfig>): FetcherConfig {
  // ログを追加して設定値を確認
  if (userConfig.output && userConfig.output.directory) {
    console.log(`設定ファイルに指定された出力ディレクトリ: ${userConfig.output.directory}`);
  }
  
  // マージ済み設定を作成
  const mergedConfig = {
    equipment: userConfig.equipment || defaultConfig.equipment,
    output: {
      ...defaultConfig.output,
      ...userConfig.output
    },
    if_hub_api: {
      ...defaultConfig.if_hub_api,
      ...userConfig.if_hub_api
    },
    tag_validation: {
      ...defaultConfig.tag_validation,
      ...userConfig.tag_validation
    }
  };
  
  // マージ後の値をログ出力
  console.log(`マージ後の出力ディレクトリ: ${mergedConfig.output.directory}`);
  
  return mergedConfig;
}

/**
 * 設定の基本的な検証を行う
 * @param config 検証する設定
 * @throws 検証エラー
 */
function validateConfig(config: FetcherConfig): void {
  // 設備が定義されているか確認
  if (!config.equipment || config.equipment.length === 0) {
    console.warn('警告: 設定ファイルに設備が定義されていません。');
  }

  // 設備定義の検証
  config.equipment.forEach((equipment, index) => {
    if (!equipment.name) {
      throw new Error(`設備定義 #${index + 1} に name が指定されていません。`);
    }
    
    if (!equipment.tags || equipment.tags.length === 0) {
      console.warn(`警告: 設備 "${equipment.name}" にタグが定義されていません。`);
    }
  });

  // APIベースURLの検証
  if (!config.if_hub_api.base_url) {
    throw new Error('if_hub_api.base_url が指定されていません。');
  }

  // 出力ディレクトリの検証
  if (!config.output.directory) {
    throw new Error('output.directory が指定されていません。');
  }
}

/**
 * 設定から特定の設備の設定を取得する
 * @param config 設定オブジェクト
 * @param equipmentName 設備名
 * @returns 設備設定、見つからない場合はundefined
 */
export function getEquipmentConfig(config: FetcherConfig, equipmentName: string): FetcherConfig['equipment'][0] | undefined {
  return config.equipment.find(eq => eq.name === equipmentName);
}

/**
 * 設定から特定の設備のタグリストを取得する
 * @param config 設定オブジェクト
 * @param equipmentName 設備名
 * @returns タグリスト
 */
export function getEquipmentTags(config: FetcherConfig, equipmentName: string): string[] {
  const equipment = getEquipmentConfig(config, equipmentName);
  return equipment?.tags || [];
}

/**
 * 設定から特定の設備の条件を取得する
 * @param config 設定オブジェクト
 * @param equipmentName 設備名
 * @returns 条件設定
 */
export function getEquipmentConditions(config: FetcherConfig, equipmentName: string): FetcherConfig['equipment'][0]['conditions'] | undefined {
  const equipment = getEquipmentConfig(config, equipmentName);
  return equipment?.conditions;
}
