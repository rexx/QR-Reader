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
    // row[1] 現在是 Date 物件或有效日期值
    var ts = row[1] instanceof Date ? row[1].getTime() : new Date(row[1]).getTime();
    return { 
      id: row[0], 
      timestamp: isNaN(ts) ? Date.now() : ts, 
      name: row[2], 
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

  // 1. 使用 Date 物件：Google Sheets 會自動識別並正確顯示日期格式
  // 2. Name: 如果沒有值就留空
  var rowData = [
    data.id, 
    new Date(Number(data.timestamp)), 
    data.name || "", 
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