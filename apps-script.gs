/**
 * 매도 사다리 — 저장 백엔드 (Google Apps Script 웹앱)
 *
 * 하는 일은 딱 두 가지다.
 *   1) 계획 한 건을 구글시트에 한 줄로 적는다 (doPost)
 *   2) 저장된 목록을 최신순으로 돌려준다 (doGet)
 *
 * 배포 방법과 주의사항은 README.md를 참고할 것.
 * 특히 코드를 고친 뒤에는 "배포 관리 → 새 버전"으로 갱신해야 반영된다.
 */

/*
  ⚠️ 반드시 본인만의 문자열로 바꿔서 쓸 것.
  이 값은 비밀번호 역할을 한다. 웹앱 URL을 아는 사람이라도 이 키를 모르면
  저장·조회를 할 수 없다. 사이트의 '저장 설정'에 넣는 키와 똑같아야 한다.
  (기획서 7.1절: URL 비공개 + 키 문자열 일치 검사까지가 이 도구의 보안 범위다)
*/
var KEY = 'CHANGE_ME_여기를_본인만의_문자열로_바꾸세요';

// 기록이 쌓일 시트 이름. 없으면 스크립트가 알아서 만든다.
var SHEET_NAME = '매도사다리';

// 시트 첫 줄에 들어갈 머리글 (기획서 7.3절 스키마)
var HEADERS = [
  '날짜', '종목명', '시장', '매수가', '손절가',
  '분할수', '손익비', '매도가', '예산', '상한가', '메모'
];

// 목록으로 돌려줄 최대 건수
var MAX_ROWS = 50;

/**
 * 기록용 시트를 가져온다. 없으면 머리글과 함께 새로 만든다.
 * 처음 쓰는 사람이 시트를 미리 준비할 필요가 없도록 하기 위함이다.
 */
function getSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  /*
    시트를 새로 만들어야 하는 상황.
    거의 동시에 두 요청이 들어오면 둘 다 "시트가 없네" 하고 각자 만들려다
    뒤늦은 쪽이 '이름 중복' 오류로 실패할 수 있다.
    잠금을 걸어 한 번에 하나만 만들도록 줄을 세운다.
  */
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    // 기다리는 사이에 다른 요청이 이미 만들었을 수 있으니 한 번 더 확인한다
    sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);   // 머리글은 스크롤해도 늘 보이게
    }
  } finally {
    lock.releaseLock();
  }
  return sheet;
}

/**
 * 응답을 JSON 문자열로 돌려준다.
 * Apps Script 웹앱은 HtmlOutput 아니면 TextOutput만 반환할 수 있다.
 */
function sendJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 시트에서 꺼낸 값을 브라우저로 보낼 수 있는 형태로 바꾼다.
 * 날짜는 세계 표준시 표기(ISO)로 넘긴다 — 시간대 정보가 함께 실려야
 * 보는 사람의 시간대로 정확히 옮길 수 있고, 삭제할 행을 찾을 때도 짝이 맞는다.
 *
 * instanceof Date는 Apps Script 실행 환경에 따라 시트에서 온 날짜를 못 알아보는
 * 경우가 있어, 값에게 정체를 직접 물어보는 방식으로 판별한다.
 */
function toPlain_(cell) {
  if (Object.prototype.toString.call(cell) === '[object Date]') {
    return cell.toISOString();
  }
  return cell;
}

/**
 * 기록 한 줄을 지운다.
 * 행 번호가 아니라 '저장 시각 + 종목명'으로 찾는다 — 목록을 본 뒤 지우기까지
 * 사이에 다른 저장이 끼어들면 행 번호는 밀려버리기 때문이다.
 * 최신 것부터 훑고, 찾으면 하나만 지운다.
 */
function deleteRow_(sheet, savedAt, name) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();   // 날짜·종목명만
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(toPlain_(values[i][0])) === savedAt && String(values[i][1]) === name) {
      sheet.deleteRow(i + 2);   // 1행은 머리글이라 +2
      return true;
    }
  }
  return false;
}

/**
 * 저장 요청 처리.
 *
 * 프론트는 Content-Type을 text/plain으로 보낸다. application/json으로 보내면
 * 브라우저가 본 요청 전에 OPTIONS(preflight)를 먼저 던지는데,
 * Apps Script 웹앱은 그걸 받아주지 못해 요청 자체가 실패하기 때문이다.
 * 그래서 실제 내용은 JSON이지만 껍데기 표기만 text/plain으로 온다.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return sendJson_({ ok: false, error: '요청 본문이 비어 있습니다' });
    }

    var body = JSON.parse(e.postData.contents);

    if (body.key !== KEY) {
      return sendJson_({ ok: false, error: '키 불일치' });
    }

    /*
      삭제 요청.
      Apps Script 웹앱은 GET·POST만 받으므로, 지우는 일도 POST로 온다.
      action이 없는 요청은 지금까지처럼 저장으로 처리된다(기존 호환).
    */
    if (body.action === 'delete') {
      var removed = deleteRow_(getSheet_(), String(body.savedAt || ''), String(body.name || ''));
      return removed
        ? sendJson_({ ok: true })
        : sendJson_({ ok: false, error: '지울 기록을 찾지 못했습니다' });
    }

    getSheet_().appendRow([
      new Date(),                              // 날짜는 서버 시각으로 남긴다
      body.name || '(무명)',                    // 종목명을 비웠으면 (무명)
      body.market || '',
      body.entry,
      body.stop,
      body.splits,
      body.ratio,
      body.sells || '',                        // "10,600 / 11,200 / 11,800" 형태의 문자열
      body.budget || '',
      body.ceiling || '',
      body.memo || ''
    ]);

    return sendJson_({ ok: true });
  } catch (error) {
    return sendJson_({ ok: false, error: String(error) });
  }
}

/**
 * 목록 조회 처리. `?key=...&action=list` 형태로 부른다.
 * 최신 것이 위로 오도록 뒤집어서 최대 50건만 돌려준다.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};

    if (params.key !== KEY) {
      return sendJson_({ ok: false, error: '키 불일치' });
    }
    if (params.action !== 'list') {
      return sendJson_({ ok: false, error: '알 수 없는 action: ' + (params.action || '(없음)') });
    }

    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();

    // 1행은 머리글이므로, 2행부터가 실제 기록이다
    if (lastRow < 2) {
      return sendJson_({ ok: true, rows: [] });
    }

    /*
      필요한 건 최신 50건뿐이다. 시트 전체를 읽어와서 자르면
      기록이 수천 건 쌓였을 때 조회가 눈에 띄게 느려지므로,
      처음부터 끝쪽 50줄만 집어 온다.
    */
    var startRow = Math.max(2, lastRow - MAX_ROWS + 1);
    var values = sheet.getRange(startRow, 1, lastRow - startRow + 1, HEADERS.length).getValues();

    var rows = values.reverse().map(function (row) {
      return row.map(toPlain_);
    });

    return sendJson_({ ok: true, rows: rows });
  } catch (error) {
    return sendJson_({ ok: false, error: String(error) });
  }
}
