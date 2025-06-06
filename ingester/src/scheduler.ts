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

    // 起動時の状態同期を実行
    console.log('=== Performing startup state synchronization ===');
    await this.performStartupSync(equipmentConfigs.map(config => config.equipment));

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
        console.log(`Received CSV data from PI-API: ${response.data.split('\n').length} lines`);

        // 実際に取得したデータの時刻範囲を抽出
        const { actualStartTime, actualEndTime } = this.extractActualDataTimeRange(response.data);

        // ファイル出力（自動ファイル名: {設備名}.csv）
        const outputFilename = `${equipmentName}.csv`;
        
        // PI-APIからの生データを処理してIF-HUB形式に変換、メタデータを抽出・更新
        const processResult = await this.csvOutput.processAndWriteRawCSV(outputFilename, response.data);

        if (!processResult.success) {
          throw new Error(`CSV processing failed: ${processResult.error}`);
        }

        // 成功状態を記録
        this.stateManager.updateFetchSuccess(equipmentKey, fetchTime);

        // 実際に取得したデータの最新時刻を記録（境界欠落防止）
        if (actualEndTime) {
          this.stateManager.updateActualDataTime(equipmentKey, actualEndTime);
        }

        // Gap処理：接続成功時は保留中のGapをクリア
        this.stateManager.clearPendingGap(equipmentKey);

        console.log(`✅ Successfully processed ${equipmentKey}: ${processResult.processedLineCount} records, ${processResult.extractedMetadataCount} metadata entries`);
        
        return {
          success: true,
          data: response.data,
          fetchedCount: processResult.processedLineCount || 0,
        };

      } else {
        throw new Error(response.error || 'Unknown API error');
      }

    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`❌ Failed to fetch data for ${equipmentKey}: ${errorMessage}`);
      
      // エラー状態を記録
      this.stateManager.updateFetchError(equipmentKey, fetchTime, errorMessage);
      
      // Gap処理：接続失敗時は今回の期間を保留Gap期間として記録
      const { startTime, endTime } = this.calculateFetchPeriod(equipmentKey);
      this.stateManager.setPendingGap(equipmentKey, startTime, endTime);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 取得期間を計算（Gap回復と境界欠落防止を考慮）
   */
  private calculateFetchPeriod(equipmentKey: string): { startTime: Date; endTime: Date } {
    const now = new Date();
    const marginMs = this.commonConfig.data_acquisition.fetch_margin_seconds * 1000;
    const endTime = new Date(now.getTime() - marginMs);

    // 優先順位1: 保留中のGap期間（接続failure復旧時）
    const pendingGap = this.stateManager.getPendingGap(equipmentKey);
    if (pendingGap) {
      console.log(`🔄 Gap recovery for ${equipmentKey}: ${pendingGap.startDate.toISOString()} to ${endTime.toISOString()}`);
      return { 
        startTime: pendingGap.startDate, 
        endTime 
      };
    }

    // 優先順位2: 実際に取得したデータの最新時刻（境界欠落防止）
    const actualLastDataTime = this.stateManager.getActualLastDataTime(equipmentKey);
    if (actualLastDataTime) {
      console.log(`📊 Using actual data time for ${equipmentKey}: ${actualLastDataTime.toISOString()}`);
      return { 
        startTime: actualLastDataTime, 
        endTime 
      };
    }

    // 優先順位3: StateManagerから前回取得時刻を確認（フォールバック）
    const stateLastFetchTime = this.stateManager.getLastFetchTime(equipmentKey);
    
    // 優先順位4: 既存CSVファイルから最新時刻を確認（フォールバック）
    const outputFilename = `${equipmentKey}.csv`;
    const csvLastTimestamp = this.csvOutput.getLastTimestampFromFile(outputFilename);
    
    let startTime: Date;
    
    if (stateLastFetchTime && csvLastTimestamp) {
      // 両方存在する場合：古い時刻を使用（保守的アプローチ）
      const stateTime = stateLastFetchTime.getTime();
      const csvTime = csvLastTimestamp.getTime();
      
      if (Math.abs(stateTime - csvTime) > 60000) { // 1分以上の差がある場合
        console.warn(`State/CSV timestamp mismatch for ${equipmentKey}: State=${stateLastFetchTime.toISOString()}, CSV=${csvLastTimestamp.toISOString()}`);
      }
      
      // 古い時刻から継続（保守的アプローチ：重複は許可、欠損は回避）
      const earlierTime = stateTime < csvTime ? stateLastFetchTime : csvLastTimestamp;
      startTime = earlierTime;
      console.log(`📋 Using earlier time for ${equipmentKey}: ${startTime.toISOString()} (conservative approach)`);
      
    } else if (stateLastFetchTime) {
      // StateManagerのみ存在
      startTime = stateLastFetchTime;
      console.log(`📋 Using state manager time for ${equipmentKey}: ${startTime.toISOString()}`);
      
    } else if (csvLastTimestamp) {
      // CSVファイルのみ存在
      startTime = csvLastTimestamp;
      console.log(`📋 Using CSV file time for ${equipmentKey}: ${startTime.toISOString()}`);
      
    } else {
      // どちらも存在しない：初回取得
      const maxHistoryDays = this.commonConfig.data_acquisition.max_history_days;
      startTime = this.stateManager.calculateInitialFetchTime(maxHistoryDays);
      console.log(`🆕 Initial fetch for ${equipmentKey}, going back ${maxHistoryDays} days: ${startTime.toISOString()}`);
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
   * 起動時の状態同期を実行
   */
  private async performStartupSync(equipmentNames: string[]): Promise<void> {
    for (const equipmentName of equipmentNames) {
      try {
        const equipmentKey = equipmentName;
        const outputFilename = `${equipmentKey}.csv`;
        
        // StateManagerとCSVファイルの状態を確認
        const stateLastFetchTime = this.stateManager.getLastFetchTime(equipmentKey);
        const csvLastTimestamp = this.csvOutput.getLastTimestampFromFile(outputFilename);
        const csvFileInfo = this.csvOutput.getFileInfo(outputFilename);
        
        console.log(`Checking sync status for ${equipmentKey}:`);
        console.log(`  State Manager: ${stateLastFetchTime ? stateLastFetchTime.toISOString() : 'None'}`);
        console.log(`  CSV File: ${csvLastTimestamp ? csvLastTimestamp.toISOString() : 'None'} (exists: ${csvFileInfo.exists})`);
        
        // 同期が必要かどうかを判定
        if (stateLastFetchTime && csvLastTimestamp) {
          const timeDiff = Math.abs(stateLastFetchTime.getTime() - csvLastTimestamp.getTime());
          if (timeDiff > 60000) { // 1分以上の差
            console.warn(`⚠️  Significant timestamp mismatch detected for ${equipmentKey}: ${timeDiff}ms difference`);
            console.log(`  Will sync automatically during next fetch operation`);
          } else {
            console.log(`✅ State and CSV file are in sync for ${equipmentKey}`);
          }
        } else if (!stateLastFetchTime && csvLastTimestamp) {
          console.log(`📄 CSV file exists but no state record for ${equipmentKey} - will sync on next fetch`);
        } else if (stateLastFetchTime && !csvLastTimestamp) {
          console.log(`💾 State record exists but no CSV file for ${equipmentKey} - will regenerate file`);
        } else {
          console.log(`🆕 Fresh start for ${equipmentKey} - no previous state or CSV file`);
        }
        
      } catch (error) {
        console.warn(`Failed to sync ${equipmentName}: ${error}`);
      }
    }
    
    console.log('Startup synchronization completed');
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
   * CSVデータから実際のデータの時刻範囲を抽出
   */
  private extractActualDataTimeRange(csvData: string): { actualStartTime?: Date; actualEndTime?: Date } {
    try {
      const lines = csvData.split('\n').filter(line => line.trim());
      
      if (lines.length <= 1) {
        return {}; // ヘッダーのみまたは空データ
      }

      const headers = lines[0].split(',');
      
      // タイムスタンプ列を特定
      const timestampIndex = headers.findIndex(h => 
        h.toLowerCase().includes('time') || h.toLowerCase().includes('date')
      );

      if (timestampIndex === -1) {
        console.warn('No timestamp column found in CSV data');
        return {};
      }

      let earliestTime: Date | undefined;
      let latestTime: Date | undefined;

      // データ行を処理
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols[timestampIndex] && cols[timestampIndex].trim()) {
          try {
            const time = new Date(cols[timestampIndex].trim());
            
            if (!isNaN(time.getTime())) {
              if (!earliestTime || time < earliestTime) {
                earliestTime = time;
              }
              if (!latestTime || time > latestTime) {
                latestTime = time;
              }
            }
          } catch (error) {
            // 無効な日付をスキップ
            continue;
          }
        }
      }

      return {
        actualStartTime: earliestTime,
        actualEndTime: latestTime,
      };
    } catch (error) {
      console.error('Failed to extract data time range from CSV:', error);
      return {};
    }
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
