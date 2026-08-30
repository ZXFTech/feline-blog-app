/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
const config = {
  // 对 JS/TS：先 eslint fix（缓存加速），再 prettier
  "*.{js,jsx,ts,tsx}": [
    "eslint --fix --cache",
    "prettier --write --ignore-unknown",
    "node bin/check-no-debug-code.mjs",
  ],

  // 对其他常见文本：只跑 prettier
  "*.{json,md,css,scss,yaml,yml}": ["prettier --write --ignore-unknown"],
};

export default config;
