// 연동 모드: Supabase 주소와 키가 둘 다 있으면 서버에 저장하고, 없으면 테스트 모드(이 폰에만 저장)
const SYNC = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// ===== 상태 =====
// 체크하면 바로 빙고에 반영돼요 (승인 절차 없음 - 본인 양심!)
// state.local: 이 폰에 임시 저장해둔 참가자별 기록(테스트 모드/오프라인 대비)
let state = load();
let cur = -1;
let rows = [];
let roster = SYNC ? [] : DUMMY_ROSTER.map(r => r.name);
let hubPeriod = null; // 허브에서 운영진이 정한 이벤트 기간 {start,end} (있으면 이쪽이 우선)
let eventNicks = []; // 허브가 알려 주는 이벤트 참가자 명단 (비어 있으면 거르지 않음)
const inHub = self !== top; // 허브(이벤트 탭) 안의 화면인가
const preview = /[?&]preview=1\b/.test(location.search); // 오픈 전 미리보기: 빙고판만 둘러본다 (눌러도 인증되지 않는다)
const previewJoined = /[?&]joined=1\b/.test(location.search); // 미리보기 중인 사람이 이미 참가 신청을 했는가
if (preview) document.body.classList.add('preview');
let hubLoaded = false; // 허브가 알려 주는 이벤트 참가자 명단을 받았는가
let hubStaff = false; // 허브 운영진 모드 계정(개인 참가가 없는 계정)인가
let hubNick = ''; // R2U 허브에 로그인한 닉네임 (입장 화면 자동 선택용)
let fresh = new Set(); // 아직 비밀번호가 없는(처음 입장하는) 참가자
let syncErr = null;    // 명단을 불러오지 못했을 때의 오류

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  s = s && typeof s === 'object' ? s : {};
  const st = {
    name: String(s.name || ''),
    pw: String(s.pw || ''),
    local: s.local && typeof s.local === 'object' ? s.local : {},
    dpw: s.dpw && typeof s.dpw === 'object' ? s.dpw : {},
    done: {},
  };
  if (st.name && st.pw) {
    const l = st.local[st.name];
    if (l && l.done) st.done = l.done;
  }
  return st;
}
function save() {
  if (state.name) state.local[state.name] = { done: state.done };
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: state.name, pw: state.pw, local: state.local, dpw: state.dpw }));
  } catch (e) {}
}
const loggedIn = () => !!(state.name && state.pw);
const norm = s => String(s).trim().toLowerCase();

// 테스트 모드의 더미 비밀번호 (직접 설정한 값이 우선)
function dummyPw(name) {
  if (state.dpw[name]) return state.dpw[name];
  const r = DUMMY_ROSTER.find(x => x.name === name);
  return r ? r.pw : '';
}
function refreshFresh() {
  if (!SYNC) fresh = new Set(roster.filter(n => !dummyPw(n)));
}

// ===== 빙고 줄 계산 =====
const LINES = (() => {
  const L = [];
  for (let r = 0; r < 5; r++) L.push([0, 1, 2, 3, 4].map(c => r * 5 + c));
  for (let c = 0; c < 5; c++) L.push([0, 1, 2, 3, 4].map(r => r * 5 + c));
  L.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return L;
})();
const isDone = i => Object.prototype.hasOwnProperty.call(state.done, i);
const doneLines = () => LINES.filter(l => l.every(isDone));
const doneCount = () => Object.keys(state.done).length;

// ===== 유틸 =====
const $ = id => document.getElementById(id);
const fmt = d => d.slice(5).replace('-', '/');
function todayClamped() {
  const n = new Date();
  const t = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  return t < START ? START : t > END ? END : t;
}
let toastTimer;
function toast(msg, ms) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms || 2600);
}

// ===== 렌더 =====
function render() {
  const lines = doneLines();
  const inLine = new Set(lines.flat());
  const grid = $('grid');
  grid.textContent = '';
  MISSIONS.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell' + (i === CENTER ? ' center' : '') + (isDone(i) ? ' done' : '') + (inLine.has(i) ? ' line' : '');
    b.setAttribute('aria-label', `${i + 1}번 ${m.t}${isDone(i) ? ', 인증완료' : ''}`);
    const no = document.createElement('span'); no.className = 'no'; no.textContent = i + 1;
    no.style.background = COLORS[i % COLORS.length];
    b.style.setProperty('--c', COLORS[i % COLORS.length]); // 칸마다 색을 정해 아이콘 배경·테두리에 쓴다
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = m.e;
    const tt = document.createElement('span'); tt.className = 'tt'; tt.textContent = m.t;
    const dt = document.createElement('span'); dt.className = 'dt'; dt.textContent = isDone(i) ? fmt(state.done[i]) : '';
    b.append(no, ic, tt, dt);
    b.addEventListener('click', () => (editMode ? openEdit(i) : openSheet(i)));
    grid.appendChild(b);
  });
  const n = doneCount();
  $('cnt').textContent = n;
  $('bingo').textContent = lines.length;
  $('bar').style.width = (n / 25 * 100) + '%';
}

// ===== 미션 시트 =====
function openSheet(i) {
  if (preview) {
    // 오픈 전에는 미션 내용만 볼 수 있고, 인증(기록 등록)은 할 수 없다
    const d = `${Number(START.slice(5, 7))}/${Number(START.slice(8))}`;
    const m = MISSIONS[i];
    $('sIcon').textContent = m.e;
    $('sNum').textContent = `MISSION ${i + 1}`;
    $('sTitle').textContent = m.t;
    $('sDesc').textContent = m.d;
    $('sState').textContent = previewJoined ? `${d}(시작일)부터 인증할 수 있어요.` : `참가 신청하면 ${d}(시작일)부터 인증할 수 있어요.`;
    cur = -1;
    $('dim').classList.add('on');
    $('sheet').classList.add('on');
    return;
  }
  if (!loggedIn()) {
    toast('먼저 참가자를 고르고 비밀번호로 입장해 주세요!');
    $('who').focus();
    return;
  }
  cur = i;
  const m = MISSIONS[i];
  const done = isDone(i);
  $('sIcon').textContent = m.e;
  $('sNum').textContent = `MISSION ${i + 1}`;
  $('sTitle').textContent = m.t;
  $('sDesc').textContent = m.d;
  $('sState').textContent = done
    ? '✅ 인증한 칸이에요. 날짜를 바꾸거나 사진을 새로 올릴 수 있어요. (사진을 고르지 않으면 기존 사진이 유지돼요)'
    : '러닝 인증 사진을 올리고 인증을 완료해 주세요.' + (PHOTO_REQUIRED && SYNC ? ' (사진 필수)' : ' (사진 선택)');
  const d = $('sDate');
  d.min = START; d.max = END;
  d.value = done ? state.done[i] : todayClamped();
  Photo.reset();
  $('sPhotoReq').textContent = PHOTO_REQUIRED && !done ? '(필수)' : '(선택)';
  $('sOk').textContent = done ? '수정 저장' : '인증완료';
  $('sUndo').hidden = !done;
  $('dim').classList.add('on');
  $('sheet').classList.add('on');
}
function closeSheet() {
  $('dim').classList.remove('on');
  $('sheet').classList.remove('on');
  cur = -1;
}
$('dim').addEventListener('click', () => { closeSheet(); closeEdit(); });
$('sClose').addEventListener('click', closeSheet);

// ===== 로그인 / Supabase 연동 =====
// Supabase 의 함수(RPC)를 호출해요. 표를 직접 읽고 쓰지 않아요.
const RPC = {
  snapshot: () => ['get_snapshot', {}],
  login: p => ['app_login', { p_name: p.name, p_pw: p.pw }],
  photoSlot: p => ['app_photo_slot', { p_name: p.name, p_pw: p.pw, p_no: p.no }],
  set: p => ['app_set', { p_name: p.name, p_pw: p.pw, p_no: p.no, p_title: p.title, p_date: p.date, p_link: '', p_photo: p.photo || null }],
  remove: p => ['app_remove', { p_name: p.name, p_pw: p.pw, p_no: p.no }],
  report: p => ['app_my_report', { p_name: p.name, p_pw: p.pw }],
  adminLogin: p => ['admin_login', { p_secret: p.secret }],
  adminMember: p => ['admin_member', { p_secret: p.secret, p_action: p.act, p_name: p.name, p_new_name: p.newName || null }],
  adminMission: p => ['admin_mission_save', { p_secret: p.secret, p_no: p.no, p_emoji: p.e, p_title: p.t, p_descr: p.d }],
  adminInfo: p => ['admin_info_save', { p_secret: p.secret, p_title: p.title, p_items: p.items, p_start: p.start, p_end: p.end }],
};
async function api(payload) {
  const [fn, body] = payload ? RPC[payload.action](payload) : RPC.snapshot();
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
  if (/^eyJ/.test(SUPABASE_ANON_KEY)) headers.Authorization = 'Bearer ' + SUPABASE_ANON_KEY; // 예전 방식(JWT) 키일 때만
  let res, j;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    const err = new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요');
    err.code = 'NET';
    throw err;
  }
  try {
    j = await res.json();
  } catch (e) {
    const err = new Error('서버 응답이 올바르지 않아요. 잠시 후 다시 시도해 주세요');
    err.code = 'PARSE';
    throw err;
  }
  if (!res.ok) {
    const err = new Error('서버에 문제가 있어요. 잠시 후 다시 시도해 주세요');
    err.code = 'HTTP ' + res.status;
    err.detail = String((j && (j.message || j.hint || j.error)) || '').slice(0, 140);
    throw err;
  }
  if (!j || !j.ok) {
    const err = new Error((j && j.error) || '저장하지 못했어요');
    err.auth = !!(j && j.auth);
    err.detail = '';
    throw err;
  }
  return j;
}
// 서버에서 받은 미션 이름 / 안내 문구 / 이벤트 기간을 화면에 반영해요 (운영진이 고친 내용)
function applyMissions(list) {
  if (!Array.isArray(list)) return;
  for (const m of list) {
    const t = MISSIONS[m.no - 1];
    if (t) { t.t = m.t; t.d = m.d; t.e = m.e; }
  }
}
function applyInfo(i) {
  if (!i) return;
  if (hubPeriod) { START = hubPeriod.start; END = hubPeriod.end; }
  else if (i.start && i.end) { START = i.start; END = i.end; }
  if (Number.isInteger(i.maxPerDay) && i.maxPerDay >= 1) MAX_PER_DAY = i.maxPerDay;
  showPeriod();
  // 아래 안내 카드는 운영진이 안내 제목을 적어 둔 경우에만 보인다 (기간은 위쪽 제목 아래에만 있다)
  $('infoCard').hidden = !i.title;
  if (i.title) $('infoTitle').textContent = i.title;
}
function takeSnapshot(j) {
  rows = j.rows; roster = j.names; fresh = new Set(j.fresh || []);
  applyMissions(j.missions); applyInfo(j.info);
  setTimeout(autoEnter, 0);
}
function applyRows() {
  const d = {};
  for (const r of rows) if (norm(r.n) === norm(state.name)) d[r.no - 1] = r.d;
  state.done = d;
}
function selectedFresh() { return fresh.has($('who').value); }
function fillSelect() {
  const sel = $('who');
  const keep = sel.value;
  sel.textContent = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = roster.length ? '참가자를 선택하세요' : (SYNC ? (syncErr ? '명단을 불러오지 못했어요' : '불러오는 중…') : '명단이 비어 있어요');
  sel.appendChild(first);
  const shown = eventNicks.length ? roster.filter(n => eventNicks.some(e => norm(e) === norm(n))) : roster;
  for (const n of shown) {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    sel.appendChild(o);
  }
  if (roster.includes(keep)) sel.value = keep;
  else if (hubNick) { const m = roster.find(n => norm(n) === norm(hubNick)); if (m) sel.value = m; }
}
function renderLoginMode() {
  const isNew = selectedFresh();
  $('pw2row').hidden = !isNew;
  $('enter').textContent = isNew ? '비밀번호 설정하고 입장' : '입장';
  $('pw').placeholder = isNew ? `새 비밀번호 (${MIN_PW}자 이상)` : '비밀번호';
  $('pw').autocomplete = isNew ? 'new-password' : 'current-password';
  let hint;
  if (isNew) hint = '처음이시네요! 사용할 비밀번호를 정해 주세요. 잊어버리면 운영진에게 초기화를 요청하세요.';
  else if (SYNC) hint = '내가 정한 비밀번호를 입력하세요. 잊어버렸다면 운영진에게 초기화를 요청하세요.';
  else hint = '테스트 모드예요. 토끼·거북이·다람쥐는 비밀번호 1234, 나머지는 "처음 입장(비밀번호 설정)"을 체험해 보세요.';
  if (SYNC && !roster.length && syncErr) hint = `연결 오류(${syncErr.code || 'ERR'}): ${syncErr.message}${syncErr.detail ? ' [' + syncErr.detail + ']' : ''} — 아래 '새로고침'을 눌러보고, 계속되면 운영진에게 알려주세요.`;
  $('loginHint').textContent = hint;
}
function renderAuth() {
  $('login').hidden = loggedIn();
  $('hubEnter').hidden = !(inHub && !loggedIn() && !hubStaff && !preview);
  $('me').hidden = !loggedIn();
  $('meName').textContent = state.name;
  $('reportOpen').hidden = !(SYNC && loggedIn());
  renderLoginMode();
}
function renderAll() { refreshFresh(); renderAuth(); fillSelect(); renderLoginMode(); render(); renderBoard(); }

async function syncAll(quiet) {
  if (!SYNC) return;
  try {
    takeSnapshot(await api());
    syncErr = null;
    if (loggedIn()) applyRows();
    save(); renderAll();
  } catch (e) {
    syncErr = e;
    fillSelect(); renderLoginMode();
    if (!quiet) toast(e.message || '현황을 불러오지 못했어요');
  }
}
function logout(msg) {
  state.name = ''; state.pw = ''; state.done = {};
  save(); renderAll();
  if (msg) toast(msg);
}
async function enter() {
  const name = $('who').value;
  const pw = $('pw').value.trim();
  const isNew = selectedFresh();
  if (!name) { toast('참가자를 먼저 선택해 주세요'); return; }
  if (!pw) { toast('비밀번호를 입력해 주세요'); return; }
  if (isNew) {
    if (pw.length < MIN_PW) { toast(`비밀번호는 ${MIN_PW}자 이상으로 정해 주세요`); return; }
    if (pw !== $('pw2').value.trim()) { toast('비밀번호가 서로 달라요. 다시 확인해 주세요'); return; }
  }
  $('enter').disabled = true;
  try {
    if (SYNC) {
      const j = await api({ action: 'login', name, pw });
      takeSnapshot(j);
      state.name = j.name || name; state.pw = pw;
      applyRows();
    } else {
      if (isNew) state.dpw[name] = pw;
      else if (pw !== dummyPw(name)) throw new Error('비밀번호가 맞지 않아요');
      state.name = name; state.pw = pw;
      const l = state.local[name];
      state.done = l && l.done ? l.done : {};
    }
    $('pw').value = ''; $('pw2').value = '';
    save(); renderAll();
    rememberPw(state.name, pw);
    toast(isNew ? `${state.name}님, 비밀번호가 설정됐어요!` : `${state.name}님 반가워요!`);
  } catch (e) {
    toast(e.message || '입장하지 못했어요');
  } finally {
    $('enter').disabled = false;
  }
}
async function push(payload) {
  if (!SYNC) return;
  try {
    takeSnapshot(await api({ ...payload, name: state.name, pw: state.pw }));
    applyRows(); save(); render(); renderBoard();
  } catch (e) {
    if (e.auth) { logout(e.message); return; }
    toast((e.message || '저장하지 못했어요') + (e.detail ? ` (${e.detail})` : ''), 8000);
    await syncAll(true);
  }
}
function renderBoard() {
  if (!SYNC) return;
  // 허브 안에서는 이벤트 참가 신청한 사람만 보여 준다 (명단을 받기 전에는 비워 둔다)
  if (inHub && !hubLoaded) { $('boardSum').textContent = ''; $('rank').textContent = ''; return; }
  const allowed = inHub ? new Set(eventNicks.map(norm)) : null;
  const by = new Map();
  let total = 0;
  for (const n of roster) if (!allowed || allowed.has(norm(n))) by.set(norm(n), { name: n, set: new Set() });
  for (const r of rows) {
    const k = norm(r.n);
    if (allowed && !allowed.has(k)) continue;
    if (!by.has(k)) by.set(k, { name: r.n, set: new Set() });
    by.get(k).set.add(r.no - 1);
    total++;
  }
  const list = [...by.values()].map(o => ({
    key: norm(o.name), name: o.name, cnt: o.set.size,
    bingo: LINES.filter(l => l.every(i => o.set.has(i))).length,
  }));
  list.sort((a, b) => b.bingo - a.bingo || b.cnt - a.cnt || a.name.localeCompare(b.name, 'ko'));
  const active = list.filter(p => p.cnt > 0).length;
  $('boardSum').textContent = `참가자 ${list.length}명 · 도전 중 ${active}명 · 총 ${total}칸 인증`;
  const ol = $('rank');
  ol.textContent = '';
  let pos = 0;
  list.forEach((p, i) => {
    if (i === 0 || p.bingo !== list[i - 1].bingo) pos = i + 1; // rank by bingo lines only (ties share the same rank)
    const li = document.createElement('li');
    if (loggedIn() && p.key === norm(state.name)) li.className = 'me';
    const a = document.createElement('span'); a.className = 'pos'; a.textContent = pos;
    const b = document.createElement('span'); b.className = 'nm'; b.textContent = p.name;
    const c = document.createElement('span'); c.className = 'sc';
    const bb = document.createElement('b'); bb.textContent = `빙고 ${p.bingo}줄`;
    c.append(`미션 ${p.cnt}개 · `, bb);
    li.append(a, b, c);
    ol.appendChild(li);
  });
}

// ===== 인증 / 취소 =====
$('sUndo').addEventListener('click', () => {
  const idx = cur;
  delete state.done[idx];
  save(); render(); closeSheet();
  toast('인증을 취소했어요');
  push({ action: 'remove', no: idx + 1 });
});
$('sOk').addEventListener('click', async () => {
  const idx = cur;
  const date = $('sDate').value;
  if (!date || date < START || date > END) {
    toast(`이벤트 기간(${fmt(START)} ~ ${fmt(END)}) 안의 날짜를 골라주세요`);
    return;
  }
  if (SYNC && PHOTO_REQUIRED && !Photo.has() && !isDone(idx)) {
    toast('인증 사진을 골라주세요');
    return;
  }
  const same = Object.keys(state.done).filter(k => Number(k) !== idx && state.done[k] === date).length;
  if (same >= MAX_PER_DAY) {
    toast(`하루 최대 ${MAX_PER_DAY}개 미션까지만 인정돼요`);
    return;
  }
  // 사진이 있으면 먼저 올려요 (실패하면 기록하지 않고 다시 시도할 수 있게 시트를 열어둬요)
  let photo = '';
  if (SYNC && Photo.has()) {
    $('sOk').disabled = true;
    toast('사진을 올리는 중이에요…', 30000);
    try {
      const slot = await api({ action: 'photoSlot', name: state.name, pw: state.pw, no: idx + 1 });
      await Photo.upload(slot.path);
      photo = slot.path;
    } catch (e) {
      $('sOk').disabled = false;
      if (e.auth) { closeSheet(); logout(e.message); return; }
      toast((e.message || '사진을 올리지 못했어요') + (e.code && e.code !== 'NET' ? ` (${e.code})` : ''), 6000);
      return;
    }
    $('sOk').disabled = false;
  }
  const before = doneLines().length;
  state.done[idx] = date;
  save(); render(); closeSheet();
  const after = doneLines().length;
  if (after > before) toast(`🎉 빙고! 지금 ${after}줄이에요`);
  else if (doneCount() === 25) toast('🏆 25칸 전부 완료! 대단해요');
  else toast('인증완료! 게시판 인증도 잊지 마세요 😊');
  push({ action: 'set', no: idx + 1, title: MISSIONS[idx].t, date, photo });
});

// ===== 입장 / 복사 / 초기화 =====
$('who').addEventListener('change', renderLoginMode);
$('enter').addEventListener('click', enter);
$('pw').addEventListener('keydown', e => { if (e.key === 'Enter' && !selectedFresh()) enter(); });
$('pw2').addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });
$('logout').addEventListener('click', () => logout());
$('refresh').addEventListener('click', () => syncAll(false));
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAll(true); });
if (SYNC) {
  $('board').hidden = false;
  $('reset').hidden = true; // 서버에 저장되는 기록은 칸별로 '인증 취소'로 지워요
  $('adminOpen').hidden = false;
}
showPeriod();
function fmtLong(s) {
  const [y, m, d] = s.split('-').map(Number);
  const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${y}. ${m}. ${d}. (${w})`;
}
$('copy').addEventListener('click', async () => {
  const txt = `[R2U 11월 5×5 빙고]\n${state.name || '(미입장)'} · 완료 ${doneCount()}/25 · 빙고 ${doneLines().length}줄`;
  try { await navigator.clipboard.writeText(txt); toast('현황을 복사했어요'); }
  catch (e) { window.prompt('아래 내용을 복사하세요', txt); }
});
$('reset').addEventListener('click', () => {
  if (confirm('내 인증 기록을 모두 지울까요? 되돌릴 수 없어요.')) {
    state.done = {}; save(); render(); toast('초기화했어요');
  }
});

renderAll();
syncAll(true);

// R2U 허브에 로그인한 닉네임이 빙고 명단에 있으면 입장 화면에서 자동으로 골라 둔다
fetch('/api/me', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
  if (!j) return;
  if (Array.isArray(j.eventNicks)) eventNicks = j.eventNicks;
  hubLoaded = true; renderBoard();
  if (j.eventPeriod) { hubPeriod = j.eventPeriod; START = hubPeriod.start; END = hubPeriod.end; showPeriod(); }
  if (j.nick) hubNick = j.nick;
  hubStaff = !!j.staff; renderAuth();
  // 이 브라우저에 다른 사람으로 입장해 둔 기록이 남아 있으면, 허브에 로그인한 사람으로 바꾼다
  if (self !== top && j.nick && loggedIn() && norm(state.name) !== norm(j.nick)) { logout(); autoTried = false; }
  if (!loggedIn()) { fillSelect(); renderLoginMode(); autoEnter(); }
}).catch(() => {});

// ===== R2U 허브 연동: 빙고 비밀번호 자동 입력 =====
// 허브가 기억해 둔 내 빙고 비번으로 자동 입장. 처음(비번 미설정)이면 비번을 만들어 바로 입장한다.
let autoTried = false;
function hubMsg(text, retry) {
  if (!inHub) return;
  $('hubEnterMsg').textContent = text;
  $('hubRetry').hidden = !retry;
}
// 허브 로그인이 곧 신원이라 이름·비밀번호 없이 바로 입장한다. (이벤트에 참가 신청한 크루원·운영진만)
async function autoEnter(retry) {
  if (preview || !SYNC || !hubNick || hubStaff || loggedIn() || (autoTried && !retry)) return;
  autoTried = true;
  hubMsg('입장하는 중…', false);
  try {
    const j = await api({ action: 'login', name: hubNick, pw: 'hub' });
    takeSnapshot(j);
    state.name = j.name || hubNick; state.pw = 'hub';
    applyRows(); save(); renderAll();
  } catch (e) {
    hubMsg(e.message || '입장하지 못했어요. 잠시 후 다시 시도해 주세요.', true);
  }
}
function rememberPw() {} // 예전 비밀번호 기억 기능 (이제 필요 없음)
$('hubRetry').addEventListener('click', () => autoEnter(true));

// ===== 운영진 수정 모드 (허브 이벤트 탭의 ‘설정’ 버튼이 켜고 끈다) =====
let editMode = false;
function setEdit(on) {
  editMode = !!on;
  document.body.classList.toggle('editing', editMode);
  $('editBanner').hidden = !editMode;
  if (!editMode) closeEdit();
}
function openEdit(i) {
  cur = i;
  const m = MISSIONS[i];
  $('eIcon').textContent = m.e; $('eNum').textContent = `MISSION ${i + 1}`;
  $('eEmoji').value = m.e; $('eTitle').value = m.t; $('eDesc').value = m.d;
  $('dim').classList.add('on'); $('eSheet').classList.add('on');
}
function closeEdit() { $('dim').classList.remove('on'); $('eSheet').classList.remove('on'); }
$('eClose').addEventListener('click', closeEdit);
$('eOk').addEventListener('click', async () => {
  const no = cur + 1;
  const t = $('eTitle').value.trim();
  if (!t) { toast('제목을 입력해 주세요'); return; }
  $('eOk').disabled = true;
  try {
    const j = await api({ action: 'adminMission', no, e: $('eEmoji').value.trim(), t, d: $('eDesc').value.trim() });
    takeSnapshot(j); render(); closeEdit();
    toast(`${no}번 미션을 저장했어요`);
  } catch (e) {
    toast(e.message || '저장하지 못했어요', 5000);
  } finally {
    $('eOk').disabled = false;
  }
});
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || e.data.type !== 'bingo-edit') return;
  setEdit(e.data.on);
});
if (inHub) parent.postMessage({ type: 'bingo-ready' }, location.origin); // 허브가 현재 수정 모드 상태를 다시 알려 주게

// 이벤트 기간: 위쪽 제목 아래에 담백하게(2026.11.01 ~ 2026.11.30) 한 번만 보여 준다
function showPeriod() {
  // 이벤트 기간 : 2026.11.01 - 30  (같은 달이면 끝 날짜는 일만, 달이 다르면 월.일, 해가 다르면 연.월.일)
  const a = START.split('-'), z = END.split('-');
  const end = a[0] === z[0] && a[1] === z[1] ? z[2] : a[0] === z[0] ? `${z[1]}.${z[2]}` : `${z[0]}.${z[1]}.${z[2]}`;
  $('heroPeriod').textContent = `이벤트 기간 : ${a[0]}.${a[1]}.${a[2]} - ${end}`;
}
