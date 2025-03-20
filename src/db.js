// src/db.js
// Copyright (c) 2025 toorPIA / toor Inc.
const sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');
const config = require('./config');

// データベースファイルのパス
const DB_PATH = process.env.DB_PATH || path.join(config.dataSource.staticDataPath, '../db/if_hub.db');

// データディレクトリの確保
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`データベースファイル: ${DB_PATH}`);

// データベース接続の初期化
const db = sqlite3(DB_PATH);

// テーブルの作成
function initDatabase() {
  // タグメタデータテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      equipment TEXT NOT NULL,
      name TEXT NOT NULL,
      source_tag TEXT NOT NULL,
      unit TEXT,
      min REAL,
      max REAL
    )
  `);
  
  // 時系列データテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_data (
      tag_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      value REAL,
      PRIMARY KEY (tag_id, timestamp),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )
  `);
  
  // タグ表示名テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_translations (
      tag_id TEXT NOT NULL,
      language TEXT NOT NULL,
      display_name TEXT NOT NULL,
      unit TEXT,
      PRIMARY KEY (tag_id, language),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    )
  `);
  
  // インデックス作成（検索高速化のため）
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tag_data_timestamp ON tag_data(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_equipment ON tags(equipment)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_source_tag ON tags(source_tag)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tag_translations_tag_id ON tag_translations(tag_id)`);

  console.log('データベーステーブルの初期化が完了しました');
}

// データベースを初期化
initDatabase();

module.exports = { db };
