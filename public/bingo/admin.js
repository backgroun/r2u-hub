// ===== 운영진 모드: 멤버 추가/삭제 · 미션 고치기 · 안내문/기간 고치기 =====
// 운영진 비밀 문장은 이 화면이 열려 있는 동안 메모리에만 있고, 어디에도 저장하지 않아요.
(() => {
  let secret = '';
  let view = null; // 서버가 준 최신 멤버/미션/안내
  const el = id => document.getElementById(id);

  function open() { el('admin').hidden = false; document.body.classList.add('noscroll'); show(false); el('adminPw').value = ''; el('adminPw').focus(); }
  function close() { secret = ''; view = null; el('adminPw').value = ''; el('admin').hidden = true; document.body.classList.remove('noscroll'); }
  function show(logged) { el('adminLogin').hidden = logged; el('adminBody').hidden = !logged; }

  // 서버 호출. 비밀 문장이 틀리면 로그인 화면으로 돌아가요.
  async function call(payload) {
    try {
      const j = await api({ ...payload, secret });
      view = j; draw(); mirror();
      return j;
    } catch (e) {
      if (e.message === 'unauthorized') { secret = ''; show(false); toast('운영진 비밀 문장이 맞지 않아요'); }
      else toast((e.message || '저장하지 못했어요') + (e.detail ? ` (${e.detail})` : ''), 5000);
      return null;
    }
  }
  // 고친 내용을 첫 화면에도 바로 반영
  function mirror() {
    applyMissions(view.missions); applyInfo(view.info);
    render();
    syncAll(true);
  }

  function btn(label, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn mini ' + cls; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function drawMembers() {
    const ul = el('memberList'); ul.textContent = '';
    for (const m of view.members) {
      const li = document.createElement('li'); if (!m.active) li.className = 'off';
      const top = document.createElement('div'); top.className = 'mtop';
      const nm = document.createElement('b'); nm.textContent = m.name;
      const sub = document.createElement('small');
      sub.textContent = `기록 ${m.cnt}칸 · ${m.pw ? '비번 설정됨' : '비번 미설정'}${m.active ? '' : ' · 숨김'}`;
      top.append(nm, sub);
      const acts = document.createElement('div'); acts.className = 'macts';
      acts.append(
        btn('이름 변경', 'ghost', async () => {
          const n = window.prompt(`'${m.name}' 님의 새 이름`, m.name);
          if (n && n.trim() && n.trim() !== m.name) { if (await call({ action: 'adminMember', act: 'rename', name: m.name, newName: n.trim() })) toast('이름을 바꿨어요'); }
        }),
        btn('기록 초기화', 'ghost', async () => {
          if (m.cnt === 0) { toast('지울 인증 기록이 없어요'); return; }
          if (confirm(`'${m.name}' 님의 인증 기록 ${m.cnt}칸을 모두 지울까요?\n사진 연결도 함께 지워지고 되돌릴 수 없어요.\n(명단과 비밀번호는 그대로 남아요)`)) {
            if (await call({ action: 'adminMember', act: 'reset_data', name: m.name })) toast(`${m.name} 님의 기록을 초기화했어요`);
          }
        }),
        btn('비번 초기화', 'ghost', async () => {
          if (confirm(`'${m.name}' 님의 비밀번호를 초기화할까요?\n다음 입장 때 새로 정하게 돼요.`)) { if (await call({ action: 'adminMember', act: 'reset_pw', name: m.name })) toast('초기화했어요'); }
        }),
        btn(m.active ? '숨기기' : '다시 보이기', 'ghost', async () => {
          if (await call({ action: 'adminMember', act: m.active ? 'hide' : 'show', name: m.name })) toast(m.active ? '명단에서 숨겼어요 (기록은 보존)' : '명단에 다시 보여요');
        }),
        btn('삭제', 'danger', async () => {
          if (confirm(`'${m.name}' 님을 완전히 삭제할까요?\n이 사람의 인증 기록(${m.cnt}칸)도 함께 사라지고 되돌릴 수 없어요.\n(기록은 두고 명단에서만 빼려면 '숨기기'를 쓰세요)`)) {
            if (await call({ action: 'adminMember', act: 'delete', name: m.name })) toast('삭제했어요');
          }
        }));
      li.append(top, acts); ul.appendChild(li);
    }
  }

  function drawMissions() {
    const ul = el('missionList'); ul.textContent = '';
    for (const m of view.missions) {
      const li = document.createElement('li'); li.className = 'mrow';
      const no = document.createElement('span'); no.className = 'mno'; no.textContent = m.no;
      const e = document.createElement('input'); e.className = 'me'; e.value = m.e; e.maxLength = 8; e.setAttribute('aria-label', m.no + '번 이모지');
      const t = document.createElement('input'); t.className = 'mt'; t.value = m.t; t.maxLength = 30; t.setAttribute('aria-label', m.no + '번 미션 이름');
      const d = document.createElement('input'); d.className = 'md'; d.value = m.d; d.maxLength = 100; d.placeholder = '설명'; d.setAttribute('aria-label', m.no + '번 설명');
      const s = btn('저장', 'main', async () => {
        if (await call({ action: 'adminMission', no: m.no, e: e.value, t: t.value, d: d.value })) toast(`${m.no}번 미션을 저장했어요`);
      });
      li.append(no, e, t, d, s); ul.appendChild(li);
    }
  }

  function drawInfo() {
    const i = view.info;
    el('infoStart').value = i.start; el('infoEnd').value = i.end;
    el('infoTitleIn').value = i.title;
    const rows = el('infoRows'); rows.textContent = '';
    for (let k = 0; k < Math.max(MIN_ROWS, i.items.length); k++) addRow(i.items[k] || '');
  }
  // 안내 문구: 한 줄에 입력칸 하나 (기본 6줄, [줄 추가]로 최대 12줄까지)
  const MIN_ROWS = 6, MAX_ROWS = 12;
  function addRow(text) {
    const rows = el('infoRows');
    if (rows.children.length >= MAX_ROWS) { toast(`안내 문구는 최대 ${MAX_ROWS}줄까지 넣을 수 있어요`); return; }
    const row = document.createElement('div'); row.className = 'irow';
    const n = document.createElement('span'); n.className = 'in';
    const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 200; inp.value = text || ''; inp.placeholder = '안내 문구 (비워두면 표시 안 돼요)';
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn mini ghost'; del.textContent = '삭제'; del.setAttribute('aria-label', '이 줄 지우기');
    del.addEventListener('click', () => { row.remove(); renumber(); infoDirty = true; });
    row.append(n, inp, del); rows.appendChild(row); renumber();
  }
  function renumber() { [...el('infoRows').children].forEach((r, k) => { r.firstChild.textContent = k + 1; }); }

  let infoDirty = false;
  function draw() {
    show(true);
    drawMembers(); drawMissions();
    if (!infoDirty) drawInfo();
  }

  el('adminOpen').addEventListener('click', open);
  el('adminClose').addEventListener('click', close);
  async function go() {
    const v = el('adminPw').value.trim();
    if (!v) { toast('비밀 문장을 입력해 주세요'); return; }
    secret = v; el('adminGo').disabled = true;
    const j = await call({ action: 'adminLogin' });
    el('adminGo').disabled = false;
    if (j) { el('adminPw').value = ''; infoDirty = false; drawInfo(); }
  }
  el('adminGo').addEventListener('click', go);
  // R2U 허브 운영진 페이지에서 들어오면(?staff=1) 허브에 저장된 비밀 문장으로 자동 입장
  if (/[?&]staff=1\b/.test(location.search)) {
    fetch('/api/bingo/secret', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
      if (!j || !j.secret) return;
      open(); el('adminPw').value = j.secret; go();
      history.replaceState(null, '', location.pathname);
    }).catch(() => {});
  }
  el('adminPw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  el('addMember').addEventListener('click', async () => {
    const n = el('newMember').value.trim();
    if (!n) { toast('이름을 입력해 주세요'); return; }
    if (await call({ action: 'adminMember', act: 'add', name: n })) { el('newMember').value = ''; toast(`'${n}' 님을 추가했어요`); }
  });
  el('newMember').addEventListener('keydown', e => { if (e.key === 'Enter') el('addMember').click(); });
  for (const id of ['infoStart', 'infoEnd', 'infoTitleIn', 'infoRows']) el(id).addEventListener('input', () => { infoDirty = true; });
  el('infoAddRow').addEventListener('click', () => { addRow(''); infoDirty = true; const ins = el('infoRows').querySelectorAll('input'); ins[ins.length - 1].focus(); });
  el('infoSave').addEventListener('click', async () => {
    const items = [...el('infoRows').querySelectorAll('input')].map(x => x.value.trim()).filter(Boolean);
    infoDirty = false;
    const j = await call({ action: 'adminInfo', title: el('infoTitleIn').value, items, start: el('infoStart').value, end: el('infoEnd').value });
    if (j) { drawInfo(); toast('안내·기간을 저장했어요'); } else infoDirty = true;
  });
  document.querySelectorAll('#admin .tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('#admin .tab').forEach(x => x.classList.toggle('on', x === t));
    for (const k of ['members', 'missions', 'info']) el('tab-' + k).hidden = k !== t.dataset.tab;
  }));
})();
