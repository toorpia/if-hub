/**
 * データポイントおよび関連型定義
 */

export interface DataPoint {
  timestamp: string;
  value: number | null;
  tag?: string;
  equipment?: string;
}

export interface DataBatch {
  equipment: string;
  tags: string[];
  data: DataPoint[];
  startTimestamp: string;
  endTimestamp: string;
}

/**
 * タイムスタンプでグループ化されたデータポイント
 * timestamp -> { tag -> DataPoint }
 */
export interface GroupedDataPoints {
  [timestamp: string]: {
    [tag: string]: DataPoint;
  };
}

/**
 * タグ整合性検証結果
 */
export interface TagValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * APIレスポンス型
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * タグデータAPIレスポンス型
 */
export interface TagDataResponse {
  tagId: string;
  metadata: {
    id: number;
    name: string;
    equipment: string;
    unit?: string;
    description?: string;
    is_gtag?: boolean;
  };
  data: Array<{
    timestamp: string;
    value: number | null;
  }>;
}

/**
 * タグ一覧APIレスポンス型
 */
export interface TagsListResponse {
  tags: Array<{
    id: number;
    name: string;
    equipment: string;
    source_tag?: string;
    unit?: string;
    is_gtag?: boolean;
  }>;
}
