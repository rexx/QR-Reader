/**
 * Smart Lens: Google Sheets Sync Backend (Secure Version - Batch Optimized)
 */

// ⚠️ 請修改此密鑰，並同步在 App 設定中填入相同的值
var WEBHOOK_TOKEN = "MY_SECRET_KEY_123"; 

/**
 * 統一驗證函數：支援從 URL 參數或 POST Body 中提取 Token
 */
function validate(e) {
  // 1. 優先檢查 URL 參數 (適用於 GET 和部分 POST)
  var token = e.parameter.token;
  if (token === WEBHOOK_TOKEN) return true;

  // 2. 如果參數中沒有，且是 POST 請求，則檢查 JSON Body
  if (e.postData && e.postData.contents) {
    try {
      var contents = JSON.parse(e.postData.contents);
      return contents.token === WEBHOOK_TOKEN;
    } catch (err) {
      return false;
    }
  }
  
  return false;
}

function doGet(e) {
  if (!validate(e)) return ContentService.createTextOutput("Unauthorized").setStatusCode(401);
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  
  var rows = sheet.getDataRange().getValues();
  rows.shift(); // 移除標題列
  
  var result = rows.map(function(row) {
    var ts = row[1] instanceof Date ? row[1].getTime() : new Date(row[1]).getTime();
    var nameVal = (row[2] !== null && row[2] !== undefined) ? String(row[2]) : "";
    return { 
      id: row[0], 
      timestamp: isNaN(ts) ? Date.now() : ts, 
      name: nameVal, 
      data: row[3], 
      type: row[4] 
    };
  });
  
  result.sort(function(a, b) { return b.timestamp - a.timestamp; });
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  if (!validate(e)) return ContentService.createTextOutput("Unauthorized").setStatusCode(401);
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var payload = JSON.parse(e.postData.contents);
  
  // Ensure headers exist
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "Timestamp", "Name", "Data", "Type"]);
  }

  // 統一從 payload.items 讀取項目陣列
  var itemsToProcess = (payload.items && Array.isArray(payload.items)) ? payload.items : [];

  if (itemsToProcess.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "no_data" })).setMimeType(ContentService.MimeType.JSON);
  }

  // Cache existing IDs to avoid repeated spreadsheet reads
  var idColumn = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().map(function(r) { return String(r[0]); });
  
  var updatedCount = 0;
  var addedCount = 0;

  itemsToProcess.forEach(function(item) {
    var safeName = (item.name !== null && item.name !== undefined && item.name !== "") ? String(item.name) : "";
    var rowData = [
      String(item.id), 
      new Date(Number(item.timestamp)), 
      safeName, 
      item.data, 
      item.type
    ];

    var foundIndex = idColumn.indexOf(String(item.id));
    
    if (foundIndex > -1) {
      sheet.getRange(foundIndex + 1, 1, 1, 5).setValues([rowData]);
      updatedCount++;
    } else {
      sheet.appendRow(rowData);
      idColumn.push(String(item.id));
      addedCount++;
    }
  });

  return ContentService.createTextOutput(JSON.stringify({
    "status": "success",
    "added": addedCount,
    "updated": updatedCount,
    "totalProcessed": itemsToProcess.length
  })).setMimeType(ContentService.MimeType.JSON);
}