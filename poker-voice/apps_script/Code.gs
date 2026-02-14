var HEADER_ROW = 1;
var FIRST_DATA_ROW = 2;
var TOTAL_COLUMNS = 18;

var COL_NICKNAME = 1;
var COL_PREFLOP = 2;
var COL_PREFLOP_2 = 3;
var COL_FLOP = 4;
var COL_TURN = 7;
var COL_RIVER = 10;
var COL_PRESUPPOSITION = 13;
var COL_DATE = 18;

var COLOR_WHITE = '#ffffff';
var COLOR_FLOP = '#f4edd6';
var COLOR_TURN = '#dbe4f3';
var COLOR_PRESUP = '#f3e6ea';
var COLUMN_WIDTH_3CM_PX = 113;
var DATE_TIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    var sheet = getTargetSheet_(data.sheetName);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Лист не найден.' }, 404);
    }

    ensureLayout_(sheet);
    migrateLegacyRowsIfNeeded_(sheet);
    ensureOpponentSeparators_(sheet);

    if (data.action === 'find_first_row') {
      if (!data.opponent) {
        return jsonResponse({ ok: false, error: 'Нет opponent.' }, 400);
      }
      return jsonResponse(findFirstRowPayload_(sheet, data.opponent), 200);
    }

    if (data.action === 'list_opponents') {
      return jsonResponse(listOpponentsPayload_(sheet, data.query, data.limit), 200);
    }

    if (data.action === 'update_field') {
      var field = asText_(data.field).toLowerCase();
      var row = Number(data.row);
      var col = getFieldColumn_(field);

      if (!col) {
        return jsonResponse({ ok: false, error: 'Некорректное поле.' }, 400);
      }
      if (!row || row < FIRST_DATA_ROW || row > sheet.getLastRow()) {
        return jsonResponse({ ok: false, error: 'Некорректная строка для правки.' }, 400);
      }

      sheet.getRange(row, col).setValue(asText_(data.value));
      applyRowFormat_(sheet, row);

      return jsonResponse({
        ok: true,
        row: row,
        field: field,
        gid: sheet.getSheetId(),
        sheetName: sheet.getName(),
        spreadsheetId: sheet.getParent().getId()
      }, 200);
    }

    if (!data.opponent) {
      return jsonResponse({ ok: false, error: 'Нет opponent.' }, 400);
    }

    var lastOpponentRow = findLastRowForOpponent_(sheet, data.opponent);
    var targetRow = 0;
    var separatorRow = 0;

    if (lastOpponentRow) {
      sheet.insertRowAfter(lastOpponentRow);
      targetRow = lastOpponentRow + 1;
    } else {
      var insertion = createRowForNewOpponent_(sheet);
      targetRow = insertion.targetRow;
      separatorRow = insertion.separatorRow;
    }

    var rowValues = emptyRow_();
    rowValues[COL_NICKNAME - 1] = data.opponent || '';
    rowValues[COL_PREFLOP - 1] = data.preflop || '';
    rowValues[COL_FLOP - 1] = data.flop || '';
    rowValues[COL_TURN - 1] = data.turn || '';
    rowValues[COL_RIVER - 1] = data.river || '';
    rowValues[COL_PRESUPPOSITION - 1] = data.presupposition || '';
    rowValues[COL_DATE - 1] = formatNow_();

    sheet.getRange(targetRow, 1, 1, TOTAL_COLUMNS).setValues([rowValues]);
    applyRowFormat_(sheet, targetRow);
    if (separatorRow) {
      applySeparatorRowFormat_(sheet, separatorRow);
    }

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
  ensureOpponentSeparators_(sheet);
  return 'ok';
}

function findLastRowForOpponent_(sheet, opponent) {
  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return 0;
  }

  var values = sheet.getRange(FIRST_DATA_ROW, COL_NICKNAME, lastRow - HEADER_ROW, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var nick = asText_(values[i][0]);
    if (nick === opponent) {
      return FIRST_DATA_ROW + i;
    }
  }

  return 0;
}

function createRowForNewOpponent_(sheet) {
  var lastRow = Math.max(sheet.getLastRow(), HEADER_ROW);
  if (lastRow < FIRST_DATA_ROW) {
    sheet.insertRowAfter(HEADER_ROW);
    return { targetRow: FIRST_DATA_ROW, separatorRow: 0 };
  }

  sheet.insertRowsAfter(lastRow, 2);
  return { targetRow: lastRow + 2, separatorRow: lastRow + 1 };
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

function listOpponentsPayload_(sheet, query, limit) {
  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return { ok: true, opponents: [] };
  }

  var values = sheet.getRange(FIRST_DATA_ROW, COL_NICKNAME, lastRow - HEADER_ROW, 1).getValues();
  var q = asText_(query).toLowerCase();
  var max = Number(limit);
  if (!max || max < 1) max = 50;
  if (max > 5000) max = 5000;

  var seen = {};
  var items = [];

  for (var i = values.length - 1; i >= 0; i--) {
    var nick = asText_(values[i][0]);
    if (!nick) continue;

    var lower = nick.toLowerCase();
    if (q && lower.indexOf(q) === -1) continue;
    if (seen[lower]) continue;

    seen[lower] = true;
    items.push(nick);
    if (items.length >= max) break;
  }

  return { ok: true, opponents: items };
}

function ensureLayout_(sheet) {
  var maxColumns = sheet.getMaxColumns();
  if (maxColumns < TOTAL_COLUMNS) {
    sheet.insertColumnsAfter(maxColumns, TOTAL_COLUMNS - maxColumns);
  }

  var headers = [
    'nickname',
    'preflop',
    '',
    'flop',
    '',
    '',
    'turn',
    '',
    '',
    'river',
    '',
    '',
    'presuppositions',
    '',
    '',
    '',
    '',
    'date'
  ];

  sheet.getRange(HEADER_ROW, 1, 1, TOTAL_COLUMNS).setValues([headers]);
  sheet.getRange(HEADER_ROW, 1, 1, TOTAL_COLUMNS).setFontWeight('bold');

  sheet.getRange(1, 1, sheet.getMaxRows(), TOTAL_COLUMNS)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(false)
    .setFontWeight('normal');

  sheet.getRange(HEADER_ROW, 1, 1, TOTAL_COLUMNS).setFontWeight('bold');
  sheet.getRange(1, COL_NICKNAME, sheet.getMaxRows(), 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, TOTAL_COLUMNS, COLUMN_WIDTH_3CM_PX);
  applyColumnPalette_(sheet);
}

function applyColumnPalette_(sheet) {
  var maxRows = sheet.getMaxRows();
  sheet.getRange(1, 1, maxRows, 3).setBackground(COLOR_WHITE);
  sheet.getRange(1, 4, maxRows, 3).setBackground(COLOR_FLOP);
  sheet.getRange(1, 7, maxRows, 3).setBackground(COLOR_TURN);
  sheet.getRange(1, 10, maxRows, 3).setBackground(COLOR_WHITE);
  sheet.getRange(1, 13, maxRows, 1).setBackground(COLOR_PRESUP);
  sheet.getRange(1, 14, maxRows, 5).setBackground(COLOR_WHITE);
}

function applyRowFormat_(sheet, row) {
  var backgrounds = [[
    COLOR_WHITE, COLOR_WHITE, COLOR_WHITE,
    COLOR_FLOP, COLOR_FLOP, COLOR_FLOP,
    COLOR_TURN, COLOR_TURN, COLOR_TURN,
    COLOR_WHITE, COLOR_WHITE, COLOR_WHITE,
    COLOR_PRESUP,
    COLOR_WHITE, COLOR_WHITE, COLOR_WHITE, COLOR_WHITE, COLOR_WHITE
  ]];

  sheet.getRange(row, 1, 1, TOTAL_COLUMNS)
    .setBackgrounds(backgrounds)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(false)
    .setFontWeight('normal');

  sheet.getRange(row, COL_NICKNAME).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
}

function applySeparatorRowFormat_(sheet, row) {
  var backgrounds = [new Array(TOTAL_COLUMNS).fill(COLOR_WHITE)];
  sheet.getRange(row, 1, 1, TOTAL_COLUMNS)
    .setBackgrounds(backgrounds)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setWrap(false)
    .setFontWeight('normal');

  sheet.getRange(row, COL_NICKNAME).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
}

function ensureOpponentSeparators_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= FIRST_DATA_ROW) {
    return;
  }

  var values = sheet.getRange(FIRST_DATA_ROW, COL_NICKNAME, lastRow - HEADER_ROW, 1).getValues();
  for (var i = 0; i < values.length - 1; i++) {
    var currentNick = asText_(values[i][0]);
    var nextNick = asText_(values[i + 1][0]);

    if (currentNick && nextNick && currentNick !== nextNick) {
      var rowToInsertAfter = FIRST_DATA_ROW + i;
      sheet.insertRowAfter(rowToInsertAfter);
      applySeparatorRowFormat_(sheet, rowToInsertAfter + 1);
      values.splice(i + 1, 0, ['']);
      i += 1;
    }
  }
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
    migrated[COL_TURN - 1] = row[5] || '';
    migrated[COL_RIVER - 1] = row[8] || '';
    migrated[COL_PRESUPPOSITION - 1] = row[11] || '';
    migrated[COL_DATE - 1] = normalizeDateValue_(row[6]);

    values[i] = migrated;
    changed = true;
  }

  if (changed) {
    sheet.getRange(FIRST_DATA_ROW, 1, rowCount, TOTAL_COLUMNS).setValues(values);
  }

  applyColumnPalette_(sheet);
}

function isLegacyRow_(row) {
  var hasOldLayoutData = asText_(row[2]) !== '' || asText_(row[5]) !== '' || asText_(row[8]) !== '' || asText_(row[11]) !== '';
  var hasNewLayoutData = asText_(row[3]) !== '' || asText_(row[6]) !== '' || asText_(row[9]) !== '' || asText_(row[12]) !== '';
  return hasOldLayoutData && !hasNewLayoutData;
}

function emptyRow_() {
  return new Array(TOTAL_COLUMNS).fill('');
}

function asText_(value) {
  return (value || '').toString().trim();
}

function normalizeDateValue_(value) {
  var text = asText_(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.replace('T', ' ').replace('Z', '');
  }
  return text;
}

function formatNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), DATE_TIME_FORMAT);
}

function getTargetSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheetName) {
    return ss.getActiveSheet();
  }
  return ss.getSheetByName(sheetName);
}

function getFieldColumn_(field) {
  switch (field) {
    case 'preflop':
      return COL_PREFLOP;
    case 'flop':
      return COL_FLOP;
    case 'turn':
      return COL_TURN;
    case 'river':
      return COL_RIVER;
    case 'presupposition':
      return COL_PRESUPPOSITION;
    default:
      return 0;
  }
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
