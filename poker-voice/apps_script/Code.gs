var HEADER_ROW = 1;
var FIRST_DATA_ROW = 2;
var TOTAL_COLUMNS = 12;

var COL_NICKNAME = 1;
var COL_PREFLOP = 2;
var COL_FLOP = 3;
var COL_TURN = 6;
var COL_RIVER = 9;
var COL_PRESUPPOSITION = 12;

var COLOR_WHITE = '#ffffff';
var COLOR_FLOP = '#f4edd6';
var COLOR_TURN = '#dbe4f3';
var COLOR_PRESUP = '#f3e6ea';
var COLUMN_WIDTH_3CM_PX = 113;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    var sheet = getTargetSheet_(data.sheetName);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Лист не найден.' }, 404);
    }

    ensureLayout_(sheet);
    migrateLegacyRowsIfNeeded_(sheet);

    if (data.action === 'find_first_row') {
      if (!data.opponent) {
        return jsonResponse({ ok: false, error: 'Нет opponent.' }, 400);
      }
      return jsonResponse(findFirstRowPayload_(sheet, data.opponent), 200);
    }

    if (!data.opponent) {
      return jsonResponse({ ok: false, error: 'Нет opponent.' }, 400);
    }

    var insertAfterRow = findInsertAfterRow_(sheet, data.opponent);
    sheet.insertRowAfter(insertAfterRow);

    var targetRow = insertAfterRow + 1;
    var rowValues = emptyRow_();
    rowValues[COL_NICKNAME - 1] = data.opponent || '';
    rowValues[COL_PREFLOP - 1] = data.preflop || '';
    rowValues[COL_FLOP - 1] = data.flop || '';
    rowValues[COL_TURN - 1] = data.turn || '';
    rowValues[COL_RIVER - 1] = data.river || '';
    rowValues[COL_PRESUPPOSITION - 1] = data.presupposition || '';

    sheet.getRange(targetRow, 1, 1, TOTAL_COLUMNS).setValues([rowValues]);
    applyRowFormat_(sheet, targetRow);

    return jsonResponse({
      ok: true,
      row: targetRow,
      gid: sheet.getSheetId(),
      sheetName: sheet.getName(),
      spreadsheetId: sheet.getParent().getId()
    }, 200);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}

function setupSheetLayout() {
  var sheet = SpreadsheetApp.getActiveSheet();
  ensureLayout_(sheet);
  migrateLegacyRowsIfNeeded_(sheet);
  return 'ok';
}

function findInsertAfterRow_(sheet, opponent) {
  var lastRow = Math.max(sheet.getLastRow(), HEADER_ROW);
  if (lastRow < FIRST_DATA_ROW) {
    return HEADER_ROW;
  }

  var values = sheet.getRange(FIRST_DATA_ROW, COL_NICKNAME, lastRow - HEADER_ROW, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var nick = asText_(values[i][0]);
    if (nick === opponent) {
      return FIRST_DATA_ROW + i;
    }
  }

  return lastRow;
}

function findFirstRowPayload_(sheet, opponent) {
  var result = {
    ok: true,
    opponent: opponent,
    row: null,
    found: false,
    gid: sheet.getSheetId(),
    sheetName: sheet.getName(),
    spreadsheetId: sheet.getParent().getId()
  };

  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return result;
  }

  var values = sheet.getRange(FIRST_DATA_ROW, COL_NICKNAME, lastRow - HEADER_ROW, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var nick = asText_(values[i][0]);
    if (nick === opponent) {
      result.row = FIRST_DATA_ROW + i;
      result.found = true;
      return result;
    }
  }

  return result;
}

function ensureLayout_(sheet) {
  var maxColumns = sheet.getMaxColumns();
  if (maxColumns < TOTAL_COLUMNS) {
    sheet.insertColumnsAfter(maxColumns, TOTAL_COLUMNS - maxColumns);
  }

  var headers = [
    'nickname',
    'preflop',
    'flop',
    '',
    '',
    'turn',
    '',
    '',
    'river',
    '',
    '',
    'presuppositions'
  ];

  sheet.getRange(HEADER_ROW, 1, 1, TOTAL_COLUMNS).setValues([headers]);
  sheet.getRange(HEADER_ROW, 1, 1, TOTAL_COLUMNS).setFontWeight('bold');

  sheet.getRange(1, 1, sheet.getMaxRows(), TOTAL_COLUMNS)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(false);

  sheet.setFrozenRows(1);

  sheet.setColumnWidths(1, TOTAL_COLUMNS, COLUMN_WIDTH_3CM_PX);

  applyColumnPalette_(sheet);
}

function applyColumnPalette_(sheet) {
  var maxRows = sheet.getMaxRows();
  sheet.getRange(1, 1, maxRows, 2).setBackground(COLOR_WHITE);
  sheet.getRange(1, 3, maxRows, 3).setBackground(COLOR_FLOP);
  sheet.getRange(1, 6, maxRows, 3).setBackground(COLOR_TURN);
  sheet.getRange(1, 9, maxRows, 3).setBackground(COLOR_WHITE);
  sheet.getRange(1, 12, maxRows, 1).setBackground(COLOR_PRESUP);
}

function applyRowFormat_(sheet, row) {
  var backgrounds = [[
    COLOR_WHITE, COLOR_WHITE,
    COLOR_FLOP, COLOR_FLOP, COLOR_FLOP,
    COLOR_TURN, COLOR_TURN, COLOR_TURN,
    COLOR_WHITE, COLOR_WHITE, COLOR_WHITE,
    COLOR_PRESUP
  ]];

  sheet.getRange(row, 1, 1, TOTAL_COLUMNS)
    .setBackgrounds(backgrounds)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(false);
}

function migrateLegacyRowsIfNeeded_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return;
  }

  var rowCount = lastRow - HEADER_ROW;
  var values = sheet.getRange(FIRST_DATA_ROW, 1, rowCount, TOTAL_COLUMNS).getValues();
  var changed = false;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!isLegacyRow_(row)) {
      continue;
    }

    var migrated = emptyRow_();
    migrated[COL_NICKNAME - 1] = row[0] || '';
    migrated[COL_PREFLOP - 1] = row[1] || '';
    migrated[COL_FLOP - 1] = row[2] || '';
    migrated[COL_TURN - 1] = row[3] || '';
    migrated[COL_RIVER - 1] = row[4] || '';
    migrated[COL_PRESUPPOSITION - 1] = row[5] || '';

    values[i] = migrated;
    changed = true;
  }

  if (changed) {
    sheet.getRange(FIRST_DATA_ROW, 1, rowCount, TOTAL_COLUMNS).setValues(values);
  }

  applyColumnPalette_(sheet);
}

function isLegacyRow_(row) {
  var hasLegacyTurn = asText_(row[3]) !== '';
  var hasLegacyRiver = asText_(row[4]) !== '';
  var hasIsoTimingInG = /^\d{4}-\d{2}-\d{2}T/.test(asText_(row[6]));

  if (hasLegacyTurn || hasLegacyRiver || hasIsoTimingInG) {
    return true;
  }

  return false;
}

function emptyRow_() {
  return new Array(TOTAL_COLUMNS).fill('');
}

function asText_(value) {
  return (value || '').toString().trim();
}

function getTargetSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheetName) {
    return ss.getActiveSheet();
  }
  return ss.getSheetByName(sheetName);
}

function jsonResponse(payload, status) {
  var body = {
    ok: payload && payload.ok === true,
    status: status || 200
  };

  if (payload && typeof payload === 'object') {
    for (var key in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        body[key] = payload[key];
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
