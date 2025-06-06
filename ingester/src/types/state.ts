export interface EquipmentState {
  lastFetchTime?: string; // ISO 8601 format
  lastSuccessTime?: string; // ISO 8601 format
  actualLastDataTime?: string; // ISO 8601 format - 実際に取得したデータの最新時刻
  errorCount: number;
  lastError?: string;
  // シンプルなGap処理
  pendingGapStartDate?: string; // ISO 8601 format - 接続fail時のStartDate
  pendingGapEndDate?: string;   // ISO 8601 format - 接続fail時のEndDate
}

export interface IngesterState {
  equipment: {
    [equipmentName: string]: EquipmentState;
  };
  lastUpdated: string; // ISO 8601 format
}

export interface FetchResult {
  success: boolean;
  data?: string;
  error?: string;
  fetchedCount?: number;
}
