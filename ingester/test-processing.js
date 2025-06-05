// PI-Ingesterの新機能をテストするスクリプト
const fs = require('fs');
const path = require('path');

// 新しいTagMetadataServiceとCSVOutputServiceをテスト
async function testProcessing() {
  console.log('=== PI-Ingester CSV Processing Test ===');
  
  try {
    // 1. equipment.csvの内容を読み込み（PI-APIからの生データ形式）
    const equipmentCSVPath = path.join(__dirname, '..', 'equipment.csv');
    
    if (!fs.existsSync(equipmentCSVPath)) {
      console.error('❌ equipment.csv not found. Please ensure it exists in the project root.');
      return;
    }
    
    const rawCSVData = fs.readFileSync(equipmentCSVPath, 'utf8');
    console.log('✅ Read equipment.csv');
    
    // 先頭10行を表示
    const lines = rawCSVData.split('\n');
    console.log('\n📋 Raw CSV format (first 5 lines):');
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      console.log(`${i + 1}: ${lines[i].substring(0, 100)}${lines[i].length > 100 ? '...' : ''}`);
    }
    
    // 2. TypeScriptビルド済みモジュールをテスト（Nodeから実行）
    const { TagMetadataService } = require('./dist/services/tag-metadata');
    console.log('\n✅ Loaded TagMetadataService');
    
    // 3. メタデータ抽出をテスト
    const metadataService = new TagMetadataService('./test_output/tag_metadata');
    
    console.log('\n🔍 Testing metadata extraction...');
    const metadata = metadataService.extractMetadataFromCSV(rawCSVData);
    console.log(`✅ Extracted ${metadata.length} metadata entries`);
    
    // 最初の5個のメタデータを表示
    console.log('\n📊 Sample metadata:');
    for (let i = 0; i < Math.min(5, metadata.length); i++) {
      console.log(`  ${i + 1}. ${metadata[i].source_tag} -> "${metadata[i].display_name}" (${metadata[i].unit})`);
    }
    
    // 4. CSV変換をテスト
    console.log('\n🔄 Testing CSV processing...');
    const processedCSV = metadataService.processRawCSVToIFHubFormat(rawCSVData);
    
    const processedLines = processedCSV.split('\n').filter(line => line.trim().length > 0);
    console.log(`✅ Processed CSV: ${processedLines.length} lines (removed metadata rows)`);
    
    // 変換後のヘッダーと最初のデータ行を表示
    console.log('\n📄 Processed CSV format (first 3 lines):');
    for (let i = 0; i < Math.min(3, processedLines.length); i++) {
      console.log(`${i + 1}: ${processedLines[i].substring(0, 100)}${processedLines[i].length > 100 ? '...' : ''}`);
    }
    
    // 5. 出力ディレクトリを作成してファイルに保存
    const outputDir = './test_output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    if (!fs.existsSync(path.join(outputDir, 'static_equipment_data'))) {
      fs.mkdirSync(path.join(outputDir, 'static_equipment_data'), { recursive: true });
    }
    
    if (!fs.existsSync(path.join(outputDir, 'tag_metadata'))) {
      fs.mkdirSync(path.join(outputDir, 'tag_metadata'), { recursive: true });
    }
    
    // 処理済みCSVを保存
    const processedCSVPath = path.join(outputDir, 'static_equipment_data', '7th-untan.csv');
    fs.writeFileSync(processedCSVPath, processedCSV, 'utf8');
    console.log(`✅ Saved processed CSV: ${processedCSVPath}`);
    
    // メタデータを保存
    await metadataService.updateTranslationsFile(metadata, 'ja');
    console.log('✅ Saved metadata to translations_ja.csv');
    
    // 6. 結果をレポート
    console.log('\n📈 Processing Results:');
    console.log(`  • Original CSV lines: ${lines.length}`);
    console.log(`  • Processed CSV lines: ${processedLines.length}`);
    console.log(`  • Extracted metadata entries: ${metadata.length}`);
    console.log(`  • Output files created in: ${outputDir}`);
    
    console.log('\n✅ Test completed successfully!');
    console.log('\n📁 Check the following files:');
    console.log(`  • ${processedCSVPath}`);
    console.log(`  • ${path.join(outputDir, 'tag_metadata', 'translations_ja.csv')}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// テスト実行
testProcessing();
