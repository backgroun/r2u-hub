/**
 * R2U 회원 시트 자동 추가용 Apps Script
 *
 * 설정 방법
 * 1) 회원 구글시트에서 [확장 프로그램] → [Apps Script]를 열고 이 코드를 붙여 넣어요.
 * 2) 왼쪽 [프로젝트 설정] → [스크립트 속성]에 SECRET 이름으로 아무 긴 문장을 하나 저장해요.
 * 3) [배포] → [새 배포] → 유형 '웹 앱' → 실행 사용자 '나', 액세스 '모든 사용자' → 배포.
 * 4) 코드를 고친 뒤에는 [배포] → [배포 관리] → 연필 → 버전 '새 버전' → 배포로 다시 올려야 적용돼요. (주소는 그대로예요)
 * 5) 나온 웹 앱 주소를 사이트 환경변수 SHEET_WEBHOOK_URL 에, 2)의 문장을 SHEET_WEBHOOK_SECRET 에 넣어요.
 */
var MEMBER_SHEET_GID = 254083814; // 회원 탭 주소의 gid

function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== PropertiesService.getScriptProperties().getProperty('SECRET')) return out({ ok: false, error: 'secret' });
    if (d.action !== 'addMember' || !d.nick) return out({ ok: false, error: 'bad' });
    var sh = SpreadsheetApp.getActive().getSheets().filter(function (s) { return s.getSheetId() === MEMBER_SHEET_GID; })[0];
    if (!sh) return out({ ok: false, error: 'sheet' });
    var nick = String(d.nick).trim();
    var a = sh.getRange(1, 1, sh.getMaxRows(), 1).getValues();
    var last = 0;
    for (var i = 0; i < a.length; i++) {
      var v = String(a[i][0]).trim();
      if (v === nick) return out({ ok: true, dup: true }); // 이미 있으면 그대로 성공
      if (v) last = i + 1;
    }
    sh.getRange(last + 1, 1).setValue(nick);
    // B열: 등록일시 (예: 2026-10-14 06:06). 글자 그대로 넣어 날짜 형식으로 바뀌지 않게 한다
    var c = sh.getRange(last + 1, 2);
    c.setNumberFormat('@');
    c.setValue(String(d.registeredAt || ''));
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
