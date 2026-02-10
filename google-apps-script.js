/**
 * Smart Lens: Google Sheets Sync Backend
 * 
 * 部署說明：
 * 1. 在 Google Sheets 中點擊「擴充功能」 > 「Apps Script」
 * 2. 將此檔案內容貼上並儲存
 * 3. 點擊「部署」 > 「新增部署」
 * 4. 類型選擇「網頁應用程式」，執行身分為「我」，存取權限為「任何人」
 * 5. 複製生成的 Web App URL 並貼入 App 的設定中
 */

/** 處理下載請求：回傳所有歷史紀錄 */
function doGet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // 檢查是否有資料 (排除標題列)
  if (sheet.getLastRow() < 2) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var rows = sheet.getDataRange().getValues();
  var headers = rows.shift(); // 移除標題列
  
  var result = rows.map(function(row) {
    return {
      id: row[0],
      timestamp: new Date(row[1]).getTime(),
      name: row[2],
      data: row[3],
      type: row[4]
    };
  });
  
  // 回傳依照時間倒序排列 (最新的在前)
  result.sort(function(a, b) {
    return b.timestamp - a.timestamp;
  });
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 處理寫入或更新請求 (Upsert) */
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data;
  
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": "Invalid JSON"}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // 如果是空白試算表，先建立標題列
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "Timestamp", "Name", "Data", "Type"]);
  }
  
  var rows = sheet.getDataRange().getValues();
  var foundIndex = -1;
  
  // 搜尋現有 ID 進行更新
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      foundIndex = i + 1; // Apps Script range is 1-indexed
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
    // 更新現有資料列
    sheet.getRange(foundIndex, 1, 1, 5).setValues([rowData]);
    return ContentService.createTextOutput(JSON.stringify({"status": "updated", "id": data.id}))
      .setMimeType(ContentService.MimeType.JSON);
  } else {
    // 新增資料列
    sheet.appendRow(rowData);
    return ContentService.createTextOutput(JSON.stringify({"status": "success", "id": data.id}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}