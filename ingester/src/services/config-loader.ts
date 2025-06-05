import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { CommonConfig, EquipmentConfig } from '../types/config';

export class ConfigLoader {
  private commonConfigPath: string;
  private equipmentConfigBasePath: string;

  constructor(configBasePath?: string) {
    // 環境変数から設定パスを取得、デフォルトは '/app/configs'
    const basePath = configBasePath || process.env.CONFIG_BASE_PATH || '/app/configs';
    
    this.commonConfigPath = path.join(basePath, 'common.yaml');
    this.equipmentConfigBasePath = path.join(basePath, 'equipments');
    
    console.log(`📁 Config base path: ${basePath}`);
    console.log(`📄 Common config: ${this.commonConfigPath}`);
    console.log(`📁 Equipment configs: ${this.equipmentConfigBasePath}`);
  }

  /**
   * 共通設定を読み込む
   */
  loadCommonConfig(): CommonConfig {
    try {
      const configData = fs.readFileSync(this.commonConfigPath, 'utf8');
      const config = yaml.load(configData) as CommonConfig;
      return config;
    } catch (error) {
      console.error(`Failed to load common config from ${this.commonConfigPath}:`, error);
      throw error;
    }
  }

  /**
   * 設備設定ファイルを読み込む（固定ファイル名: config.yaml）
   */
  loadEquipmentConfig(equipmentName: string): EquipmentConfig {
    const configPath = path.join(this.equipmentConfigBasePath, equipmentName, 'config.yaml');
    
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configData) as EquipmentConfig;
      
      // PI連携が無効の場合はエラー
      if (!config.pi_integration?.enabled) {
        throw new Error(`PI integration is disabled for ${equipmentName}`);
      }
      
      return config;
    } catch (error) {
      console.error(`Failed to load equipment config from ${configPath}:`, error);
      throw error;
    }
  }

  /**
   * 利用可能な設備設定ファイルを取得（固定ファイル名: config.yaml）
   */
  getAvailableEquipmentConfigs(): Array<{ equipment: string }> {
    const results: Array<{ equipment: string }> = [];
    
    try {
      const equipments = fs.readdirSync(this.equipmentConfigBasePath);
      
      for (const equipment of equipments) {
        const equipmentPath = path.join(this.equipmentConfigBasePath, equipment);
        const stat = fs.statSync(equipmentPath);
        
        if (stat.isDirectory()) {
          const configPath = path.join(equipmentPath, 'config.yaml');
          
          // config.yamlファイルが存在するかチェック
          if (fs.existsSync(configPath)) {
            try {
              // 設定ファイルが有効かチェック
              const config = this.loadEquipmentConfig(equipment);
              if (config.pi_integration?.enabled) {
                results.push({ equipment });
              }
            } catch (error) {
              console.warn(`Skipping invalid config ${equipment}: ${error}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to scan equipment configs:', error);
    }
    
    return results;
  }

  /**
   * インターバル文字列を秒数に変換
   */
  parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)([smhD])$/);
    if (!match) {
      throw new Error(`Invalid interval format: ${interval}`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'D': return value * 86400;
      default:
        throw new Error(`Unsupported interval unit: ${unit}`);
    }
  }
}
