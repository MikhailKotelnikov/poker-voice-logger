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

    if (data.action === 'get_opponent_rows') {
      if (!data.opponent) {
        return jsonResponse({ ok: false, error: 'Нет opponent.' }, 400);
      }
      return jsonResponse(listOpponentRowsPayload_(sheet, data.opponent, data.limit), 200);
    }

    if (data.action === 'get_all_rows') {
      return jsonResponse(listAllRowsPayload_(sheet, data.limit), 200);
    }

    var sourceMode = asText_(data.source).toLowerCase();
    var isHandHistorySource = sourceMode === 'hh' || sourceMode === 'hand_history' || sourceMode === 'handhistory';
    if (!data.opponent && !isHandHistorySource) {
      return jsonResponse({ ok: false, error: 'Нет opponent.' }, 400);
    }

    var lastOpponentRow = findLastRowForOpponent_(sheet, data.opponent);
    var targetRow = 0;
    var separatorRow = 0;

    if (isHandHistorySource && !data.opponent) {
      var anchorRow = findLastContentRow_(sheet);
      sheet.insertRowAfter(anchorRow);
      targetRow = anchorRow + 1;
    } else if (lastOpponentRow) {
      sheet.insertRowAfter(lastOpponentRow);
      targetRow = lastOpponentRow + 1;
    } else {
      var insertion = createRowForNewOpponent_(sheet);
      targetRow = insertion.targetRow;
      separatorRow = insertion.separatorRow;
    }

    var rowValues = emptyRow_();
    rowValues[COL_NICKNAME - 1] = data.opponent || (isHandHistorySource ? 'HH' : '');
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

function findLastContentRow_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return HEADER_ROW;
  }

  var scanToCol = COL_PRESUPPOSITION + 2;
  var values = sheet.getRange(FIRST_DATA_ROW, 1, lastRow - HEADER_ROW, scanToCol).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    var hasContent = false;
    for (var col = 0; col < row.length; col++) {
      if (asText_(row[col]) !== '') {
        hasContent = true;
        break;
      }
    }
    if (hasContent) {
      return FIRST_DATA_ROW + i;
    }
  }

  return HEADER_ROW;
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

  var values = sheet.getRange(FIRST_DATA_ROW, 1, lastRow - HEADER_ROW, TOTAL_COLUMNS).getValues();
  var idHint = extractIdHint_(opponent);
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var nick = asText_(row[COL_NICKNAME - 1]);
    if (nick === opponent || (idHint && rowContainsIdHint_(row, idHint))) {
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

  var values = sheet.getRange(FIRST_DATA_ROW, 1, lastRow - HEADER_ROW, TOTAL_COLUMNS).getValues();
  var q = asText_(query).toLowerCase();
  var max = Number(limit);
  if (!max || max < 1) max = 50;
  if (max > 5000) max = 5000;

  var seen = {};
  var items = [];

  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    var nick = asText_(row[COL_NICKNAME - 1]);
    var candidates = [];
    if (nick) {
      candidates.push(nick);
    }
    candidates = candidates.concat(extractActorIdsFromRow_(row));

    for (var c = 0; c < candidates.length; c++) {
      var candidate = asText_(candidates[c]);
      if (!candidate) continue;
      var lower = candidate.toLowerCase();
      if (q && lower.indexOf(q) === -1) continue;
      if (seen[lower]) continue;

      seen[lower] = true;
      items.push(candidate);
      if (items.length >= max) break;
    }
    if (items.length >= max) break;
  }

  return { ok: true, opponents: items };
}

function listOpponentRowsPayload_(sheet, opponent, limit) {
  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return { ok: true, opponent: opponent, sheetName: sheet.getName(), rows: [] };
  }

  var max = Number(limit);
  if (!max || max < 1) max = 500;
  if (max > 5000) max = 5000;

  var values = sheet.getRange(FIRST_DATA_ROW, 1, lastRow - HEADER_ROW, TOTAL_COLUMNS).getValues();
  var rows = [];

  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    var nick = asText_(row[COL_NICKNAME - 1]);
    if (nick !== opponent) continue;

    rows.push({
      row: FIRST_DATA_ROW + i,
      preflop: joinRowCells_(row, COL_PREFLOP, COL_PREFLOP_2),
      flop: joinRowCells_(row, COL_FLOP, COL_FLOP + 2),
      turn: joinRowCells_(row, COL_TURN, COL_TURN + 2),
      river: joinRowCells_(row, COL_RIVER, COL_RIVER + 2),
      presupposition: joinRowCells_(row, COL_PRESUPPOSITION, COL_PRESUPPOSITION + 2),
      date: asText_(row[COL_DATE - 1])
    });

    if (rows.length >= max) break;
  }

  rows.reverse();
  return { ok: true, opponent: opponent, sheetName: sheet.getName(), rows: rows };
}

function listAllRowsPayload_(sheet, limit) {
  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return { ok: true, sheetName: sheet.getName(), rows: [] };
  }

  var max = Number(limit);
  if (!max || max < 1) max = 500;
  if (max > 5000) max = 5000;

  var values = sheet.getRange(FIRST_DATA_ROW, 1, lastRow - HEADER_ROW, TOTAL_COLUMNS).getValues();
  var rows = [];

  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    rows.push({
      row: FIRST_DATA_ROW + i,
      nickname: asText_(row[COL_NICKNAME - 1]),
      preflop: joinRowCells_(row, COL_PREFLOP, COL_PREFLOP_2),
      flop: joinRowCells_(row, COL_FLOP, COL_FLOP + 2),
      turn: joinRowCells_(row, COL_TURN, COL_TURN + 2),
      river: joinRowCells_(row, COL_RIVER, COL_RIVER + 2),
      presupposition: joinRowCells_(row, COL_PRESUPPOSITION, COL_PRESUPPOSITION + 2),
      date: asText_(row[COL_DATE - 1])
    });

    if (rows.length >= max) break;
  }

  rows.reverse();
  return { ok: true, sheetName: sheet.getName(), rows: rows };
}

function joinRowCells_(rowValues, startCol, endCol) {
  var parts = [];
  var from = Math.max(1, Number(startCol) || 1);
  var to = Math.max(from, Number(endCol) || from);
  for (var col = from; col <= to; col++) {
    if (col > rowValues.length) break;
    var value = asText_(rowValues[col - 1]);
    if (value) parts.push(value);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function extractIdHint_(value) {
  var source = asText_(value);
  if (!source) return '';
  var match = source.match(/\d{4,}/g);
  if (!match || !match.length) return '';
  return match[match.length - 1];
}

function rowContainsIdHint_(rowValues, idHint) {
  if (!idHint) return false;
  var regex = new RegExp('\\b[A-Za-z0-9]+_' + idHint + '\\b', 'i');
  for (var col = COL_PREFLOP; col <= COL_PRESUPPOSITION + 2; col++) {
    if (col > rowValues.length) break;
    var value = asText_(rowValues[col - 1]);
    if (!value) continue;
    if (regex.test(value)) return true;
  }
  return false;
}

function extractActorIdsFromRow_(rowValues) {
  var out = [];
  var seen = {};
  for (var col = COL_PREFLOP; col <= COL_PRESUPPOSITION + 2; col++) {
    if (col > rowValues.length) break;
    var value = asText_(rowValues[col - 1]);
    if (!value) continue;
    var matches = value.match(/[A-Za-z0-9]+_(\d{4,})/g) || [];
    for (var i = 0; i < matches.length; i++) {
      var actor = matches[i];
      var id = actor.split('_')[1] || '';
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
  }
  return out;
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
