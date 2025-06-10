/**
 * タグ整合性検証モジュール
 */
import { ApiClient } from './api-client';
import { FetcherConfig } from './types/config';
import { TagValidationResult } from './types/data';

/**
 * 指定された設備のタグを検証する
 * @param config Fetcher設定
 * @param equipment 設備名
 * @returns 検証結果
 */
export async function validateTags(
  config: FetcherConfig,
  equipment: string
): Promise<TagValidationResult> {
  const equipmentConfig = getEquipmentConfig(config, equipment);
  if (!equipmentConfig) {
    return {
      valid: false,
      errors: [`設備 "${equipment}" が設定ファイルに見つかりません`],
      warnings: []
    };
  }

  try {
    // APIクライアントの初期化
    const apiClient = new ApiClient(config.if_hub_api);

    // IF-HUBから利用可能なタグリストを取得
    const availableTags = await apiClient.fetchAvailableTags(equipment);
    console.log(`設備 ${equipment} の利用可能なタグ: ${availableTags.length}件`);

    // 存在チェック
    const errors: string[] = [];
    const warnings: string[] = [];

    // 設定ファイルのタグが設定されている場合のみチェック
    if (equipmentConfig.tags.length > 0) {
      for (const tag of equipmentConfig.tags) {
        if (!availableTags.includes(tag)) {
          errors.push(`タグ "${tag}" が設備 "${equipment}" に存在しません`);
        }
      }
    } else {
      // タグが設定されていない場合は動的取得モードであることを通知
      console.log(`設備 "${equipment}" はタグ動的取得モードです (利用可能タグ: ${availableTags.length}件)`);
      if (availableTags.length === 0) {
        errors.push(`設備 "${equipment}" に利用可能なタグが存在しません`);
      }
    }


    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    console.error(`タグ検証中にエラーが発生しました:`, error);
    return {
      valid: false,
      errors: [`タグ検証中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`],
      warnings: []
    };
  }
}

/**
 * 設定から特定の設備の設定を取得する
 * @param config 設定オブジェクト
 * @param equipmentName 設備名
 * @returns 設備設定、見つからない場合はundefined
 */
function getEquipmentConfig(config: FetcherConfig, equipmentName: string): FetcherConfig['equipment'][0] | undefined {
  return config.equipment.find(eq => eq.name === equipmentName);
}

/**
 * 設定から特定の設備のタグを取得する
 * @param config 設定オブジェクト
 * @param equipmentName 設備名
 * @returns タグリスト
 */
export function getEquipmentTags(config: FetcherConfig, equipmentName: string): string[] {
  const equipment = getEquipmentConfig(config, equipmentName);
  return equipment?.tags || [];
}
