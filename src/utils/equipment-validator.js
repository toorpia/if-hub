// src/utils/equipment-validator.js
// 設備名の検証ユーティリティ

/**
 * 設備名として有効な文字のパターン
 * 許可: 英数字、ハイフン(-)、アンダースコア(_)
 */
const VALID_EQUIPMENT_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * 設備名の有効性を検証
 * @param {string} name 設備名
 * @returns {Object} 検証結果 { valid: boolean, error?: string }
 */
function validateEquipmentName(name) {
  // 空文字チェック
  if (!name || typeof name !== 'string') {
    return {
      valid: false,
      error: '設備名が空または無効です'
    };
  }

  // 文字列の前後の空白を除去
  const trimmedName = name.trim();
  
  if (!trimmedName) {
    return {
      valid: false,
      error: '設備名が空です'
    };
  }

  // 許可文字のパターンチェック
  if (!VALID_EQUIPMENT_NAME_PATTERN.test(trimmedName)) {
    return {
      valid: false,
      error: `設備名は英数字、ハイフン(-)、アンダースコア(_)のみ使用可能です: "${trimmedName}"`
    };
  }

  return { valid: true };
}

/**
 * 設備名のリストを一括検証
 * @param {string[]} names 設備名のリスト
 * @returns {Object} 検証結果 { valid: boolean, errors: string[], validNames: string[] }
 */
function validateEquipmentNames(names) {
  if (!Array.isArray(names)) {
    return {
      valid: false,
      errors: ['設備名リストが配列ではありません'],
      validNames: []
    };
  }

  const errors = [];
  const validNames = [];

  for (const name of names) {
    const result = validateEquipmentName(name);
    if (result.valid) {
      validNames.push(name.trim());
    } else {
      errors.push(result.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validNames
  };
}

/**
 * 設備名から不正文字を除去して正規化
 * @param {string} name 設備名
 * @returns {string} 正規化された設備名
 */
function normalizeEquipmentName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // 許可文字以外を除去
  return name.replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * 設備名の命名規則ガイド
 */
const EQUIPMENT_NAMING_GUIDE = {
  allowed: 'A-Z, a-z, 0-9, -, _',
  examples: {
    valid: ['Pump01', 'Tank-A', 'Unit_7', '7th-untan'],
    invalid: ['Pump.01', 'Tank?A', 'Unit[7]', '7th|untan']
  },
  rules: [
    '英数字のみ使用可能',
    'ハイフン(-)とアンダースコア(_)のみ記号として使用可能',
    'ピリオド(.)は禁止（タグ名分離のため）',
    '空白や制御文字は使用不可'
  ]
};

module.exports = {
  validateEquipmentName,
  validateEquipmentNames,
  normalizeEquipmentName,
  EQUIPMENT_NAMING_GUIDE,
  VALID_EQUIPMENT_NAME_PATTERN
};
