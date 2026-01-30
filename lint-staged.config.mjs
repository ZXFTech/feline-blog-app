/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
const config = {
  // 对 JS/TS：先 eslint fix，再 prettier（数组语法保证顺序执行）
  "*.{js,jsx,ts,tsx}": [
    "eslint --fix",
    "prettier --write --ignore-unknown",
    "node bin/check-no-debug-code.mjs",
  ],

  // 对其他常见文本：只跑 prettier
  "*.{json,md,css,scss,yaml,yml}": ["prettier --write --ignore-unknown"],
  "locales/*.json": ["npm run i18n:check"],
};

export default config;
