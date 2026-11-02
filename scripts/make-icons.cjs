// 用 Playwright Chromium 把 public/icon.svg 轉成 PNG（只在改圖示時手動執行）
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const path = require('node:path');

(async () => {
  const pub = path.join(__dirname, '..', 'public');
  const svg = readFileSync(path.join(pub, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: path.join(pub, `icon-${size}.png`) });
    await page.close();
  }
  await browser.close();
  console.log('icons done');
})();
