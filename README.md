# QR Reader

以相機即時掃描 QR code 的 PWA，掃描與歷史完全在本機運算，網路只用於選配的 Google Sheets 同步。

線上版本：<https://rexx.github.io/qr-reader/>

## 1. 功能

- **即時掃描**：`getUserMedia` 取得後鏡頭串流，`jsQR` 逐幀解碼；支援手電筒與硬體變焦（依裝置能力）
- **圖片解碼**：上傳既有圖片解出其中的 QR code
- **歷史紀錄**：存於 localStorage，可搜尋、重新命名、刪除、匯出／匯入 JSON
- **雲端同步（選配）**：透過 Google Apps Script 推送與拉取 Google Sheets
- **離線可用**：加入 iOS 主畫面後，飛航模式下仍可冷啟動並掃描

## 2. 技術棧

React 19、TypeScript、Vite 6、Tailwind CSS v4、lucide-react、jsQR、vite-plugin-pwa。

**沒有任何執行期的外部依賴。** 首屏不載入任何第三方 origin 的資源——樣式在 build time 編譯、圖示是打包進去的 SVG、字型走 system font stack。這是離線能力的前提，改動時請維持這條不變式，理由見[離線實作說明](docs/pwa-offline-implementation.md)。

## 3. 本機開發

**前置需求**：Node.js 24 以上，與 CI 一致（`.nvmrc` 有釘）。

```bash
npm install
npm run dev
```

Build 與本機預覽：

```bash
npm run build
npm run preview
```

兩個容易踩到的地方：

- **預覽網址是 `http://localhost:4173/qr-reader/`**，不是根路徑。`base` 對齊 GitHub Pages 的子路徑部署，本機預覽也跟著走這個前綴。
- **Service Worker 只在 production build 啟用。** `npm run dev` 不會註冊 SW，所以離線行為一律要用 `npm run preview` 驗。

要在 iPhone 上測試，注意 iOS Safari 對 Service Worker 與 `getUserMedia` 都要求 secure context。`localhost` 是例外，但 LAN IP 走 HTTP 不算——`http://192.168.x.x:4173/` 只能看版面，相機不會動、SW 也不會註冊。需要真憑證時用 tunnel（例如 `cloudflared tunnel --url http://localhost:4173`）或直接部署上去測。

## 4. 部署

推送到 `main` 由 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 自動 build 並發佈到 GitHub Pages。

部署路徑是三處必須一致的設定，任一處漂掉都會讓已安裝的 PWA 在離線時打到錯誤的 URL：

| 位置 | 值 |
|---|---|
| `vite.config.ts` 的 `base` | `/qr-reader/` |
| `public/manifest.json` 的 `id` / `start_url` / `scope` | `/qr-reader/` |
| `public/manifest.json` 的 icon `src` | `/qr-reader/...` |

## 5. 離線行為

掃描、圖片解碼、歷史、設定在離線時全部可用；只有雲端同步需要網路，離線時會明確降級並保留 `pending` 狀態，不會標成錯誤。

實作細節、iOS 注意事項與驗證清單見 **[docs/pwa-offline-implementation.md](docs/pwa-offline-implementation.md)**。調整任何 PWA 相關設定後請照該文件第 6 節逐項驗證，特別是飛航模式冷啟動——那是只有真機能驗的一項。

## 6. 雲端同步設定

同步是選配的，不設定不影響任何本機功能。

1. 建立一份 Google Sheet
2. 開啟 Apps Script 編輯器，貼上 [`google-apps-script.js`](google-apps-script.js)
3. 把腳本開頭的 `WEBHOOK_TOKEN` 改成自己的密鑰，部署為「網頁應用程式」，存取權限設為「所有人」
4. 把 `/exec` 網址與密鑰填進 app 的 Settings 頁

協定細節（含為何 POST 用 `Content-Type: text/plain` 繞開 GAS 不支援的 CORS preflight、以及 Pull 的稽核合併順序）見 [GOOGLE_SHEET_SYNC_SPEC.md](GOOGLE_SHEET_SYNC_SPEC.md)。

## 7. 資料存放

歷史存在 localStorage 的 `qr_reader_history`，上限 512 筆。超過時只會裁掉**已同步**的最舊紀錄——未同步的紀錄永遠不會被自動刪除，避免在同步設定好之前遺失資料。

## 8. 專案結構

```
App.tsx                  主畫面、分頁切換、歷史、設定、同步
components/QRScanner.tsx 相機串流、解碼迴圈、手電筒與變焦
services/                networkService（離線偵測與 fetch timeout）、analyticsService
index.html               app shell、inline critical CSS、相機暖機腳本
styles.css               Tailwind 進入點與全域樣式
docs/                    離線實作說明
```
