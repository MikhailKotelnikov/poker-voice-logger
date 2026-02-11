function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    if (!data.opponent) {
      return jsonResponse({ ok: false, error: 'Нет opponent.' }, 400);
    }

    var sheet = getTargetSheet_(data.sheetName);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Лист не найден.' }, 404);
    }

    var headerRow = 1;
    var startRow = headerRow + 1;
    var lastRow = sheet.getLastRow();
    var insertAfterRow = Math.max(lastRow, headerRow);

    if (lastRow >= startRow) {
      var opponentValues = sheet.getRange(startRow, 1, lastRow - headerRow, 1).getValues();
      for (var i = opponentValues.length - 1; i >= 0; i--) {
        var cell = (opponentValues[i][0] || '').toString().trim();
        if (cell === data.opponent) {
          insertAfterRow = startRow + i;
          break;
        }
      }
    }

    sheet.insertRowAfter(insertAfterRow);
    var targetRow = insertAfterRow + 1;

    var rowValues = [
      data.opponent || '',
      data.preflop || '',
      data.flop || '',
      data.turn || '',
      data.river || '',
      data.presupposition || '',
      data.timing || ''
    ];

    sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);

    return jsonResponse({ ok: true, row: targetRow });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}

function getTargetSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheetName) {
    return ss.getActiveSheet();
  }
  return ss.getSheetByName(sheetName);
}

function jsonResponse(payload, status) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
    .setResponseCode(status || 200);
}
