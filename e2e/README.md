# 全功能 E2E 測試

兩支模擬 iPhone（A = Ryan，B = 寶貝）走過所有功能：初始設定、紀念日、行事曆即時同步、每週重複、
邀請函（選第二個候選時間答應）、扭蛋（兩人準備 → 兩支手機同步開獎 → 上傳證明）、
相簿（JPEG + HEIC、重複辨識、相簿分組）、願望附照片、位置與報平安、首頁彙整、後台、.ics、簽章 URL。

> ⚠️ 測試會從「初始設定」開始，所以只能對**全新、空的資料庫**跑。
> **絕對不要對正式環境跑**。請在另一個資料夾 clone 一份 repo 來測。

```bash
git clone <repo> us-app-test && cd us-app-test
make local                      # http://localhost:8080，全新的 data/
npm i -g playwright && npx playwright install chromium
node e2e/full.cjs               # 截圖存在 e2e/screenshots/
```
