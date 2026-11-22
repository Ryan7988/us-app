// 產生 PWA 圖示與 iOS 啟動畫面：node scripts/gen-icons.cjs
// 需要 Playwright（開發機有即可，產出的 PNG 直接進版控）
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const PUB = path.join(__dirname, "..", "public");
const HEART =
  '<path d="M50 82S18 62 18 37a16 16 0 0 1 32-6 16 16 0 0 1 32 6c0 25-32 45-32 45z" fill="#fff"/>';
const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f9a8d4"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <g transform="translate(${pad} ${pad + 2}) scale(${(100 - 2 * pad) / 100})">${HEART}</g></svg>`;

// iPhone 直式解析度（CSS 寬 x 高 @ 倍率）
const SPLASH = [
  [375, 812, 3], [414, 896, 2], [414, 896, 3], [390, 844, 3], [393, 852, 3],
  [428, 926, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [375, 667, 2],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (html, w, h, file) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0">${html}</body></html>`);
    await page.screenshot({ path: path.join(PUB, file), omitBackground: false });
  };
  const sq = (svg, s) => `<div style="width:${s}px;height:${s}px">${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}</div>`;

  await shot(sq(icon(14), 192), 192, 192, "icons/icon-192.png");
  await shot(sq(icon(14), 512), 512, 512, "icons/icon-512.png");
  await shot(sq(icon(24), 512), 512, 512, "icons/icon-maskable-512.png"); // 安全區 80%
  await shot(sq(icon(16), 180), 180, 180, "icons/apple-touch-icon.png");

  const links = [];
  for (const [w, h, r] of SPLASH) {
    const pw = w * r, ph = h * r, s = Math.round(pw * 0.28);
    const name = `splash/splash-${pw}x${ph}.png`;
    await shot(
      `<div style="width:${pw}px;height:${ph}px;background:#fdf2f8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s * 0.15}px;font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif">
        <div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;overflow:hidden">${icon(14).replace("<svg ", `<svg width="${s}" height="${s}" `)}</div>
        <div style="font-size:${s * 0.22}px;color:#be185d;font-weight:600">我們</div></div>`,
      pw, ph, name,
    );
    links.push(
      `    <link rel="apple-touch-startup-image" href="/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" />`,
    );
  }
  await browser.close();

  const indexPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(indexPath, "utf-8").replace(
    /( *)<!--SPLASH-->[\s\S]*?(<!--\/SPLASH-->|(?=\n))/,
    `    <!--SPLASH-->\n${links.join("\n")}\n    <!--/SPLASH-->`,
  );
  fs.writeFileSync(indexPath, html);
  console.log("icons + splash generated");
})();
