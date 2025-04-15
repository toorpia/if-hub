#!/usr/bin/env node
/**
 * Fetcher CLIエントリーポイント
 */
import chalk from 'chalk';
import { parseOptions } from './options-parser';
import { loadConfig, fetchData } from '../src';
import { FetcherConfig } from '../src/types/config';
import { CliOptions } from '../src/types/options';

/**
 * メイン実行関数
 */
async function main() {
  try {
    // コマンドライン引数の解析
    const cliOptions = parseOptions(process.argv);
    
    // 設定ファイルの読み込み
    const config = await loadConfig(cliOptions.config_file);
    
    // 単一設備の場合
    if (!Array.isArray(cliOptions.equipment)) {
      await processSingleEquipment(config, cliOptions);
      return;
    }
    
    // 複数設備の場合（順次処理）
    for (const equipment of cliOptions.equipment) {
      console.log(chalk.blue(`========== 設備: ${equipment} ==========`));
      
      // 個別設備の処理
      const singleOptions = { ...cliOptions, equipment };
      await processSingleEquipment(config, singleOptions);
      
      console.log(chalk.blue('=======================================\n'));
    }
  } catch (error) {
    console.error(chalk.red('エラーが発生しました:'), error);
    process.exit(1);
  }
}

/**
 * 単一設備の処理
 * @param config 設定オブジェクト
 * @param options 実行オプション
 */
async function processSingleEquipment(config: FetcherConfig, options: CliOptions) {
  const { equipment } = options;
  
  // 設定のオーバーライド（コマンドラインオプションで上書き）
  const updatedConfig = overrideConfig(config, options);
  
  // 実行時オプションの構築
  const runtimeOptions = {
    start: options.start,
    end: options.end,
    latest: options.latest,
    max_rows_per_file: options.max_rows_per_file,
    page_size: options.page_size,
    verbose: options.verbose
  };
  
  console.log(chalk.blue(`設備 ${equipment} のデータ取得を開始します...`));
  
  // コア処理の実行
  const result = await fetchData({
    config: updatedConfig,
    equipment: equipment.toString(),
    options: runtimeOptions
  });
  
  // 結果の表示
  if (result.success) {
    console.log(chalk.green('✅ 処理が完了しました'));
    console.log(`  取得レコード数: ${chalk.yellow(result.stats?.totalRecords.toString())}`);
    console.log(`  フィルタリング後: ${chalk.yellow(result.stats?.filteredRecords.toString())}`);
    console.log(`  処理時間: ${chalk.yellow((result.stats?.duration || 0) / 1000)} 秒`);
    console.log(`  出力ファイル数: ${chalk.yellow(result.outputFiles?.length.toString() || '0')}`);
    
    // 出力ファイルの表示
    if (result.outputFiles && result.outputFiles.length > 0) {
      console.log(chalk.blue('出力ファイル:'));
      result.outputFiles.forEach(file => {
        console.log(`  - ${file}`);
      });
    }
  } else {
    console.error(chalk.red(`❌ エラーが発生しました: ${result.error?.message}`));
  }
}

/**
 * コマンドラインオプションで設定をオーバーライド
 * @param config 元の設定
 * @param options コマンドラインオプション
 * @returns 更新された設定
 */
function overrideConfig(config: FetcherConfig, options: CliOptions): FetcherConfig {
  // 設定のディープコピー
  const newConfig = JSON.parse(JSON.stringify(config)) as FetcherConfig;
  
  // 設備が設定ファイルにあるか確認
  const equipment = options.equipment.toString();
  let equipmentConfig = newConfig.equipment.find(e => e.name === equipment);
  
  // 設備が見つからない場合は作成
  if (!equipmentConfig) {
    equipmentConfig = { name: equipment, tags: [] };
    newConfig.equipment.push(equipmentConfig);
  }
  
  // タグの上書き
  if (options.tags) {
    if (Array.isArray(options.tags)) {
      equipmentConfig.tags = options.tags;
    } else {
      equipmentConfig.tags = [options.tags];
    }
  }
  
  // only_when条件の上書き
  if (options.only_when) {
    if (!equipmentConfig.conditions) {
      equipmentConfig.conditions = { only_when: [] };
    }
    
    if (!equipmentConfig.conditions.only_when) {
      equipmentConfig.conditions.only_when = [];
    }
    
    // 既存の条件をクリア
    equipmentConfig.conditions.only_when = [];
    
    // 新しい条件を追加
    const conditions = Array.isArray(options.only_when) ? options.only_when : [options.only_when];
    for (const condStr of conditions) {
      const match = condStr.match(/^([^ ]+)\s+([<>=!]{1,2})\s+(.+)$/);
      if (match) {
        const [, tag, operator, valueStr] = match;
        equipmentConfig.conditions.only_when.push({
          tag,
          condition: `${operator} ${valueStr}`
        });
      }
    }
  }
  
  // 出力設定の上書き
  if (options.max_rows_per_file) {
    newConfig.output.max_rows_per_file = options.max_rows_per_file;
  }
  
  return newConfig;
}

// スクリプト実行
main().catch(error => {
  console.error(chalk.red('予期しないエラーが発生しました:'), error);
  process.exit(1);
});
