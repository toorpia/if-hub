// src/app.js
// Copyright (c) 2025 toorPIA / toor Inc.
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const routes = require('./routes');

// Expressアプリケーションの初期化
const app = express();

// CORS設定
app.use(cors({
  origin: config.server.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSONパース対応
app.use(express.json());

// APIルート設定（静的ファイルより先に設定）
app.use(routes);

// 静的ファイル配信（ダッシュボード）
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// SPA用のフォールバック: APIルート以外はindex.htmlを返す
app.get('*', (req, res, next) => {
  // APIルートの場合はスキップ
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

module.exports = app;
