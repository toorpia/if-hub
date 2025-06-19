// src/scripts/test-equipment-config.js
// EquipmentConfigManagerのテストスクリプト

const EquipmentConfigManager = require('../services/equipment-config-manager');

async function testEquipmentConfig() {
  console.log('=== EquipmentConfigManager テスト開始 ===');
  
  try {
    const configManager = new EquipmentConfigManager();
    
    // 1. 利用可能な設備一覧を取得
    console.log('\n1. 利用可能な設備一覧:');
    const equipments = configManager.getAllEquipments();
    console.log(`見つかった設備: ${equipments.length}個`);
    equipments.forEach(equipment => console.log(`  - ${equipment}`));
    
    if (equipments.length === 0) {
      console.log('設備が見つかりませんでした。configs/equipments/ ディレクトリを確認してください。');
      return;
    }

    // 2. 各設備のconfig.yamlを読み込んでテスト
    for (const equipment of equipments) {
      console.log(`\n2. ${equipment}設備の設定テスト:`);
      
      try {
        const config = configManager.loadConfig(equipment);
        console.log(`  ✅ config.yaml読み込み成功`);
        
        // source_tagsの確認
        const sourceTags = configManager.getTagsForEquipment(equipment, 'source');
        console.log(`  - source_tags: ${sourceTags.length}個`);
        if (sourceTags.length > 0) {
          console.log(`    例: ${sourceTags.slice(0, 3).join(', ')}${sourceTags.length > 3 ? '...' : ''}`);
        }
        
        // gtagsの確認
        const gtags = configManager.getTagsForEquipment(equipment, 'gtag');
        console.log(`  - gtags: ${gtags.length}個`);
        if (gtags.length > 0) {
          console.log(`    例: ${gtags.slice(0, 3).join(', ')}${gtags.length > 3 ? '...' : ''}`);
        }
        
        // 全タグの確認
        const allTags = configManager.getTagsForEquipment(equipment, 'all');
        console.log(`  - 合計タグ数: ${allTags.length}個`);
        
      } catch (error) {
        console.log(`  ❌ エラー: ${error.message}`);
      }
    }

    // 3. 特定のタグを使用している設備を検索（例）
    console.log('\n3. タグ逆引きテスト:');
    if (equipments.length > 0) {
      const firstEquipment = equipments[0];
      const config = configManager.getConfig(firstEquipment);
      
      if (config && config.source_tags && config.source_tags.length > 0) {
        const testTag = config.source_tags[0];
        console.log(`  テストタグ: ${testTag}`);
        
        const equipmentsForTag = configManager.getEquipmentsForTag(testTag, 'source');
        console.log(`  このタグを使用している設備: ${equipmentsForTag.join(', ')}`);
      }
    }

    console.log('\n=== テスト完了 ===');
    
  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
  }
}

// スクリプトが直接実行された場合のみテストを実行
if (require.main === module) {
  testEquipmentConfig();
}

module.exports = { testEquipmentConfig };
