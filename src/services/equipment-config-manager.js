const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class EquipmentConfigManager {
  constructor() {
    this.configsPath = path.join(__dirname, '../../configs/equipments');
    this.equipmentConfigs = new Map();
    this.lastLoadTime = null;
    this.loadConfigs();
  }

  /**
   * 全設備のconfig.yamlファイルを読み込む
   */
  loadConfigs() {
    try {
      if (!fs.existsSync(this.configsPath)) {
        console.warn(`Equipment configs directory not found: ${this.configsPath}`);
        return;
      }

      const equipmentDirs = fs.readdirSync(this.configsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      this.equipmentConfigs.clear();

      for (const equipmentName of equipmentDirs) {
        const configPath = path.join(this.configsPath, equipmentName, 'config.yaml');
        
        if (fs.existsSync(configPath)) {
          try {
            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = yaml.load(configContent);
            
            // 設備名をキーとして設定を保存
            this.equipmentConfigs.set(equipmentName, {
              ...config,
              equipmentName,
              configPath
            });
            
            console.log(`Loaded config for equipment: ${equipmentName}`);
          } catch (error) {
            console.error(`Error loading config for ${equipmentName}:`, error.message);
          }
        } else {
          console.warn(`Config file not found for equipment: ${equipmentName}`);
        }
      }

      this.lastLoadTime = new Date();
      console.log(`Loaded ${this.equipmentConfigs.size} equipment configurations`);
    } catch (error) {
      console.error('Error loading equipment configs:', error);
    }
  }

  /**
   * 指定した設備の設定を取得
   * @param {string} equipmentName - 設備名
   * @returns {Object|null} 設備設定
   */
  getEquipmentConfig(equipmentName) {
    return this.equipmentConfigs.get(equipmentName) || null;
  }

  /**
   * 設備名でフィルタリングしたタグリストを取得
   * @param {string} equipmentName - 設備名
   * @param {Array} allTags - 全タグのリスト
   * @returns {Array} フィルタリングされたタグリスト
   */
  getFilteredTags(equipmentName, allTags) {
    if (!equipmentName) {
      return allTags;
    }

    const config = this.getEquipmentConfig(equipmentName);
    if (!config || !config.basemap) {
      console.warn(`No config or basemap found for equipment: ${equipmentName}`);
      return [];
    }

    // source_tagsとgtagsを統合
    const allowedTags = new Set();
    
    // source_tagsを追加
    if (config.basemap.source_tags && Array.isArray(config.basemap.source_tags)) {
      config.basemap.source_tags.forEach(tag => allowedTags.add(tag));
    }
    
    // gtagsを追加
    if (config.basemap.gtags && Array.isArray(config.basemap.gtags)) {
      config.basemap.gtags.forEach(gtag => allowedTags.add(gtag));
    }

    // タグをフィルタリング
    return allTags.filter(tag => {
      // source_tagまたはnameが許可されたタグに含まれるかチェック
      const tagName = tag.source_tag || tag.name;
      return allowedTags.has(tagName);
    });
  }

  /**
   * 指定した設備で利用可能なsource_tagsを取得
   * @param {string} equipmentName - 設備名
   * @returns {Array} source_tagsのリスト
   */
  getSourceTags(equipmentName) {
    const config = this.getEquipmentConfig(equipmentName);
    if (!config || !config.basemap || !config.basemap.source_tags) {
      return [];
    }
    return config.basemap.source_tags;
  }

  /**
   * 指定した設備で利用可能なgtagsを取得
   * @param {string} equipmentName - 設備名  
   * @returns {Array} gtagsのリスト
   */
  getGtags(equipmentName) {
    const config = this.getEquipmentConfig(equipmentName);
    if (!config || !config.basemap || !config.basemap.gtags) {
      return [];
    }
    return config.basemap.gtags;
  }

  /**
   * 全設備の一覧を取得
   * @returns {Array} 設備名のリスト
   */
  getAllEquipments() {
    return Array.from(this.equipmentConfigs.keys());
  }

  /**
   * 特定のgtagがどの設備で使用されているかを取得
   * @param {string} gtagName - gtag名
   * @returns {Array} 設備名のリスト
   */
  getEquipmentsUsingGtag(gtagName) {
    const equipments = [];
    
    for (const [equipmentName, config] of this.equipmentConfigs) {
      if (config.basemap && 
          config.basemap.gtags && 
          config.basemap.gtags.includes(gtagName)) {
        equipments.push(equipmentName);
      }
    }
    
    return equipments;
  }

  /**
   * 特定のsource_tagがどの設備で使用されているかを取得
   * @param {string} sourceTagName - source_tag名
   * @returns {Array} 設備名のリスト
   */
  getEquipmentsUsingSourceTag(sourceTagName) {
    const equipments = [];
    
    for (const [equipmentName, config] of this.equipmentConfigs) {
      if (config.basemap && 
          config.basemap.source_tags && 
          config.basemap.source_tags.includes(sourceTagName)) {
        equipments.push(equipmentName);
      }
    }
    
    return equipments;
  }

  /**
   * 設定ファイルをリロード（開発・デバッグ用）
   */
  reloadConfigs() {
    console.log('Reloading equipment configurations...');
    this.loadConfigs();
  }

  /**
   * 設定の統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    const stats = {
      totalEquipments: this.equipmentConfigs.size,
      lastLoadTime: this.lastLoadTime,
      equipments: {}
    };

    for (const [equipmentName, config] of this.equipmentConfigs) {
      stats.equipments[equipmentName] = {
        sourceTagsCount: config.basemap?.source_tags?.length || 0,
        gtagsCount: config.basemap?.gtags?.length || 0,
        hasBasemap: !!config.basemap
      };
    }

    return stats;
  }
}

// シングルトンインスタンスをエクスポート
const equipmentConfigManager = new EquipmentConfigManager();

module.exports = equipmentConfigManager;
