// src/scripts/init-equipment-data.js
// config.yamlファイルから設備とタグの関連付けデータを初期化するスクリプト

const EquipmentConfigManager = require('../services/equipment-config-manager');
const { db } = require('../db');

/**
 * 設備データを初期化
 * config.yamlファイルから設備とタグの関連付け情報を読み込み、
 * equipment_tagsテーブルに投入する
 */
async function initializeEquipmentData() {
  console.log('設備データの初期化を開始します...');
  
  const configManager = new EquipmentConfigManager();
  
  try {
    // 利用可能な全設備を取得
    const equipments = configManager.getAllEquipments();
    console.log(`発見された設備: ${equipments.length}個`);
    equipments.forEach(eq => console.log(`  - ${eq}`));
    
    if (equipments.length === 0) {
      console.log('設備が見つかりませんでした。configs/equipments/ ディレクトリを確認してください。');
      return;
    }
    
    // 統計情報
    let totalSourceTags = 0;
    let totalGtags = 0;

    // トランザクションで一括処理
    await db.query('BEGIN');
    try {
      // 既存データをクリア
      await db.query('DELETE FROM equipment_tags');
      console.log('既存のequipment_tagsデータをクリアしました');

      for (const equipmentName of equipments) {
        console.log(`\n${equipmentName} の処理中...`);

        try {
          // source_tags を登録
          const sourceTags = configManager.getTagsForEquipment(equipmentName, 'source');
          console.log(`  source_tags: ${sourceTags.length}個`);
          for (const tagName of sourceTags) {
            await db.query(
              `INSERT INTO equipment_tags (equipment_name, tag_name, tag_type)
               VALUES ($1, $2, $3)
               ON CONFLICT (equipment_name, tag_name, tag_type) DO NOTHING`,
              [equipmentName, tagName, 'source']
            );
          }
          totalSourceTags += sourceTags.length;

          // gtags を登録
          const gtags = configManager.getTagsForEquipment(equipmentName, 'gtag');
          console.log(`  gtags: ${gtags.length}個`);
          for (const tagName of gtags) {
            await db.query(
              `INSERT INTO equipment_tags (equipment_name, tag_name, tag_type)
               VALUES ($1, $2, $3)
               ON CONFLICT (equipment_name, tag_name, tag_type) DO NOTHING`,
              [equipmentName, tagName, 'gtag']
            );
          }
          totalGtags += gtags.length;

        } catch (error) {
          console.error(`  エラー: ${error.message}`);
          throw error;
        }
      }

      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    
    console.log('\n=== 初期化完了 ===');
    console.log(`設備数: ${equipments.length}`);
    console.log(`source_tags: ${totalSourceTags}個`);
    console.log(`gtags: ${totalGtags}個`);
    console.log(`合計: ${totalSourceTags + totalGtags}個のタグ関連付けを作成しました`);
    
    // データベースの状態を確認
    console.log('\n=== データベース確認 ===');
    const result = await db.query(`
      SELECT
        equipment_name,
        COUNT(CASE WHEN tag_type = 'source' THEN 1 END) as source_count,
        COUNT(CASE WHEN tag_type = 'gtag' THEN 1 END) as gtag_count
      FROM equipment_tags
      GROUP BY equipment_name
      ORDER BY equipment_name
    `);

    result.rows.forEach(row => {
      console.log(`${row.equipment_name}: source=${row.source_count}, gtag=${row.gtag_count}`);
    });
    
  } catch (error) {
    console.error('設備データの初期化中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * 特定の設備のタグ関連付けを更新
 * @param {string} equipmentName - 設備名
 */
async function updateEquipmentTags(equipmentName) {
  console.log(`${equipmentName} のタグ関連付けを更新中...`);

  const configManager = new EquipmentConfigManager();

  try {
    await db.query('BEGIN');

    // 該当設備の既存データを削除
    await db.query('DELETE FROM equipment_tags WHERE equipment_name = $1', [equipmentName]);

    // source_tagsを追加
    const sourceTags = configManager.getTagsForEquipment(equipmentName, 'source');
    for (const tagName of sourceTags) {
      await db.query(
        `INSERT INTO equipment_tags (equipment_name, tag_name, tag_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (equipment_name, tag_name, tag_type) DO NOTHING`,
        [equipmentName, tagName, 'source']
      );
    }

    // gtagsを追加
    const gtags = configManager.getTagsForEquipment(equipmentName, 'gtag');
    for (const tagName of gtags) {
      await db.query(
        `INSERT INTO equipment_tags (equipment_name, tag_name, tag_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (equipment_name, tag_name, tag_type) DO NOTHING`,
        [equipmentName, tagName, 'gtag']
      );
    }

    await db.query('COMMIT');

    console.log(`${equipmentName}: source=${sourceTags.length}, gtag=${gtags.length}`);

  } catch (error) {
    await db.query('ROLLBACK');
    console.error(`${equipmentName} のタグ更新中にエラーが発生しました:`, error);
    throw error;
  }
}

// コマンドライン実行時の処理
if (require.main === module) {
  initializeEquipmentData()
    .then(() => {
      console.log('初期化が正常に完了しました');
      process.exit(0);
    })
    .catch((error) => {
      console.error('初期化に失敗しました:', error);
      process.exit(1);
    });
}

module.exports = {
  initializeEquipmentData,
  updateEquipmentTags
};
