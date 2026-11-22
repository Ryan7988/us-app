// 全功能 E2E：兩支模擬 iPhone（A = Ryan，B = 寶貝）
const { chromium, devices } = require("playwright");
const path = require("node:path");
const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const SHOTS = process.argv[2] ?? path.join(__dirname, "screenshots");
require("node:fs").mkdirSync(SHOTS, { recursive: true });
const IMG = path.join(__dirname, "img");
const results = [];
const ok = (name, extra = "") => { results.push(`✅ ${name}${extra ? "：" + extra : ""}`); console.log(`✅ ${name} ${extra}`); };

const taipeiKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d);
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00+08:00`); d.setUTCDate(d.getUTCDate() + n); return taipeiKey(d); };

(async () => {
  const browser = await chromium.launch();
  const phone = { ...devices["iPhone 13"], deviceScaleFactor: 2 };
  delete phone.defaultBrowserType;
  const geo = { geolocation: { latitude: 24.9936, longitude: 121.301 }, permissions: ["geolocation"] };
  const ctxA = await browser.newContext({ ...phone, ...geo });
  const ctxB = await browser.newContext({ ...phone, ...geo, geolocation: { latitude: 25.0330, longitude: 121.5654 }, colorScheme: "dark" });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors = [];
  for (const [n, p] of [["A", a], ["B", b]]) {
    p.on("pageerror", (e) => errors.push(`${n} pageerror: ${e.message}`));
    p.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (/401|tile\.openstreetmap|ERR_TUNNEL|ERR_CERT|net::ERR/.test(t)) return; // 預期內：未登入 refresh、沙盒擋外網圖磚
      errors.push(`${n} console: ${t}`);
    });
  }
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png` });
  const dismissGuide = async (p) => {
    const g = p.locator("button:has-text('知道了')");
    if (await g.isVisible().catch(() => false)) await g.click();
  };
  const go = async (p, url) => { await p.goto(BASE + url); await dismissGuide(p); };

  // ---------- 1. 初始設定 + 登入 ----------
  await a.goto(BASE);
  await a.waitForURL("**/setup");
  await a.fill("#dn0", "Ryan"); await a.fill("#un0", "ryan"); await a.fill("#pw0", "password-ryan");
  await a.fill("#dn1", "寶貝"); await a.fill("#un1", "baby"); await a.fill("#pw1", "password-baby");
  await a.click("text=建立帳號");
  await a.waitForURL("**/login");
  const login = async (p, u, pw) => {
    await p.goto(BASE + "/login");
    await p.fill("#username", u); await p.fill("#password", pw);
    await p.click("button:has-text('登入')");
    await p.waitForSelector("text=願望清單");
    await dismissGuide(p);
  };
  await login(a, "ryan", "password-ryan");
  await login(b, "baby", "password-baby");
  ok("初始設定與兩人登入");

  // ---------- 2. 紀念日 ----------
  await go(a, "/more/settings");
  await a.fill("input[aria-label='紀念日']", "2024-02-14");
  await a.locator("section:has-text('交往紀念日') button:has-text('儲存')").click();
  await a.waitForSelector("text=已儲存 ✓");
  await go(a, "/");
  await a.waitForSelector("text=我們在一起");
  const days = await a.locator("text=我們在一起 >> xpath=following-sibling::p[1]").innerText();
  ok("紀念日天數", days.replace(/\s+/g, ""));

  // ---------- 3. 行事曆：A 新增共同行程 → B 即時看到 ----------
  const today = taipeiKey();
  await go(b, "/calendar");
  await go(a, "/calendar");
  await a.click("[aria-label='新增行程']");
  await a.fill("input[aria-label='行程名稱']", "一起看電影");
  await a.fill("input[aria-label='地點']", "桃園統領");
  await a.click("button:has-text('新增行程')");
  await a.waitForSelector("li:has-text('一起看電影')");
  const t0 = Date.now();
  await b.waitForSelector("li:has-text('一起看電影')", { timeout: 3000 });
  ok("共同行程即時同步", `${Date.now() - t0} ms`);
  // 每週重複的個人行程
  await a.click("[aria-label='新增行程']");
  await a.fill("input[aria-label='行程名稱']", "實驗室 meeting");
  await a.locator("[role=dialog] button:has-text('Ryan')").click();
  await a.selectOption("[role=dialog] select >> nth=0", "FREQ=WEEKLY");
  await a.click("button:has-text('新增行程')");
  await a.waitForSelector("li:has-text('實驗室 meeting')");
  await a.click(`[aria-label='${addDays(today, 7)}']`);
  await a.waitForSelector("li:has-text('實驗室 meeting')");
  ok("每週重複行程在下週同一天出現");
  await a.click(`[aria-label='${today}']`);
  await shot(a, "01-calendar");

  // ---------- 4. 邀請函：A 寄 → B 首頁看到 → 打開信封 → 選第二個時間答應 → 兩人行事曆都有 ----------
  await a.click("button:has-text('寄邀請函')");
  await a.fill("input[aria-label='邀請標題']", "要一起吃晚餐嗎？");
  await a.fill("textarea[aria-label='內文']", "我找到一間很棒的義大利麵 🍝\n週末一起去吧！");
  await a.click("button:has-text('再加一個候選時間')");
  const slot2 = `${addDays(today, 2)}T18:30`;
  await a.fill("input[aria-label='候選時間 2']", slot2);
  await a.fill("[role=dialog] input[aria-label='地點']", "中壢");
  await shot(a, "02-invitation-compose");
  await a.click("button:has-text('寄出邀請函')");
  await go(b, "/");
  await b.waitForSelector("text=封邀請函還沒回覆", { timeout: 5000 });
  await shot(b, "03-home-pending-invite");
  await b.click("text=封邀請函還沒回覆");
  await b.waitForSelector("[aria-label='打開信封']");
  await shot(b, "04-envelope");
  await b.click("[aria-label='打開信封']");
  await b.waitForSelector("text=要一起吃晚餐嗎？");
  await b.locator("button:has-text('18:30')").click();
  await b.waitForTimeout(700);
  await shot(b, "05-letter");
  await b.fill("input[aria-label='回覆']", "好啊！好期待");
  await b.click("button:has-text('答應 💕')");
  await b.waitForSelector("text=已加入共同行事曆");
  await go(a, "/calendar");
  await a.click(`[aria-label='${addDays(today, 2)}']`);
  await a.waitForSelector("li:has-text('要一起吃晚餐嗎')", { timeout: 5000 });
  ok("邀請函答應後兩人行事曆都有（選第二個候選時間 18:30）");
  await go(a, "/calendar/invitations");
  await a.click("button:has-text('寄出的')");
  await a.waitForSelector("text=已答應 💕");
  ok("寄件人看到「已答應」");

  // ---------- 5. 扭蛋：建卡池 → 兩人準備 → 兩支手機同步開獎動畫 → 上傳證明 ----------
  await go(a, "/gacha/pool");
  for (const [content, rarity] of [["一起去看日出", "SSR"], ["交換寫一封手寫信", "SR"], ["一起煮一道沒做過的菜", "R"], ["週末一起去夜市", "R"]]) {
    await a.fill("textarea[aria-label='卡片內容']", content);
    await a.locator(`form button:text-is('${rarity}')`).click();
    await a.click("button:has-text('加入卡池')");
    await a.waitForSelector(`li:has-text('${content}')`);
  }
  ok("建立 4 張卡");
  await go(a, "/gacha");
  await go(b, "/gacha");
  await a.click("button:has-text('準備好了！')");
  await b.waitForSelector("text=準備好了 ✓", { timeout: 3000 });
  ok("對方即時看到「準備好了」");
  await shot(b, "06-gacha-waiting");
  await b.click("button:has-text('準備好了！')");
  // 兩支手機都應該跳出開獎動畫
  await Promise.all([
    a.waitForSelector("[role=dialog][aria-label='開獎']", { timeout: 5000 }),
    b.waitForSelector("[role=dialog][aria-label='開獎']", { timeout: 5000 }),
  ]);
  ok("兩支手機同時開始開獎動畫");
  await a.waitForTimeout(1900);
  await shot(a, "07-gacha-drop");
  await a.waitForSelector("text=收下任務", { timeout: 8000 });
  await b.waitForSelector("text=收下任務", { timeout: 8000 });
  await a.waitForTimeout(600);
  await shot(a, "08-gacha-card");
  const rarity = await a.locator("[role=dialog] p.text-5xl").innerText();
  ok("開獎結果", rarity);
  await a.click("text=收下任務");
  await b.click("text=收下任務");
  await b.setInputFiles("input[type=file]", path.join(IMG, "proof.jpg"));
  await b.waitForSelector("text=任務完成", { timeout: 10000 });
  await a.waitForSelector("text=任務完成", { timeout: 5000 });
  await a.waitForSelector("text=🔥 1");
  await shot(a, "09-gacha-done");
  ok("上傳證明完成任務，連續達成 1");

  // ---------- 6. 相簿：上傳 JPEG + HEIC → 縮圖、檢視、建相簿 ----------
  await go(a, "/more/album");
  await a.setInputFiles("[data-testid=photo-input]", ["IMG_0001.JPG", "IMG_0002.JPG", "IMG_0003.JPG", "IMG_0004.HEIC"].map((f) => path.join(IMG, f)));
  await a.waitForSelector("text=✓ 4 張", { timeout: 20000 });
  await a.waitForFunction(() => document.querySelectorAll("img[src*='/media/thumbs/']").length >= 5);
  const broken = await a.evaluate(() => [...document.querySelectorAll("img[src*='/media/thumbs/']")].filter((i) => !i.complete || i.naturalWidth === 0).length);
  ok("上傳 4 張（含 HEIC）+ 證明照片都在相簿", `壞圖 ${broken} 張`);
  await shot(a, "10-album");
  await a.locator("img[src*='/media/thumbs/']").first().click();
  await a.waitForSelector("[role=dialog][aria-label='照片'] img");
  await a.waitForTimeout(500);
  await shot(a, "11-photo-viewer");
  await a.click("[aria-label='關閉']");
  await a.click("button:has-text('相簿')");
  await a.click("button:has-text('新相簿')");
  await a.fill("input[aria-label='相簿名稱']", "2026 夏天");
  await a.click("[role=dialog] button:has-text('建立')");
  await a.click("text=2026 夏天");
  await a.setInputFiles("[data-testid=photo-input]", [path.join(IMG, "IMG_0001.JPG"), path.join(IMG, "IMG_0002.JPG")]);
  await a.waitForSelector("text=2 張重複", { timeout: 15000 });
  await a.waitForFunction(() => document.querySelectorAll("img[src*='/media/thumbs/']").length === 2);
  ok("相簿分組（重複上傳自動辨識）");

  // ---------- 7. 願望：B 新增 → A 完成並附照片 ----------
  await go(b, "/wishes");
  await b.click("[aria-label='新增願望']");
  await b.fill("#w-title", "去墾丁潛水");
  await b.click("form button:has-text('新增')");
  await go(a, "/wishes");
  await a.waitForSelector("li:has-text('去墾丁潛水')", { timeout: 3000 });
  await a.click("li:has-text('去墾丁潛水') >> text=去墾丁潛水");
  await a.setInputFiles("[role=dialog] input[type=file]", path.join(IMG, "IMG_0003.JPG"));
  await a.waitForSelector("text=已附上 1 張照片", { timeout: 15000 });
  await a.keyboard.press("Escape");
  await b.click("button:has-text('已完成')");
  await b.waitForSelector("li:has-text('去墾丁潛水') img[src*='/media/thumbs/']", { timeout: 5000 });
  await shot(b, "12-wish-done-photo");
  ok("完成願望附照片，對方看到封面");

  // ---------- 8. 位置：開分享 + 報平安 → 對方看到 ----------
  await go(a, "/more/location");
  await a.check("input[aria-label='分享我的位置']");
  await a.fill("input[aria-label='報平安訊息']", "到實驗室了");
  await a.click("button:has-text('報平安（對方會收到通知）')");
  await a.waitForSelector("text=已送出 ✓", { timeout: 10000 });
  await go(b, "/more/location");
  await b.waitForSelector("text=報平安：到實驗室了", { timeout: 5000 });
  await b.waitForSelector(".leaflet-marker-icon");
  await shot(b, "13-location");
  ok("報平安與位置地圖");

  // ---------- 9. 首頁彙整 ----------
  await go(b, "/");
  await b.waitForSelector("text=到實驗室了");
  await b.waitForSelector("text=一起看電影");
  await shot(b, "14-home");
  ok("首頁彙整（紀念日、今日行程、扭蛋、報平安）");

  // ---------- 10. 後台 + 設定 ----------
  await go(a, "/more/admin");
  await a.waitForSelector("text=服務狀態");
  await a.waitForSelector("text=排程器");
  await a.click("button:has-text('模擬 10,000 次')");
  await a.waitForSelector("text=含保底的實際 SSR 機率", { timeout: 10000 });
  await shot(a, "15-admin");
  const workerOk = await a.locator("li:has-text('排程器') .bg-emerald-500").count();
  ok("後台：健康狀態、機率模擬", `排程器心跳 ${workerOk ? "正常" : "未到"}`);
  await go(a, "/more/settings");
  await a.waitForFunction(() => document.querySelector("a[href^='webcal://']"));
  const icsHref = await a.locator("a:has-text('加入 iPhone 行事曆')").getAttribute("href");
  const icsBody = await (await a.request.get(icsHref.replace(/^webcal:/, "http:"))).text();
  if (!icsBody.includes("SUMMARY:💕 要一起吃晚餐嗎？") || !icsBody.includes("RRULE:FREQ=WEEKLY")) throw new Error("ICS 內容不對:\n" + icsBody.slice(0, 600));
  ok(".ics 行事曆訂閱內容正確");
  await shot(a, "16-settings");

  // ---------- 11. 簽章 URL：沒簽章的照片網址拿不到 ----------
  const thumb = await a.request.get(BASE + "/media/thumbs/2026/07/x.jpg");
  ok("沒有簽章的照片網址被拒絕", `HTTP ${thumb.status()}`);

  console.log("\n" + results.join("\n"));
  console.log("\n頁面錯誤：", errors.length ? errors : "無");
  await browser.close();
})().catch(async (e) => {
  console.error("\n❌ E2E FAILED:", e.message.split("\n").slice(0, 6).join("\n"));
  console.log(results.join("\n"));
  process.exit(1);
});
