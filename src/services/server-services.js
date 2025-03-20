// src/services/server-services.js
// Copyright (c) 2025 toorPIA / toor Inc.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db } = require('../db');
const { importCsvToDatabase, importSpecificCsvFile } = require('../utils/csv-importer');
const { importTagMetadata, loadAndCacheMetadata } = require('../utils/tag-metadata-importer');
const { 
  initializeGtagSystem, 
  loadAllGtagDefinitions, 
  detectChangedGtagFiles, 
  importGtagDefinition,
} = require('../utils/gtag-utils');

/**
 * サーバー起動時の初期化処理を行う
 */
async function initializeServer() {
  try {
    // gtag機能の初期化
    console.log('gtagシステムの初期化を開始します...');
    try {
      initializeGtagSystem();
      await loadAllGtagDefinitions();
      console.log('gtagシステムの初期化が完了しました');
    } catch (error) {
      console.error('gtagシステムの初期化中にエラーが発生しました:', error);
      // 重大なエラーだが、サーバー自体は起動を続ける
    }
    
    // CSVデータの初期ロード
    console.log('CSVファイルのロードを開始します...');
    try {
      // CSVフォルダパスを取得
      const csvPath = config.dataSource.staticDataPath;
      console.log(`CSVフォルダパス: ${csvPath}`);
      
      // フォルダの存在確認とアクセス権確認
      if (!fs.existsSync(csvPath)) {
        console.error(`CSVフォルダ ${csvPath} が存在しません。作成します。`);
        try {
          fs.mkdirSync(csvPath, { recursive: true });
          console.log(`CSVフォルダを作成しました: ${csvPath}`);
        } catch (mkdirError) {
          console.error(`CSVフォルダの作成に失敗しました:`, mkdirError);
        }
      }
      
      try {
        fs.accessSync(csvPath, fs.constants.R_OK | fs.constants.W_OK);
        console.log(`CSVフォルダ ${csvPath} へのアクセス権があります`);
      } catch (accessError) {
        console.error(`CSVフォルダ ${csvPath} へのアクセス権がありません:`, accessError);
      }
      
      // CSVファイル一覧を取得
      const files = fs.readdirSync(csvPath).filter(file => file.endsWith('.csv'));
      console.log(`${files.length}個のCSVファイルが見つかりました`);
      
      if (files.length > 0) {
        // すべてのCSVファイルを処理
        console.log('すべてのCSVファイルを読み込みます');
        
        for (const file of files) {
          const fileInfo = {
            path: path.join(csvPath, file),
            name: file,
            equipmentId: path.basename(file, '.csv'),
            checksum: 'force-import-' + Date.now() // 強制読み込み用の一時的なチェックサム
          };
          
          console.log(`ファイル ${fileInfo.name} を処理中...`);
          try {
            await importSpecificCsvFile(fileInfo);
            console.log(`ファイル ${fileInfo.name} の処理が完了しました`);
          } catch (importError) {
            console.error(`ファイル ${fileInfo.name} の処理中にエラーが発生しました:`, importError);
            // 個別ファイルのエラーはスキップして続行
          }
        }
        
        console.log('すべてのCSVファイルの処理が完了しました');
      } else {
        console.log('CSVファイルが見つかりませんでした');
      }
    } catch (error) {
      console.error('CSVファイルのロード中にエラーが発生しました:', error);
      // エラーがあってもサーバーは継続
    }
    
    // タグメタデータファイルの処理
    try {
      console.log('タグメタデータファイル変更の確認を開始します...');
      const { detectChangedTranslationFiles } = require('../utils/file-watcher');
      const changedTranslationFiles = detectChangedTranslationFiles();
      
      // まずタグメタデータをロードして、キャッシュ化する
      console.log('タグメタデータをロードしてキャッシュします...');
      await loadAndCacheMetadata();
      
      if (changedTranslationFiles.length > 0) {
        console.log(`${changedTranslationFiles.length}個のタグメタデータファイルの変更を検出しました`);
      } else {
        console.log('更新されたタグメタデータファイルはありません');
      }
      
      console.log('タグメタデータのロードが完了しました');
    } catch (error) {
      console.error('タグメタデータファイルの処理中にエラーが発生しました:', error);
      // エラーがあってもサーバーは継続
    }
    
    console.log('IF-HUBの初期化が完了しました');
  } catch (error) {
    console.error('サーバー初期化プロセス中に致命的なエラーが発生しました:', error);
    throw error;
  }
}

/**
 * ファイル監視を設定する
 */
function setupFileWatchers() {
  const { 
    detectChangedFiles, 
    detectChangedTranslationFiles 
  } = require('../utils/file-watcher');
  const { importSpecificCsvFile } = require('../utils/csv-importer');
  
  // 1分おきにCSVフォルダを監視
  console.log(`CSVフォルダ監視を開始します (間隔: 1分)`);
  setInterval(async () => {
    try {
      const changedFiles = detectChangedFiles();
      
      if (changedFiles.length > 0) {
        console.log(`${changedFiles.length}個のCSVファイルの変更を検出しました`);
        
        for (const fileInfo of changedFiles) {
          console.log(`ファイル ${fileInfo.name} の更新を処理します（チェックサム: ${fileInfo.checksum.substring(0, 8)}...）`);
          try {
            await importSpecificCsvFile(fileInfo);
            console.log(`ファイル ${fileInfo.name} の更新処理が完了しました`);
          } catch (importError) {
            console.error(`ファイル ${fileInfo.name} の更新処理中にエラーが発生しました:`, importError);
          }
        }
      }
    } catch (error) {
      console.error('CSV監視処理中にエラーが発生しました:', error);
    }
  }, 60000); // 1分間隔
  
  // 5分おきにタグメタデータファイルを監視
  console.log(`タグメタデータファイル監視を開始します (間隔: 5分)`);
  setInterval(async () => {
    try {
      const changedTranslationFiles = detectChangedTranslationFiles();
      
      if (changedTranslationFiles.length > 0) {
        console.log(`${changedTranslationFiles.length}個のタグメタデータファイルの変更を検出しました`);
        
        // タグメタデータをインポート
        await importTagMetadata();
        
        console.log('タグメタデータファイルの更新処理が完了しました');
      }
    } catch (error) {
      console.error('タグメタデータファイル監視処理中にエラーが発生しました:', error);
    }
  }, 300000); // 5分間隔
  
  // 5分おきにgtag定義ファイルを監視
  console.log(`gtag定義ファイル監視を開始します (間隔: 5分)`);
  setInterval(async () => {
    try {
      const changedGtagFiles = detectChangedGtagFiles();
      
      if (changedGtagFiles.length > 0) {
        console.log(`${changedGtagFiles.length}個のgtag定義ファイルの変更を検出しました`);
        
        for (const fileInfo of changedGtagFiles) {
          console.log(`gtag定義「${fileInfo.name}」の更新を処理します (チェックサム: ${fileInfo.checksum.substring(0, 8)}...)`);
          try {
            await importGtagDefinition(fileInfo);
            console.log(`gtag定義「${fileInfo.name}」の更新処理が完了しました`);
          } catch (importError) {
            console.error(`gtag定義「${fileInfo.name}」の更新処理中にエラーが発生しました:`, importError);
          }
        }
      }
    } catch (error) {
      console.error('gtag定義ファイル監視処理中にエラーが発生しました:', error);
    }
  }, 300000); // 5分間隔
}

/**
 * アプリケーションの状態情報を取得する
 * @returns {Object} システム情報オブジェクト
 */
function getAppStatus() {
  try {
    // タグ数の取得
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
    
    // 設備数の取得
    const equipmentCount = db.prepare('SELECT COUNT(DISTINCT equipment) as count FROM tags').get().count;
    
    // データポイント数の取得
    const dataPointCount = db.prepare('SELECT COUNT(*) as count FROM tag_data').get().count;
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.environment,
      version: '1.0.0',
      database: {
        type: 'SQLite',
        tags: tagCount,
        equipment: equipmentCount,
        dataPoints: dataPointCount
      }
    };
  } catch (error) {
    console.error('アプリケーション状態の取得中にエラーが発生しました:', error);
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

module.exports = {
  initializeServer,
  setupFileWatchers,
  getAppStatus
};
