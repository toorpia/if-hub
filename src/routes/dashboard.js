// src/routes/dashboard.js
// Copyright (c) 2025 toorPIA / toor Inc.
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { query } = require('../db');

/**
 * GET /api/dashboard/overview
 * システム概要統計を返す
 */
router.get('/api/dashboard/overview', async (req, res) => {
  try {
    // 設備数を取得
    const equipmentsPath = path.join(process.cwd(), 'configs', 'equipments');
    const equipmentDirs = await fs.readdir(equipmentsPath, { withFileTypes: true });
    const equipmentCount = equipmentDirs.filter(dirent => dirent.isDirectory()).length;

    // タグ統計をデータベースから取得
    const tagCountResult = await query('SELECT COUNT(DISTINCT name) as count FROM tags');
    const tagCount = parseInt(tagCountResult[0]?.count || 0);

    // gTag数を取得（gtags/ディレクトリ内のファイル数）
    const gtagsPath = path.join(process.cwd(), 'gtags');
    let gtagCount = 0;
    try {
      const gtagFiles = await fs.readdir(gtagsPath);
      gtagCount = gtagFiles.filter(file =>
        file.endsWith('.py') || file.endsWith('.rs') || file.endsWith('.go') || file.endsWith('.cpp')
      ).length;
    } catch (err) {
      // gtags ディレクトリが存在しない場合は0
      gtagCount = 0;
    }

    // 最終データ更新時刻を取得
    const lastUpdateResult = await query(
      'SELECT MAX(timestamp) as last_update FROM tag_data'
    );
    const lastDataUpdate = lastUpdateResult[0]?.last_update || null;

    // PI-Ingester稼働状態を取得
    const ingesterStatePath = path.join(process.cwd(), 'logs', 'ingester-state.json');
    let ingesterStatus = 'unknown';
    let ingesterLastUpdate = null;

    try {
      const stateData = await fs.readFile(ingesterStatePath, 'utf8');
      const state = JSON.parse(stateData);
      ingesterLastUpdate = state.lastUpdated;

      // 最終更新から5分以内なら稼働中とみなす
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      ingesterStatus = new Date(ingesterLastUpdate) > fiveMinutesAgo ? 'running' : 'stopped';
    } catch (err) {
      ingesterStatus = 'unknown';
    }

    res.json({
      equipmentCount,
      tagCount,
      gtagCount,
      lastDataUpdate,
      ingester: {
        status: ingesterStatus,
        lastUpdate: ingesterLastUpdate
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

/**
 * GET /api/dashboard/equipments
 * 設備一覧を返す
 */
router.get('/api/dashboard/equipments', async (req, res) => {
  try {
    const equipmentsPath = path.join(process.cwd(), 'configs', 'equipments');
    const equipmentDirs = await fs.readdir(equipmentsPath, { withFileTypes: true });

    const equipments = [];

    for (const dirent of equipmentDirs) {
      if (!dirent.isDirectory()) continue;

      const equipmentName = dirent.name;
      const equipmentPath = path.join(equipmentsPath, equipmentName);

      // 設備ディレクトリ内の設定ファイルを検索
      const configFiles = await fs.readdir(equipmentPath);
      const yamlFiles = configFiles.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      let totalTags = 0;
      let piIntegrationEnabled = false;
      let configDetails = [];

      for (const configFile of yamlFiles) {
        try {
          const configPath = path.join(equipmentPath, configFile);
          const configContent = await fs.readFile(configPath, 'utf8');
          const config = yaml.load(configContent);

          // source_tagsの数を集計
          const sourceTags = config?.basemap?.source_tags || [];
          totalTags += sourceTags.length;

          // PI連携の有無を確認
          if (config?.pi_integration?.enabled) {
            piIntegrationEnabled = true;
          }

          configDetails.push({
            file: configFile,
            tagCount: sourceTags.length,
            interval: config?.basemap?.addplot?.interval || null,
            piEnabled: config?.pi_integration?.enabled || false
          });
        } catch (err) {
          console.error(`Error reading config ${configFile}:`, err);
        }
      }

      equipments.push({
        name: equipmentName,
        totalTags,
        piIntegrationEnabled,
        configCount: yamlFiles.length,
        configs: configDetails
      });
    }

    res.json({ equipments });
  } catch (error) {
    console.error('Error fetching equipments:', error);
    res.status(500).json({ error: 'Failed to fetch equipment list' });
  }
});

/**
 * GET /api/dashboard/tags/summary
 * タグ統計情報を返す
 */
router.get('/api/dashboard/tags/summary', async (req, res) => {
  try {
    // タグ総数
    const totalCountResult = await query(
      'SELECT COUNT(DISTINCT name) as count FROM tags'
    );
    const totalCount = parseInt(totalCountResult[0]?.count || 0);

    // データポイント総数
    const dataPointsResult = await query(
      'SELECT COUNT(*) as count FROM tag_data'
    );
    const totalDataPoints = parseInt(dataPointsResult[0]?.count || 0);

    // 最古・最新のデータ時刻
    const timeRangeResult = await query(
      'SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM tag_data'
    );
    const oldestData = timeRangeResult[0]?.oldest || null;
    const newestData = timeRangeResult[0]?.newest || null;

    // 最近更新されたタグ（上位10件）
    const recentTags = await query(`
      SELECT t.name as tag_name, MAX(td.timestamp) as last_update
      FROM tag_data td
      JOIN tags t ON td.tag_id = t.id
      GROUP BY t.name
      ORDER BY last_update DESC
      LIMIT 10
    `);

    res.json({
      totalCount,
      totalDataPoints,
      dataRetention: {
        oldest: oldestData,
        newest: newestData
      },
      recentTags
    });
  } catch (error) {
    console.error('Error fetching tag summary:', error);
    res.status(500).json({ error: 'Failed to fetch tag summary' });
  }
});

/**
 * GET /api/dashboard/ingester/status
 * PI-Ingester状態を返す
 */
router.get('/api/dashboard/ingester/status', async (req, res) => {
  try {
    const ingesterStatePath = path.join(process.cwd(), 'logs', 'ingester-state.json');

    const stateData = await fs.readFile(ingesterStatePath, 'utf8');
    const state = JSON.parse(stateData);

    // 各設備の状態を整形
    const equipmentStates = [];
    for (const [equipmentKey, equipmentState] of Object.entries(state.equipment || {})) {
      const lastFetchTime = equipmentState.lastFetchTime;
      const lastSuccessTime = equipmentState.lastSuccessTime;
      const errorCount = equipmentState.errorCount || 0;

      // 最終取得から10分以内なら正常、それ以外は警告
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const status = new Date(lastFetchTime) > tenMinutesAgo
        ? (errorCount > 0 ? 'warning' : 'healthy')
        : 'error';

      equipmentStates.push({
        equipment: equipmentKey,
        status,
        lastFetchTime,
        lastSuccessTime,
        errorCount
      });
    }

    res.json({
      lastUpdated: state.lastUpdated,
      equipments: equipmentStates
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      // ファイルが存在しない場合
      res.json({
        lastUpdated: null,
        equipments: [],
        message: 'Ingester state file not found. Ingester may not be running.'
      });
    } else {
      console.error('Error fetching ingester status:', error);
      res.status(500).json({ error: 'Failed to fetch ingester status' });
    }
  }
});

module.exports = router;
