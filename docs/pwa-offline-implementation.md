# PWA 離線使用實作說明

這份文件整理 QR Reader 為了支援 **iOS / PWA 離線使用**，以及縮短 **time-to-first-scan** 所做的修改。結構參照 [Cozy Pocket 的同名文件](https://github.com/rexx/Cozy-Pocket/blob/main/docs/pwa-offline-implementation.md)。

## 1. 目標

這個 app 的定位是「掏出手機、開啟、掃碼」。網路只有歷史同步需要，掃描本身完全是本機運算，所以離線目標很明確：

- 加入 iOS 主畫面後，離線仍可冷啟動
- 掃描、上傳圖片解碼、歷史瀏覽、設定，離線全部可用
- 雲同步在離線時明確降級，不阻塞也不假裝失敗
- 網路差的時候，啟動速度不應該比離線時慢

### 先做分流判準

這份文件的離線降級（§3.4、§3.5）與相機暖機（§4.1）只對「有網路呼叫」或「有非同步啟動資源」的 app 有意義。套用到別的專案之前先確認：

```bash
grep -rE 'fetch\(|XMLHttpRequest|getUserMedia|indexedDB|localStorage' src/
```

如果一個都沒有（純本地運算的 app，例如題目在前端生成、音效用 Web Audio 合成的小遊戲），那 §3.4、§3.5、§4.1、§4.4 整段可略——實際要做的只有 §3.1 拔外部依賴、§3.2 precache、§3.3 路徑對齊、§4.3 boot shell。先分流可以省下不少力氣。

## 2. 為什麼 HTTP cache 不夠

這是最容易誤判的一點，所以先講。「資源不是都被瀏覽器快取了嗎？」——實際量測 2026-08-23 的 response header：

| 資源 | `cache-control` | 有效期 |
|---|---|---|
| GitHub Pages `index.html` | `max-age=600` | 10 分鐘 |
| GitHub Pages 的 content-hashed JS | `max-age=600` | 10 分鐘 |
| `cdn.tailwindcss.com` | `max-age=14400`（且是 302 轉址） | 4 小時 |
| `googletagmanager.com/gtag/js` | `private, max-age=900` | 15 分鐘 |
| Google Fonts CSS | `private, max-age=86400` | 1 天 |
| Font Awesome (cdnjs) | `max-age=30672000, immutable` | 355 天 |

兩個結論：

1. **GitHub Pages 對 content-hashed 資產也只給 600 秒。** 一般 CDN 會給 hashed 檔名 `immutable`，GH Pages 不會。距離上次開啟超過 10 分鐘，主 bundle 就要重新驗證一次。
2. **HTTP cache 沒有網路失敗就自動退回快取這種語意。** `max-age` 過期後，瀏覽器會發 conditional request；網路連不上時它是報錯，不是安靜地用舊的。飛航模式冷啟動 = Safari 錯誤頁。

Service Worker 提供的不是「快取」（那本來就有），而是**可程式化的快取策略**——`StaleWhileRevalidate` 明講「先無條件回快取，背景才去看有沒有新版」，這是 HTTP cache 語意上做不到的事。

## 3. 必須修改的部分

### 3.1 首屏不能有任何外部依賴

原本 `index.html` 的 `<head>` 有四個第三方 origin，其中兩個是阻擋性的。離線時的結果不是「慢」，是**整個 app 沒有樣式**。

清掉的項目與替代方案：

| 原本 | 改成 | 檔案 |
|---|---|---|
| `cdn.tailwindcss.com`（同步 `<script>`） | Tailwind v4 本地建置（`@tailwindcss/vite`） | [vite.config.ts](../vite.config.ts)、[styles.css](../styles.css) |
| Font Awesome CDN CSS | `lucide-react`（31 處圖示，純 SVG 無 webfont） | [App.tsx](../App.tsx)、[components/QRScanner.tsx](../components/QRScanner.tsx) |
| Google Fonts `@import` | system font stack（零字型請求） | [styles.css](../styles.css) |
| gtag `<script async>` | production + online 才動態載入（見下方說明） | [services/analyticsService.ts](../services/analyticsService.ts) |
| esm.sh `importmap` | 刪除（Vite 已 bundle，這段是 AI Studio scaffold 的死碼） | [index.html](../index.html) |

**阻擋性與外部性是兩件事。** 上表只有前三項是阻擋性的。gtag 原本就帶 `async`，不阻塞 parsing 也不阻塞首次繪製；它跨 origin，不會被 SW 的 same-origin 規則攔到；inline shim 讓離線時 `gtag()` 只是往陣列堆東西不會 throw。**它本身不會讓離線冷啟動退化。** 改成動態載入是額外收斂（離線時完全不發請求、不跟首屏搶頻寬），不是修 bug。反過來說也不要把「`index.html` 裡有 gtag」本身當成離線問題——那會讓人拿這條去反對無害的寫法。

Tailwind Play CDN 有一段成本快取救不了：它是把 JIT compiler 塞進瀏覽器，**每次啟動**都要執行 JS、掃 DOM、產生 CSS。改本地建置後這段主執行緒工作直接歸零，不再跟 React 首次 render 與相機初始化搶主執行緒。

### 3.2 App shell 要能被 precache

導入 `vite-plugin-pwa`，production build 產生 `sw.js`。關鍵設定：

- `navigateFallback: 'index.html'` — 離線導航要落回 app shell
- `runtimeCaching` 用 **`StaleWhileRevalidate`**，不要用 `NetworkFirst`。`NetworkFirst` 會在網路差時先等 timeout 才回快取，正好害到這份文件想解決的情境
- `registerType: 'autoUpdate'`

相關檔案：[vite.config.ts](../vite.config.ts)

### 3.3 base、manifest、icon 路徑必須三邊一致

部署在 GitHub Pages 子路徑 `https://rexx.github.io/QR-Reader/`。不一致的症狀很有迷惑性：icon 正常、app 裝得起來，但離線冷啟動打到錯誤 URL。

- `vite.config.ts` 的 `base: '/QR-Reader/'`
- `public/manifest.json` 的 `id` / `start_url` / `scope` 皆為 `/QR-Reader/`
- icon `src` 用絕對路徑 `/QR-Reader/xxx.png`

### 3.4 離線時保留掃描流程，網路功能降級

掃描完全是本機運算（`getUserMedia` + `jsQR`），歷史存在 localStorage，所以離線時沒有任何理由擋住主流程。

- 四個網路進入點（`syncItem` / `performPushSync` / `performPullSync` / `fetchCloudData`）先檢查 `isOffline()`
- **離線不算同步失敗**：保留 `pending`，不要標 `error`
- 所有 `fetch` 走 `fetchWithTimeout`（10 秒 `AbortController` abort）。Apps Script 在爛網路下可以 hang 超過一分鐘，會讓項目卡死在 `syncing`

相關檔案：[services/networkService.ts](../services/networkService.ts)、[App.tsx](../App.tsx)

### 3.5 離線提示不能擋住主流程

Offline badge 放在 header 標題旁邊，不覆蓋取景框、不做全畫面 overlay。使用者需要知道同步為什麼沒反應，但不需要為此中斷掃描。

## 4. Time-to-first-scan 的處理

除了上面拔 CDN 與 SW precache（這兩項本身就是最大的收益來源）之外：

### 4.1 相機提早暖機

原本序列完全串行：下載 bundle → parse → React mount → QRScanner mount → `useEffect` → `getUserMedia` → 首幀。iOS 上 `getUserMedia` 加感光元件啟動要數百毫秒，卻排在整個 JS boot 之後。

現在 `index.html` 的 inline script 在 bundle 還在下載時就發動相機，promise 掛在 `window.__cameraWarmup`；`QRScanner` 去認領它，拿不到才走原本的 `startCamera()`。暖機與下載/parse **重疊**。

沒被認領的 stream 會被關掉，避免相機指示燈一直亮著。

### 4.2 掃描迴圈瘦身

- `getContext('2d', { willReadFrequently: true })`
- 解碼前把畫面 downscale 到 640px 寬。QR 偵測不需要全解析度，而 `getImageData` + `jsQR` 的成本跟像素數成正比，等於單幀成本砍到約 1/4

這不只加快首次成功解碼，也讓啟動期間 React 的首次 paint 不被主執行緒飢餓拖慢。

### 4.3 首屏靜態骨架

`index.html` 用 inline critical CSS 畫一個取景框輪廓（`#boot-shell`），JS 掛載時移除。不改變實際速度，但消除 JS 執行前的閃爍。

### 4.4 歷史資料延後讀取

原本在 `useState` initializer 裡同步讀 localStorage 並 `JSON.parse` 最多 512 筆，發生在首次 paint 之前。改到 `useEffect`。

**注意**：單純延後會有資料遺失風險——寫回 localStorage 的 effect 會先拿著空陣列跑一次，把既有歷史洗掉。所以加了 `hydrated` state 擋住 hydration 完成前的寫入。

## 5. iOS 注意事項

### 5.1 本機測試需要 secure context

iOS Safari 對 Service Worker 與 `getUserMedia` 都要求 secure context。`localhost` 是例外，**LAN IP 走 HTTP 不算**——`http://192.168.x.x:4173/QR-Reader/` 只能驗版面，相機不會動、SW 也不會註冊。

要在 iPhone 上完整測試，需要真憑證：用 tunnel（`cloudflared tunnel --url http://localhost:4173`）或直接部署上去測。

### 5.2 舊安裝可能需要刪掉重裝

已在 Cozy Pocket 觀察到：新重裝的 iOS 主畫面 app 可以離線冷啟動，舊安裝版本可能在完全滑掉後跳出 Safari 錯誤頁。舊的安裝 metadata / start URL / SW 狀態可能與新版不一致。

處理方式：刪除舊的主畫面 app → Safari 重開正式網址 → 重新加入主畫面 → 上線開一次後再測離線。

### 5.3 透明線稿 icon 可能在主畫面上看不見

iOS 會從 icon 自身的顏色反推底色。**淺色低飽和的透明線稿**會拿到淺色底，整個 icon 在主畫面上幾乎消失——build 輸出正常、透明度檢查也會通過，只有真機看得出來。

QR Reader 目前不受影響，但這是一個**取捨的結果、不是白撿的安全**：icon 是滿版不透明深色圖（不透明像素 100%、平均飽和度 0.623、平均明度 0.239），深色是自己畫進去的，沒有底色生成的餘地——代價是等於放棄 iOS 的 Liquid Glass 處理（依 mini-sudoku 專案的真機觀察，滿版不透明 icon 會被排除在該處理之外；本專案未在真機複驗這一點）。

如果之後想改成透明線稿去換 Liquid Glass，屆時要量的是**不透明像素的平均飽和度**，低於 0.5 要小心。反過來說，只要 icon 維持滿版不透明，透明度與飽和度兩項檢查都不適用——別拿滿版 icon 去對那個門檻，量錯維度會得到「過了」的假結論。

### 5.4 `viewport-fit=cover` 目前不要開

沿用 Cozy Pocket 的結論。iOS standalone 模式下容易連動出現頂部區塊偏移、safe-area 行為不符預期、overlay 與狀態列重疊。

## 6. 驗證清單

每次調整 PWA / 離線相關設定後至少驗證：

### 6.1 本機

- `npm run build && npm run preview`（注意網址是 `http://localhost:4173/QR-Reader/`，`base` 已改）
- Service Worker 只在 production build 啟用，`npm run dev` 不會有
- 確認首屏沒有**阻擋繪製**的外部依賴。真正的不變式是「不阻塞」，不是「零外部 origin」——URL grep（`curl | grep -oE 'https?://'`）分辨不出 `<script async>` 與 `<script src>`，兩者在文字上都只是一個外部 URL。要看的是載入語意，會擋的有三種形態：
  - `<script src>` 沒帶 `async` / `defer`
  - `<link rel="stylesheet">` 指向外部
  - inline `<style>` 裡的 `@import url(...)`（最隱蔽，要 CSS parse 完才被發現）
- 驗收條件要雙向驗：不只驗現況會過，也要塞一個上述形態進去確認它真的會被擋下來。單向驗證只證明工具在預期路徑上正常，證明不了它在別的路徑上不會給出錯誤結論

### 6.2 線上首次安裝

- Safari 開啟正式網址 → 加入主畫面 → 從主畫面啟動
- icon 與 app 名稱正確

### 6.3 離線冷啟動

- 線上先成功開一次
- **完全滑掉 app**
- 開飛航模式
- 從主畫面重新打開 → 確認不是 Safari 錯誤頁

### 6.4 離線核心流程

- 相機可啟動、可掃描
- 上傳圖片解碼可用
- 歷史可瀏覽、可搜尋、可刪除
- 關掉 app 再打開，歷史仍在

### 6.5 離線降級

- Header 顯示 offline badge
- Pull / Push 顯示離線提示，不白畫面、不 unhandled error
- 離線時新增的掃描維持 `pending`，不是 `error`

### 6.6 恢復連線

- Badge 消失
- `pending` 資料可手動推送成功

## 7. 之後若又離線打不開，優先檢查什麼

1. `public/manifest.json` 的 `start_url` / `scope` / `id`
2. `vite.config.ts` 的 `base`
3. `dist/sw.js` 是否有 precache `index.html`
4. `navigateFallback` 是否仍指向 app shell
5. 這是不是一個**舊安裝**，而不是新重裝的 app

新安裝仍然失敗，才往更深一層查：

- iOS standalone 啟動時實際請求了哪個路徑
- Service Worker 是否在安裝後完成接管
- 是否有新的外部啟動依賴混回首頁（最常見的回歸來源）
