export interface EquipmentState {
  lastFetchTime?: string; // ISO 8601 format
  lastSuccessTime?: string; // ISO 8601 format
  errorCount: number;
  lastError?: string;
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
