/**
 * Jestグローバルセットアップファイル
 */

// ファイルをモジュールとして扱うためのエクスポート
export {};

// グローバルタイムアウトの設定
jest.setTimeout(30000); // 30秒

// グローバルマッチャーの追加
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// カスタムマッチャータイプの定義
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

// コンソール出力のモック化
beforeAll(() => {
  // テスト中のコンソール出力を抑制
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // エラーはそのまま出力（デバッグのため）
  // jest.spyOn(console, 'error').mockImplementation(() => {});
});

// テスト終了時にモックをリストア
afterAll(() => {
  jest.restoreAllMocks();
});
