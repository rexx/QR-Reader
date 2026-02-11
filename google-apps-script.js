/**
 * Smart Lens: Google Sheets Sync Backend (Secure Version - Fixed)
 */

// ⚠️ 請修改此密鑰，並同步在 App 設定中填入相同的值
var WEBHOOK_TOKEN = "MY_SECRET_KEY_123"; 

function validate(e) {
  var token = e.parameter.token || (e.postData && JSON.parse(e.postData.contents).token);
  return token === WEBHOOK_TOKEN;
}

function doGet(e) {
  if (!validate(e)) return ContentService.createTextOutput("Unauthorized").setStatusCode(401);
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  
  var rows = sheet.getDataRange().getValues();
  rows.shift(); // 移除標題列
  
  var result = rows.map(function(row) {
    var ts = row[1] instanceof Date ? row[1].getTime() : new Date(row[1]).getTime();
    
    // 強制將名稱轉換為字串，避免 0 被視為 false
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

  // 使用明確的 null 檢查，允許 "0" 字串或 0 數字
  var safeName = (data.name !== null && data.name !== undefined && data.name !== "") ? String(data.name) : "";

  var rowData = [
    data.id, 
    new Date(Number(data.timestamp)), 
    safeName, 
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