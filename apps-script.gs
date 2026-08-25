/**
 * 매도 사다리 — 저장 백엔드 (Google Apps Script 웹앱)
 *
 * 계획 하나가 시트 한 줄이다.
 * 처음 저장하면 줄이 새로 생기고, 같은 계획을 고쳐 저장하면 그 줄이 갱신된다.
 * (예전에는 저장할 때마다 줄이 쌓이는 일지였는데, 계획 문서 목록으로 바뀌었다)
 *
 * 배포 방법은 README.md 참고.
 * 코드를 고친 뒤에는 "배포 관리 → 새 버전"으로 갱신해야 반영된다.
 */

/*
  ⚠️ 반드시 본인만의 문자열로 바꿔서 쓸 것.
  이 값은 비밀번호 역할을 한다. 사이트 서버에 넣어둔 KEY와 똑같아야 한다.
*/
var KEY = 'CHANGE_ME_여기를_본인만의_문자열로_바꾸세요';

var SHEET_NAME = '매도사다리';

/*
  시트 첫 줄 머리글.
  앞의 11칸은 예전 그대로 두고 뒤에 ID·수정일시를 덧붙였다 —
  이미 쌓인 기록의 칸 위치를 흔들지 않기 위해서다.
*/
var HEADERS = [
  '날짜', '종목명', '시장', '매수가', '손절가',
  '분할수', '손익비', '매도가', '예산', '상한가', '메모',
  'ID', '수정일시'
];

var COL = { DATE: 0, NAME: 1, MARKET: 2, ENTRY: 3, STOP: 4,
            SPLITS: 5, RATIO: 6, SELLS: 7, BUDGET: 8, CEILING: 9, MEMO: 10,
            ID: 11, UPDATED: 12 };

var MAX_ROWS = 200;

/* ── 공통 ──────────────────────────────────────────────────────── */

function sendJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 시트에서 꺼낸 값을 브라우저로 보낼 수 있는 형태로 바꾼다.
 * 날짜는 세계 표준시 표기(ISO)로 넘긴다 — 시간대 정보가 함께 실려야
 * 보는 사람의 시간대로 정확히 옮길 수 있다.
 */
function toPlain_(cell) {
  if (Object.prototype.toString.call(cell) === '[object Date]') {
    return cell.toISOString();
  }
  return cell;
}

/** 계획마다 붙는 고유 번호 — 종목명을 바꿔도 같은 계획임을 알아보게 해준다 */
function makeId_() {
  return Utilities.getUuid();
}

/**
 * 기록용 시트를 가져온다. 없으면 머리글과 함께 새로 만들고,
 * 예전 형식(ID 칸이 없는)이면 새 형식으로 한 번 옮겨준다.
 */
function getSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      sheet = spreadsheet.getSheetByName(SHEET_NAME);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(SHEET_NAME);
        sheet.appendRow(HEADERS);
        sheet.setFrozenRows(1);
      }
    } finally {
      lock.releaseLock();
    }
    return sheet;
  }

  migrate_(spreadsheet, sheet);
  return sheet;
}

/**
 * 예전 형식 시트를 새 형식으로 옮긴다. 한 번만 실행된다.
 *
 * 하는 일:
 *   1) 원본을 백업 시트로 복사해 둔다 (되돌릴 수 있게)
 *   2) 같은 종목명이 여러 줄이면 가장 최근 것만 남긴다
 *   3) 남은 줄마다 고유 번호를 붙인다
 */
function migrate_(spreadsheet, sheet) {
  var width = sheet.getLastColumn();
  var header = width > 0 ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
  if (header[COL.ID] === 'ID') return;   // 이미 새 형식

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    // 잠금을 기다리는 사이 다른 요청이 끝냈을 수도 있다
    header = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    if (header[COL.ID] === 'ID') return;

    var lastRow = sheet.getLastRow();

    // 1) 백업 — 정리가 마음에 안 들면 여기서 되찾을 수 있다
    if (lastRow > 1) {
      var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
      sheet.copyTo(spreadsheet).setName(SHEET_NAME + '_백업_' + stamp);
    }

    // 머리글을 새 것으로
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    if (lastRow < 2) return;

    // 2) 종목명별로 가장 최근 줄만 남긴다
    var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    var latest = {};      // 종목명 → 줄
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var name = String(row[COL.NAME] || '');
      var when = row[COL.DATE] instanceof Date ? row[COL.DATE].getTime() : i;
      if (!latest[name] || when >= latest[name].when) {
        latest[name] = { when: when, row: row };
      }
    }

    // 최근 것이 아래로 오도록 시간순 정렬
    var kept = [];
    for (var name in latest) kept.push(latest[name]);
    kept.sort(function (a, b) { return a.when - b.when; });

    // 3) 고유 번호와 수정일시를 붙여 다시 쓴다
    var rewritten = kept.map(function (item) {
      var row = item.row.slice(0, 11);
      row[COL.ID] = makeId_();
      row[COL.UPDATED] = row[COL.DATE];   // 고친 적 없으니 처음 저장한 때와 같다
      return row;
    });

    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
    if (rewritten.length > 0) {
      sheet.getRange(2, 1, rewritten.length, HEADERS.length).setValues(rewritten);
    }
  } finally {
    lock.releaseLock();
  }
}

/** id로 줄 번호를 찾는다 (없으면 -1) */
function findRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !id) return -1;
  var ids = sheet.getRange(2, COL.ID + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

/* ── 저장·갱신·삭제 ─────────────────────────────────────────────── */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return sendJson_({ ok: false, error: '요청 본문이 비어 있습니다' });
    }
    var body = JSON.parse(e.postData.contents);
    if (body.key !== KEY) return sendJson_({ ok: false, error: '키 불일치' });

    var sheet = getSheet_();

    if (body.action === 'delete') {
      var target = findRowById_(sheet, String(body.id || ''));
      if (target === -1) return sendJson_({ ok: false, error: '지울 계획을 찾지 못했습니다' });
      sheet.deleteRow(target);
      return sendJson_({ ok: true });
    }

    /*
      저장.
      id를 들고 오면 그 줄을 고쳐 쓰고, 없으면 새 줄을 만든다.
      되살리기(실행 취소)도 id를 들고 오는 저장이라 같은 길로 처리된다.
    */
    var now = new Date();
    var id = String(body.id || '');
    var row = findRowById_(sheet, id);
    var isNew = row === -1;

    if (isNew) {
      id = id || makeId_();
      row = sheet.getLastRow() + 1;
    }

    var createdAt = isNew
      ? (body.createdAt ? new Date(body.createdAt) : now)     // 되살릴 때는 원래 만든 때를 지킨다
      : sheet.getRange(row, COL.DATE + 1).getValue();

    sheet.getRange(row, 1, 1, HEADERS.length).setValues([[
      createdAt,
      body.name || '(무명)',
      body.market || '',
      body.entry,
      body.stop,
      body.splits,
      body.ratio,
      body.sells || '',
      body.budget === undefined || body.budget === null ? '' : body.budget,
      body.ceiling === undefined || body.ceiling === null ? '' : body.ceiling,
      body.memo || '',
      id,
      now
    ]]);

    return sendJson_({ ok: true, id: id, savedAt: now.toISOString() });
  } catch (error) {
    return sendJson_({ ok: false, error: String(error) });
  }
}

/* ── 목록 ──────────────────────────────────────────────────────── */

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (params.key !== KEY) return sendJson_({ ok: false, error: '키 불일치' });
    if (params.action !== 'list') {
      return sendJson_({ ok: false, error: '알 수 없는 action: ' + (params.action || '(없음)') });
    }

    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return sendJson_({ ok: true, rows: [] });

    var startRow = Math.max(2, lastRow - MAX_ROWS + 1);
    var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, HEADERS.length).getValues();

    // 최근에 고친 것이 앞으로 오게
    var rows = values.map(function (row) { return row.map(toPlain_); }).reverse();
    return sendJson_({ ok: true, rows: rows });
  } catch (error) {
    return sendJson_({ ok: false, error: String(error) });
  }
}
