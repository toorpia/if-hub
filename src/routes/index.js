// src/routes/index.js
const express = require('express');
const router = express.Router();

// 各ルーターをインポート
const systemRoutes = require('./system');
const tagsRoutes = require('./tags');
const equipmentRoutes = require('./equipment');
const dataRoutes = require('./data');
const processRoutes = require('./process');

// 各ルーターを登録
router.use(systemRoutes);
router.use(tagsRoutes);
router.use(equipmentRoutes);
router.use(dataRoutes);
router.use(processRoutes);

module.exports = router;
