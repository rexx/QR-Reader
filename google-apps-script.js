/**
 * Smart Lens: Google Sheets Sync Backend (Secure Version - Batch Optimized)
 */

// ⚠️ 請修改此密鑰，並同步在 App 設定中填入相同的值
var WEBHOOK_TOKEN = "MY_SECRET_KEY_123"; 

/**
 * 統一驗證函數：支援從 URL 參數或 POST Body 中提取 Token
 */
function validate(e) {
  var token = e.parameter.token;
  if (token === WEBHOOK_TOKEN) return true;

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

/**
 * 200-Wrapping 錯誤回應：
 * GAS 平台限制：若回傳 401，Google 重導向機制會丟失 CORS 標頭導致前端無法讀取。
 * 因此我們一律回傳 200 OK，並將錯誤碼封裝在 JSON 中。
 */
function errorResponse(msg) {
  return ContentService.createTextOutput(JSON.stringify({ 
    "status": "error", 
    "message": msg,
    "code": 401 
  })).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (!validate(e)) return errorResponse("Unauthorized");
  
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
  if (!validate(e)) return errorResponse("Unauthorized");
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch(err) {
    return errorResponse("Invalid JSON");
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID", "Timestamp", "Name", "Data", "Type"]);
  }

  var itemsToProcess = (payload.items && Array.isArray(payload.items)) ? payload.items : [];
  if (itemsToProcess.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "success", "added": 0, "updated": 0 })).setMimeType(ContentService.MimeType.JSON);
  }

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