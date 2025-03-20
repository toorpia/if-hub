// src/app.js
// Copyright (c) 2025 toorPIA / toor Inc.
const express = require('express');
const cors = require('cors');
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

// ルート設定
app.use(routes);

module.exports = app;
