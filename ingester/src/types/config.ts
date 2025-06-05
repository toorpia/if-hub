export interface CommonConfig {
  pi_api: {
    host: string;
    port: number;
    timeout: number;
    max_retries: number;
    retry_interval: number;
  };
  logging: {
    level: string;
    file: string;
  };
  data_acquisition: {
    fetch_margin_seconds: number;
    max_history_days: number;
  };
}

export interface EquipmentConfig {
  basemap: {
    update: {
      type: "fix" | "periodic";
      interval?: string;
      begin?: string;
      end?: string;
    };
    heatmap: {
      effective_radius: number;
      z_axis: number;
      resolution: number;
    };
    detabn: {
      mw: number;
      rt: number;
      th: number;
      manual_mask: number[][];
    };
    ignore_period: Array<{
      start: string;
      end: string;
    }>;
    area: Array<{
      type: string;
      x: number;
      y: number;
      radX: number;
      radY: number;
      rot: number;
    }>;
    addplot: {
      interval: string;
      lookback_period: string;
    };
    source_tags: string[];
    gtags: string[];
  };
  pi_integration: {
    enabled: boolean;
    output_filename: string;
  };
}

export interface PIApiRequest {
  TagNames: string;
  StartDate: string;
  EndDate: string;
}

export interface PIApiResponse {
  success: boolean;
  data?: string; // CSV data
  error?: string;
}
