import * as fs from 'fs';
import * as path from 'path';
import { IngesterState, EquipmentState } from '../types/state';

export class StateManager {
  private stateFilePath: string;
  private state: IngesterState;

  constructor(stateFilePath?: string) {
    // 環境変数から状態ファイルパスを取得、デフォルトは '/app/logs/ingester-state.json'
    this.stateFilePath = stateFilePath || process.env.STATE_FILE_PATH || '/app/logs/ingester-state.json';
    
    console.log(`💾 State file path: ${this.stateFilePath}`);
    this.state = this.loadState();
  }

  /**
   * 状態ファイルを読み込む
   */
  private loadState(): IngesterState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const stateData = fs.readFileSync(this.stateFilePath, 'utf8');
        const loadedState = JSON.parse(stateData) as IngesterState;
        console.log(`State loaded from ${this.stateFilePath}`);
        return loadedState;
      }
    } catch (error) {
      console.warn(`Failed to load state file: ${error}`);
    }

    // デフォルト状態を返す
    const defaultState: IngesterState = {
      equipment: {},
      lastUpdated: new Date().toISOString(),
    };
    
    console.log('Using default state (no existing state file)');
    return defaultState;
  }

  /**
   * 状態をファイルに保存
   */
  private saveState(): void {
    try {
      // ディレクトリが存在しない場合は作成
      const stateDir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }

      this.state.lastUpdated = new Date().toISOString();
      
      // 一時ファイルに書き込んでからアトミックにrename
      const tempPath = `${this.stateFilePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tempPath, this.stateFilePath);
      
      console.log(`State saved to ${this.stateFilePath}`);
    } catch (error) {
      console.error(`Failed to save state: ${error}`);
    }
  }

  /**
   * 設備の状態を取得
   */
  getEquipmentState(equipmentKey: string): EquipmentState {
    if (!this.state.equipment[equipmentKey]) {
      this.state.equipment[equipmentKey] = {
        errorCount: 0,
      };
    }
    return this.state.equipment[equipmentKey];
  }

  /**
   * 前回取得時刻を取得
   */
  getLastFetchTime(equipmentKey: string): Date | null {
    const equipmentState = this.getEquipmentState(equipmentKey);
    return equipmentState.lastFetchTime ? new Date(equipmentState.lastFetchTime) : null;
  }

  /**
   * 前回成功時刻を取得
   */
  getLastSuccessTime(equipmentKey: string): Date | null {
    const equipmentState = this.getEquipmentState(equipmentKey);
    return equipmentState.lastSuccessTime ? new Date(equipmentState.lastSuccessTime) : null;
  }

  /**
   * 取得成功時の状態更新
   */
  updateFetchSuccess(equipmentKey: string, fetchTime: Date): void {
    const equipmentState = this.getEquipmentState(equipmentKey);
    
    equipmentState.lastFetchTime = fetchTime.toISOString();
    equipmentState.lastSuccessTime = fetchTime.toISOString();
    equipmentState.errorCount = 0;
    equipmentState.lastError = undefined;
    
    this.saveState();
    console.log(`Updated success state for ${equipmentKey}: ${fetchTime.toISOString()}`);
  }

  /**
   * 取得失敗時の状態更新
   */
  updateFetchError(equipmentKey: string, fetchTime: Date, error: string): void {
    const equipmentState = this.getEquipmentState(equipmentKey);
    
    equipmentState.lastFetchTime = fetchTime.toISOString();
    equipmentState.errorCount += 1;
    equipmentState.lastError = error;
    
    this.saveState();
    console.log(`Updated error state for ${equipmentKey}: ${error} (count: ${equipmentState.errorCount})`);
  }

  /**
   * 初回取得時刻を計算（設定された最大履歴日数を考慮）
   */
  calculateInitialFetchTime(maxHistoryDays: number): Date {
    const now = new Date();
    const maxHistoryMs = maxHistoryDays * 24 * 60 * 60 * 1000;
    return new Date(now.getTime() - maxHistoryMs);
  }

  /**
   * 現在の状態を取得（デバッグ用）
   */
  getCurrentState(): IngesterState {
    return { ...this.state };
  }

  /**
   * 設備の状態をリセット
   */
  resetEquipmentState(equipmentKey: string): void {
    if (this.state.equipment[equipmentKey]) {
      delete this.state.equipment[equipmentKey];
      this.saveState();
      console.log(`Reset state for ${equipmentKey}`);
    }
  }

  /**
   * エラー回数を取得
   */
  getErrorCount(equipmentKey: string): number {
    const equipmentState = this.getEquipmentState(equipmentKey);
    return equipmentState.errorCount;
  }

  /**
   * 最後のエラーメッセージを取得
   */
  getLastError(equipmentKey: string): string | undefined {
    const equipmentState = this.getEquipmentState(equipmentKey);
    return equipmentState.lastError;
  }

  /**
   * 実際に取得したデータの最新時刻を取得
   */
  getActualLastDataTime(equipmentKey: string): Date | null {
    const equipmentState = this.getEquipmentState(equipmentKey);
    return equipmentState.actualLastDataTime ? new Date(equipmentState.actualLastDataTime) : null;
  }

  /**
   * 実際に取得したデータの最新時刻を更新
   */
  updateActualDataTime(equipmentKey: string, actualTime: Date): void {
    const equipmentState = this.getEquipmentState(equipmentKey);
    equipmentState.actualLastDataTime = actualTime.toISOString();
    this.saveState();
    console.log(`Updated actual data time for ${equipmentKey}: ${actualTime.toISOString()}`);
  }

  /**
   * 保留中のGap期間を設定（接続失敗時）
   */
  setPendingGap(equipmentKey: string, startDate: Date, endDate: Date): void {
    const equipmentState = this.getEquipmentState(equipmentKey);
    equipmentState.pendingGapStartDate = startDate.toISOString();
    equipmentState.pendingGapEndDate = endDate.toISOString();
    this.saveState();
    console.log(`Set pending gap for ${equipmentKey}: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  }

  /**
   * 保留中のGap期間をクリア（接続成功時）
   */
  clearPendingGap(equipmentKey: string): void {
    const equipmentState = this.getEquipmentState(equipmentKey);
    if (equipmentState.pendingGapStartDate || equipmentState.pendingGapEndDate) {
      console.log(`Clearing pending gap for ${equipmentKey}: ${equipmentState.pendingGapStartDate} to ${equipmentState.pendingGapEndDate}`);
      equipmentState.pendingGapStartDate = undefined;
      equipmentState.pendingGapEndDate = undefined;
      this.saveState();
    }
  }

  /**
   * 保留中のGap期間を取得
   */
  getPendingGap(equipmentKey: string): { startDate: Date; endDate: Date } | null {
    const equipmentState = this.getEquipmentState(equipmentKey);
    if (equipmentState.pendingGapStartDate && equipmentState.pendingGapEndDate) {
      return {
        startDate: new Date(equipmentState.pendingGapStartDate),
        endDate: new Date(equipmentState.pendingGapEndDate),
      };
    }
    return null;
  }
}
