/**
 * Fetcher設定ファイルの型定義
 */

export interface FetcherConfig {
  equipment: EquipmentConfig[];
  output: OutputConfig;
  if_hub_api: ApiConfig;
  tag_validation?: TagValidationConfig;
}

export interface EquipmentConfig {
  name: string;
  tags: string[];
  conditions?: ConditionsConfig;
}

export interface ConditionsConfig {
  only_when?: FilterCondition[];
}

export interface FilterCondition {
  tag: string;
  condition: string;
}

export interface OutputConfig {
  format: 'csv' | 'json';
  directory: string;
  max_rows_per_file: number;
  timestamp_format: string;
}

export interface ApiConfig {
  base_url: string;
  timeout: number;
  max_records_per_request: number;
  page_size: number;
}

export interface TagValidationConfig {
  enabled?: boolean;
  stop_on_missing_tag?: boolean;
}
