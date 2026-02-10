# 功能規範書：Smart Lens 同步至 Google Sheets (GAS 深度同步版)

## 1. 概述
本規範定義了 Smart Lens 與 Google Sheets 之間的雙向同步邏輯。系統採用「本地輕量快取、雲端完整存儲」的策略，將手機本地紀錄限制在 256 筆以內，並透過 Google Sheets 作為永久資料庫。

## 2. 技術架構 (增強版)
- **通訊協議**: 
    - `POST`: 用於新增或更新資料 (Upsert)。
    - `GET`: 用於拉取雲端完整清單 (Pull/Restore)。
- **辨識碼**: 每一筆掃描以 `id` (隨機字串) 作為唯一鍵值 (Primary Key)。
- **儲存限制**: 手機端 `localStorage` 僅保留最新 256 筆紀錄。

## 3. 同步情境與處理邏輯

| 情境 | 狀態描述 | 處理動作 |
| :--- | :--- | :--- |
| **A. 新增同步** | Local 有新掃描，Cloud 尚未存在。 | **Push**: 發送 POST 並標記為 `Synced`。 |
| **B. 本地清理** | 本地紀錄超過 256 筆。 | **Prune**: 自動移除本地「已同步且最舊」的紀錄，確保本地不超標。 |
| **C. 深度檢索** | 使用者需要查看超過 256 筆以前的資料。 | **Fetch All**: 呼叫 `GET` 獲取雲端全量資料並暫時顯示於 UI。 |
| **D. 內容更新** | 本地修改名稱。 | **Update**: POST 時帶入相同 ID，雲端搜尋對應列並更新。 |
| **E. 雲端缺失** | 雲端列被手動刪除。 | **Re-sync**: 同步檢查時若發現 ID 消失，自動重新上傳。 |

## 4. 增強版 Google Apps Script 代碼

```javascript
/** 處理下載請求：回傳所有歷史紀錄 */
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  
  var rows = sheet.getDataRange().getValues();
  var headers = rows.shift(); 
  var result = rows.map(function(row) {
    return {
      id: row[0],
      timestamp: new Date(row[1]).getTime(),
      name: row[2],
      data: row[3],
      type: row[4]
    };
  });
  // 回傳依照時間倒序排列
  result.sort((a, b) => b.timestamp - a.timestamp);
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/** 處理寫入或更新請求 */
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "Timestamp", "Name", "Data", "Type"]);
  }
  
  var rows = sheet.getDataRange().getValues();
  var foundIndex = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      foundIndex = i + 1;
      break;
    }
  }

  var rowData = [
    data.id,
    new Date(data.timestamp).toLocaleString(),
    data.name || "N/A",
    data.data,
    data.type
  ];

  if (foundIndex > -1) {
    sheet.getRange(foundIndex, 1, 1, 5).setValues([rowData]);
    return ContentService.createTextOutput(JSON.stringify({"status": "updated"})).setMimeType(ContentService.MimeType.JSON);
  } else {
    sheet.appendRow(rowData);
    return ContentService.createTextOutput(JSON.stringify({"status": "success"})).setMimeType(ContentService.MimeType.JSON);
  }
}
```

## 5. 本地容量管理邏輯 (LIFO + Sync Check)

當本地紀錄筆數 $N > 256$ 時，執行以下流程：
1.  **篩選**: 找出所有 `syncStatus === 'synced'` 的項目。
2.  **排序**: 依照 `timestamp` 排序。
3.  **移除**: 刪除最舊的項目，直到本地紀錄回到 256 筆。
4.  **保護**: 若項目尚未同步（`Pending` 或 `Error`），則 **禁止刪除**，直到同步成功。這能確保資料不會因空間不足而遺失。

## 6. UI/UX 深度歷史存取設計

### 6.1 歷史分層顯示
- **常規檢視**: 載入本地 256 筆。
- **底部按鈕**: 在歷史列表底部顯示「🔍 載入更多 (從雲端檢索)」。

### 6.2 雲端同步狀態標示 (新增)
- **Synced (✅)**: 存在於本地且雲端已有。
- **Cloud-Only (🌐)**: 本地原本沒有，是點擊「載入更多」後從雲端拉下來的。

## 7. 同步操作流程 (增強)

### 7.1 「恢復與同步」功能
- 使用者更換手機時，點擊「Settings > Restore from Cloud」。
- App 下載所有雲端紀錄，並僅將 **最新的 256 筆** 存入 `localStorage`。

### 7.2 自動淘汰機制
- 每次掃描後或 App 啟動時，背景自動執行「本地容量管理邏輯」，維持 App 的啟動速度。

## 8. 邊緣案例預防
- **本地儲存快滿**: 即使 256 筆 QR Code 文字量極小，仍會監控 `localStorage` 的 `quota`。
- **ID 一致性**: 嚴格依賴 ID。若使用者在雲端手動刪除了一列，App 的同步機制會因 ID 消失而判定為 `Pending` 並重新上傳。
