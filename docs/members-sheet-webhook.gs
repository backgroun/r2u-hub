/**
 * R2U 회원 시트 자동 추가·닉네임 변경용 Apps Script
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
    var sh = SpreadsheetApp.getActive().getSheets().filter(function (s) { return s.getSheetId() === MEMBER_SHEET_GID; })[0];
    if (!sh) return out({ ok: false, error: 'sheet' });
    if (d.action === 'updateMemberName') {
      var nickForName = String(d.nick || '').trim();
      if (!nickForName) return out({ ok: false, error: 'bad' });
      var nameLock = LockService.getScriptLock();
      nameLock.waitLock(10000);
      try {
        var nameRows = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getValues();
        for (var n = 0; n < nameRows.length; n++) {
          var nameCell = String(nameRows[n][0]).trim();
          if (nameCell === nickForName || nameCell.indexOf(nickForName + '/') === 0) {
            sh.getRange(n + 1, 1, 1, 2).setValues([[nickForName, String(d.name || '').trim()]]);
            return out({ ok: true });
          }
        }
        return out({ ok: false, error: 'missing' });
      } finally { nameLock.releaseLock(); }
    }
    if (d.action === 'renameMember') {
      var oldNick = String(d.oldNick || '').trim();
      var newNick = String(d.newNick || '').trim();
      if (!oldNick || !newNick || oldNick === newNick) return out({ ok: false, error: 'bad' });
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        var values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getValues();
        var oldRow = -1, newRow = -1, oldName = '';
        for (var j = 0; j < values.length; j++) {
          var cell = String(values[j][0]).trim();
          if (cell === oldNick || cell.indexOf(oldNick + '/') === 0) {
            oldRow = j + 1;
            if (cell.indexOf(oldNick + '/') === 0) oldName = cell.slice(oldNick.length + 1).trim();
          }
          if (cell === newNick) newRow = j + 1;
        }
        if (oldRow > 0 && newRow > 0 && oldRow !== newRow) return out({ ok: false, error: 'duplicate' });
        var row = oldRow > 0 ? oldRow : newRow;
        if (row < 1) return out({ ok: false, error: 'missing' });
        var name = String(d.name || '').trim() || String(values[row - 1][1] || '').trim() || oldName;
        sh.getRange(row, 1, 1, 2).setValues([[newNick, name]]);
        return out({ ok: true });
      } finally { lock.releaseLock(); }
    }
    if (d.action !== 'addMember' || !d.nick) return out({ ok: false, error: 'bad' });
    var nick = String(d.nick).trim();
    var a = sh.getRange(1, 1, sh.getMaxRows(), 1).getValues();
    var last = 0;
    for (var i = 0; i < a.length; i++) {
      var v = String(a[i][0]).trim();
      if (v === nick) return out({ ok: true, dup: true }); // 이미 있으면 그대로 성공
      if (v) last = i + 1;
    }
    sh.getRange(last + 1, 1).setValue(nick);
    // B열은 이름을 적는 칸이므로 비워 둔다.
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
