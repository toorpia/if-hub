const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

class EquipmentConfigManager {
  constructor() {
    this.configs = new Map();
    this.watchers = new Map();
    this.configDir = path.join(process.cwd(), 'configs/equipments');
  }

  /**
   * 指定された設備のconfig.yamlを読み込む
   * @param {string} equipmentName - 設備名
   * @returns {Object} 設定オブジェクト
   */
  loadConfig(equipmentName) {
    const configPath = path.join(this.configDir, equipmentName, 'config.yaml');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    
    try {
      const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
      this.configs.set(equipmentName, config);
      return config;
    } catch (error) {
      throw new Error(`Failed to parse config file ${configPath}: ${error.message}`);
    }
  }

  /**
   * 利用可能な全設備名を取得
   * @returns {string[]} 設備名の配列
   */
  getAllEquipments() {
    if (!fs.existsSync(this.configDir)) {
      return [];
    }
    
    return fs.readdirSync(this.configDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  }

  /**
   * 指定設備のタグ一覧を取得
   * @param {string} equipmentName - 設備名
   * @param {string} tagType - 'source', 'gtag', 'all'
   * @returns {string[]} タグ名の配列
   */
  getTagsForEquipment(equipmentName, tagType = 'all') {
    const config = this.configs.get(equipmentName) || this.loadConfig(equipmentName);
    
    const result = [];
    
    // ルートレベルと basemap セクションの両方をチェック
    const sourceTags = config.source_tags || 
                      (config.basemap && config.basemap.source_tags) || 
                      [];
    const gtags = config.gtags || 
                  (config.basemap && config.basemap.gtags) || 
                  [];
    
    if (tagType === 'all' || tagType === 'source') {
      result.push(...sourceTags);
    }
    if (tagType === 'all' || tagType === 'gtag') {
      result.push(...gtags);
    }
    
    return result;
  }

  /**
   * 指定されたタグを使用している設備一覧を取得
   * @param {string} tagName - タグ名
   * @param {string} tagType - 'source', 'gtag', 'all'
   * @returns {string[]} 設備名の配列
   */
  getEquipmentsForTag(tagName, tagType = 'all') {
    const equipments = this.getAllEquipments();
    const result = [];
    
    equipments.forEach(equipment => {
      const tags = this.getTagsForEquipment(equipment, tagType);
      if (tags.includes(tagName)) {
        result.push(equipment);
      }
    });
    
    return result;
  }

  /**
   * config.yamlファイルの変更監視を開始
   */
  startWatching() {
    const equipments = this.getAllEquipments();
    
    equipments.forEach(equipment => {
      const configPath = path.join(this.configDir, equipment, 'config.yaml');
      if (fs.existsSync(configPath)) {
        const watcher = chokidar.watch(configPath);
        
        watcher.on('change', () => {
          console.log(`Config changed for equipment: ${equipment}`);
          try {
            this.loadConfig(equipment);
            this.updateEquipmentTags(equipment);
          } catch (error) {
            console.error(`Failed to reload config for ${equipment}:`, error.message);
          }
        });
        
        this.watchers.set(equipment, watcher);
      }
    });
    
    console.log(`Started watching ${this.watchers.size} equipment config files`);
  }

  /**
   * 監視を停止
   */
  stopWatching() {
    this.watchers.forEach((watcher, equipment) => {
      watcher.close();
      console.log(`Stopped watching config for equipment: ${equipment}`);
    });
    this.watchers.clear();
  }

  /**
   * 設備のタグ関連付けをデータベースに更新
   * @param {string} equipmentName - 設備名
   */
  updateEquipmentTags(equipmentName) {
    console.log(`Equipment tags update triggered for: ${equipmentName}`);
    
    try {
      // 動的にrequireして循環依存を回避
      const { updateEquipmentTags } = require('../scripts/init-equipment-data');
      updateEquipmentTags(equipmentName);
      console.log(`Successfully updated equipment tags for: ${equipmentName}`);
    } catch (error) {
      console.error(`Failed to update equipment tags for ${equipmentName}:`, error.message);
    }
  }

  /**
   * キャッシュされた設定をクリア
   */
  clearCache() {
    this.configs.clear();
  }

  /**
   * 設備の設定情報を取得（キャッシュ優先）
   * @param {string} equipmentName - 設備名
   * @returns {Object|null} 設定オブジェクトまたはnull
   */
  getConfig(equipmentName) {
    try {
      return this.configs.get(equipmentName) || this.loadConfig(equipmentName);
    } catch (error) {
      console.error(`Failed to get config for ${equipmentName}:`, error.message);
      return null;
    }
  }
}

module.exports = EquipmentConfigManager;
