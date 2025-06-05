import * as cron from 'node-cron';
import { ConfigLoader } from './services/config-loader';
import { PIApiClient } from './services/pi-api-client';
import { StateManager } from './services/state-manager';
import { CSVOutputService } from './services/csv-output';
import { CommonConfig, EquipmentConfig, PIApiRequest } from './types/config';
import { FetchResult } from './types/state';

export class DataIngestionScheduler {
  private configLoader: ConfigLoader;
  private piApiClient: PIApiClient;
  private stateManager: StateManager;
  private csvOutput: CSVOutputService;
  private commonConfig: CommonConfig;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

  constructor() {
    this.configLoader = new ConfigLoader();
    this.stateManager = new StateManager();
    this.csvOutput = new CSVOutputService();
    
    // 共通設定を読み込み
    this.commonConfig = this.configLoader.loadCommonConfig();
    this.piApiClient = new PIApiClient(this.commonConfig);
  }

  /**
   * 全ての設備のスケジュールを開始
   */
  async startScheduler(): Promise<void> {
    console.log('=== Starting PI Data Ingestion Scheduler ===');
    
    // 出力ディレクトリの確認
    const outputInfo = this.csvOutput.getOutputDirectoryInfo();
    console.log(`Output directory: ${outputInfo.path} (exists: ${outputInfo.exists}, writable: ${outputInfo.writable})`);
    
    if (!outputInfo.writable) {
      throw new Error(`Output directory is not writable: ${outputInfo.path}`);
    }

    // 利用可能な設備設定を取得
    const equipmentConfigs = this.configLoader.getAvailableEquipmentConfigs();
    console.log(`Found ${equipmentConfigs.length} equipment configurations:`);
    
    for (const { equipment } of equipmentConfigs) {
      console.log(`  - ${equipment}`);
    }

    if (equipmentConfigs.length === 0) {
      console.warn('No valid equipment configurations found. Scheduler will wait for configurations.');
      return;
    }

    // 各設備のスケジュールを設定
    for (const { equipment } of equipmentConfigs) {
      await this.scheduleEquipment(equipment);
    }

    console.log('=== Scheduler started successfully ===');
  }

  /**
   * 個別設備のスケジュールを設定
   */
  private async scheduleEquipment(equipmentName: string): Promise<void> {
    try {
      const equipmentConfig = this.configLoader.loadEquipmentConfig(equipmentName);
      const interval = equipmentConfig.basemap.addplot.interval;
      const intervalSeconds = this.configLoader.parseInterval(interval);
      
      const equipmentKey = equipmentName;
      
      console.log(`Setting up schedule for ${equipmentKey}: every ${interval} (${intervalSeconds}s)`);

      // 初回実行
      console.log(`Performing initial fetch for ${equipmentKey}...`);
      await this.fetchDataForEquipment(equipmentName, equipmentConfig);

      // cron式に変換してスケジュール
      const cronExpression = this.intervalToCronExpression(intervalSeconds);
      console.log(`Cron expression for ${equipmentKey}: ${cronExpression}`);
      
      const task = cron.schedule(cronExpression, async () => {
        console.log(`\n=== Scheduled fetch for ${equipmentKey} ===`);
        await this.fetchDataForEquipment(equipmentName, equipmentConfig);
      }, {
        scheduled: true,
        timezone: 'Asia/Tokyo'
      });

      this.scheduledTasks.set(equipmentKey, task);
      console.log(`Scheduled task created for ${equipmentKey}`);

    } catch (error) {
      console.error(`Failed to schedule equipment ${equipmentName}:`, error);
    }
  }

  /**
   * 設備のデータを取得
   */
  private async fetchDataForEquipment(
    equipmentName: string,
    equipmentConfig: EquipmentConfig
  ): Promise<FetchResult> {
    const equipmentKey = equipmentName;
    const fetchTime = new Date();
    
    try {
      // 取得期間を決定
      const { startTime, endTime } = this.calculateFetchPeriod(equipmentKey);
      
      console.log(`Fetching data for ${equipmentKey}: ${startTime.toISOString()} to ${endTime.toISOString()}`);

      // PI-APIリクエストを作成
      const request: PIApiRequest = {
        TagNames: this.piApiClient.formatTagNames(equipmentConfig.basemap.source_tags),
        StartDate: this.piApiClient.formatDateForPI(startTime),
        EndDate: this.piApiClient.formatDateForPI(endTime),
      };

      // データ取得
      const response = await this.piApiClient.fetchData(request);

      if (response.success && response.data) {
        // CSV検証
        const validation = this.csvOutput.validateCSVData(response.data);
        if (!validation.valid) {
          throw new Error(`Invalid CSV data: ${validation.error}`);
        }

        console.log(`Received valid CSV data: ${validation.lineCount} lines`);

        // ファイル出力（自動ファイル名: {設備名}.csv）
        const outputFilename = `${equipmentName}.csv`;
        await this.csvOutput.writeCSVFile(outputFilename, response.data);

        // 成功状態を記録
        this.stateManager.updateFetchSuccess(equipmentKey, fetchTime);

        console.log(`✅ Successfully processed ${equipmentKey}: ${validation.lineCount} records`);
        
        return {
          success: true,
          data: response.data,
          fetchedCount: validation.lineCount,
        };

      } else {
        throw new Error(response.error || 'Unknown API error');
      }

    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`❌ Failed to fetch data for ${equipmentKey}: ${errorMessage}`);
      
      // エラー状態を記録
      this.stateManager.updateFetchError(equipmentKey, fetchTime, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 取得期間を計算
   */
  private calculateFetchPeriod(equipmentKey: string): { startTime: Date; endTime: Date } {
    const now = new Date();
    const marginMs = this.commonConfig.data_acquisition.fetch_margin_seconds * 1000;
    const endTime = new Date(now.getTime() - marginMs);

    // 前回取得時刻を確認
    const lastFetchTime = this.stateManager.getLastFetchTime(equipmentKey);
    
    let startTime: Date;
    
    if (lastFetchTime) {
      // 前回取得時刻から継続
      startTime = new Date(lastFetchTime.getTime() + 1000); // 1秒後から
    } else {
      // 初回取得：最大履歴日数から開始
      const maxHistoryDays = this.commonConfig.data_acquisition.max_history_days;
      startTime = this.stateManager.calculateInitialFetchTime(maxHistoryDays);
      console.log(`Initial fetch for ${equipmentKey}, going back ${maxHistoryDays} days`);
    }

    return { startTime, endTime };
  }

  /**
   * インターバル秒数をcron式に変換
   */
  private intervalToCronExpression(intervalSeconds: number): string {
    if (intervalSeconds < 60) {
      // 秒単位（cronでは表現不可のため分単位に切り上げ）
      return '* * * * *'; // 毎分
    } else if (intervalSeconds < 3600) {
      // 分単位
      const minutes = Math.floor(intervalSeconds / 60);
      if (60 % minutes === 0) {
        return `*/${minutes} * * * *`;
      } else {
        return '* * * * *'; // 毎分（近似）
      }
    } else if (intervalSeconds < 86400) {
      // 時間単位
      const hours = Math.floor(intervalSeconds / 3600);
      if (24 % hours === 0) {
        return `0 */${hours} * * *`;
      } else {
        return '0 * * * *'; // 毎時（近似）
      }
    } else {
      // 日単位
      const days = Math.floor(intervalSeconds / 86400);
      return `0 0 */${days} * *`;
    }
  }

  /**
   * スケジューラーを停止
   */
  stopScheduler(): void {
    console.log('Stopping scheduler...');
    
    for (const [equipmentKey, task] of this.scheduledTasks) {
      task.stop();
      console.log(`Stopped schedule for ${equipmentKey}`);
    }
    
    this.scheduledTasks.clear();
    console.log('Scheduler stopped');
  }

  /**
   * スケジューラーの状態を取得
   */
  getSchedulerStatus(): { 
    equipmentCount: number; 
    runningTasks: string[]; 
    state: any 
  } {
    return {
      equipmentCount: this.scheduledTasks.size,
      runningTasks: Array.from(this.scheduledTasks.keys()),
      state: this.stateManager.getCurrentState(),
    };
  }
}
