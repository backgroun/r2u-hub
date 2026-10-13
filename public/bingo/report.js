// ===== 내 리포트: 내 인증 기록을 날짜순으로, 올린 사진과 함께 보여줘요 =====
(() => {
  const el = id => document.getElementById(id);
  const photoUrl = p => `${SUPABASE_URL}/storage/v1/object/public/proofs/${p.split('/').map(encodeURIComponent).join('/')}`;

  function close() { el('report').hidden = true; document.body.classList.remove('noscroll'); }
  async function open() {
    if (!loggedIn()) return;
    el('report').hidden = false; document.body.classList.add('noscroll');
    el('reportTitle').textContent = `${state.name} 님의 리포트`;
    el('reportSum').textContent = '';
    el('reportList').textContent = '불러오는 중…';
    el('reportShots').hidden = true; el('reportShots').textContent = '';
    try {
      const j = await api({ action: 'report', name: state.name, pw: state.pw });
      records = j.records; draw(j.records); updateSave();
    } catch (e) {
      if (e.auth) { close(); logout(e.message); return; }
      el('reportList').textContent = (e.message || '리포트를 불러오지 못했어요') + (e.detail ? ` (${e.detail})` : '');
    }
  }

  function updateSave() {
    const ok = canSave() && records.length > 0;
    el('reportImg').disabled = !ok;
    el('reportImgHint').textContent = !canSave() ? `이벤트가 끝나면(${fmtLong(END)} 이후) 이미지로 저장할 수 있어요.`
      : !records.length ? '저장할 기록이 없어요.' : `사진 ${PER_PAGE}칸씩 여러 장의 이미지로 만들어요.`;
  }

  function draw(records) {
    const box = el('reportList'); box.textContent = '';
    const withPhoto = records.filter(r => r.photo).length;
    el('reportSum').textContent = `인증 ${records.length}칸 · 빙고 ${doneLines().length}줄 · 사진 ${withPhoto}장`;
    if (!records.length) {
      const d = document.createElement('div'); d.className = 'empty'; d.textContent = '아직 인증한 기록이 없어요. 첫 미션에 도전해 보세요!'; box.appendChild(d);
      return;
    }
    let last = '';
    for (const r of records) {
      if (r.d !== last) {
        last = r.d;
        const h = document.createElement('div'); h.className = 'day'; h.textContent = fmtLong(r.d); box.appendChild(h);
      }
      const m = MISSIONS[r.no - 1] || { e: '', t: `${r.no}번 미션` };
      const it = document.createElement('div'); it.className = 'item';
      const head = document.createElement('div'); head.className = 'h';
      const t = document.createElement('span'); t.textContent = `${m.e} ${m.t}`;
      const n = document.createElement('small'); n.textContent = `${r.no}번`;
      head.append(t, n); it.appendChild(head);
      if (r.photo) {
        const im = document.createElement('img'); im.loading = 'lazy'; im.alt = `${m.t} 인증 사진`; im.src = photoUrl(r.photo); it.appendChild(im);
      } else {
        const p = document.createElement('div'); p.className = 'none'; p.textContent = '사진 없음'; it.appendChild(p);
      }
      box.appendChild(it);
    }
    const f = document.createElement('div'); f.className = 'foot'; f.textContent = '이 화면은 본인만 볼 수 있어요. (사진은 주소를 아는 사람은 볼 수 있어요)'; box.appendChild(f);
  }

  // ---------- 이벤트가 끝난 뒤: 리포트를 이미지(PNG)로 저장 ----------
  const pad2 = n => String(n).padStart(2, '0');
  const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`; };
  // Saving is allowed after the event end date (add ?saveimg to the URL to try it early)
  const canSave = () => todayStr() > END || /[?&]saveimg\b/.test(location.search);
  let records = [];
  const FONT = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
  const PER_PAGE = 12; // 이미지 한 장에 12칸 (폰이 너무 큰 그림을 못 만드는 문제 방지)

  function loadImg(url) {
    return new Promise(ok => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => ok(im); im.onerror = () => ok(null);
      im.src = url;
    });
  }
  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }
  async function loadAll(list) {
    const out = new Array(list.length); let i = 0;
    await Promise.all([0, 1, 2, 3].map(async () => {
      while (i < list.length) { const k = i++; out[k] = list[k].photo ? await loadImg(photoUrl(list[k].photo)) : null; }
    }));
    return out;
  }
  function drawPage(items, imgs, pageNo, pages) {
    const W = 1080, P = 48, GAP = 20, COLS = 3, CW = (W - P * 2 - GAP * (COLS - 1)) / COLS, TITLE = 52, PH = CW;
    const rows = Math.ceil(items.length / COLS);
    const head = pageNo === 1 ? 250 : 130;
    const H = head + rows * (TITLE + PH + GAP) + 90;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#f4f7f3'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2f6b3a'; g.fillRect(0, 0, W, pageNo === 1 ? 190 : 100);
    g.fillStyle = '#fff'; g.textBaseline = 'middle';
    if (pageNo === 1) {
      g.font = `bold 34px ${FONT}`; g.fillText('R2U 5×5 미션 빙고', P, 56);
      g.font = `bold 60px ${FONT}`; g.fillText(`${state.name} 님의 리포트`, P, 120);
      g.font = `28px ${FONT}`; g.fillStyle = '#2f6b3a';
      g.fillText(`${fmtLong(START)} ~ ${fmtLong(END)}`, P, 218);
      g.fillStyle = '#5b6b5e';
      const sum = `인증 ${records.length}칸 · 빙고 ${doneLines().length}줄 · 사진 ${records.filter(r => r.photo).length}장`;
      g.textAlign = 'right'; g.fillText(sum, W - P, 218); g.textAlign = 'left';
    } else {
      g.font = `bold 38px ${FONT}`; g.fillText(`${state.name} 님의 리포트`, P, 50);
    }
    if (pages > 1) { g.font = `26px ${FONT}`; g.fillStyle = '#e7f3e9'; g.textAlign = 'right'; g.fillText(`${pageNo} / ${pages}`, W - P, pageNo === 1 ? 56 : 50); g.textAlign = 'left'; }
    items.forEach((r, i) => {
      const x = P + (i % COLS) * (CW + GAP), y = head + Math.floor(i / COLS) * (TITLE + PH + GAP);
      const m = MISSIONS[r.no - 1] || { e: '', t: `${r.no}번 미션` };
      g.fillStyle = '#fff'; g.fillRect(x, y, CW, TITLE + PH);
      g.fillStyle = '#7a8a7d'; g.font = `19px ${FONT}`; g.fillText(r.d.slice(5).replace('-', '/'), x + 10, y + TITLE / 2);
      g.fillStyle = '#1d2b20'; g.font = `bold 21px ${FONT}`;
      g.fillText(fit(g, `${m.e} ${m.t}`, CW - 84), x + 74, y + TITLE / 2);
      g.fillStyle = '#eef2ec'; g.fillRect(x, y + TITLE, CW, PH);
      const im = imgs[i];
      if (im) {
        const s = Math.min(CW / im.width, PH / im.height), w = im.width * s, h = im.height * s;
        g.drawImage(im, x + (CW - w) / 2, y + TITLE + (PH - h) / 2, w, h);
      } else {
        g.fillStyle = '#9aa79d'; g.font = `22px ${FONT}`; g.textAlign = 'center'; g.fillText('사진 없음', x + CW / 2, y + TITLE + PH / 2); g.textAlign = 'left';
      }
    });
    g.fillStyle = '#9aa79d'; g.font = `22px ${FONT}`; g.textAlign = 'center';
    g.fillText('R2U 러닝크루 · 5×5 미션 빙고', W / 2, H - 40);
    return new Promise(ok => cv.toBlob(ok, 'image/png'));
  }

  async function makeImages() {
    const btn = el('reportImg'); btn.disabled = true; btn.textContent = '이미지를 만드는 중…';
    try {
      const imgs = await loadAll(records);
      const pages = Math.max(1, Math.ceil(records.length / PER_PAGE)), blobs = [];
      for (let p = 0; p < pages; p++) {
        blobs.push(await drawPage(records.slice(p * PER_PAGE, (p + 1) * PER_PAGE), imgs.slice(p * PER_PAGE, (p + 1) * PER_PAGE), p + 1, pages));
      }
      showShots(blobs);
    } catch (e) {
      toast('이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally { btn.disabled = false; btn.textContent = '🖼 이미지로 저장'; }
  }

  function showShots(blobs) {
    const box = el('reportShots'); box.textContent = ''; box.hidden = false;
    const p = document.createElement('p');
    p.textContent = '아래 이미지를 저장하세요. 저장이 안 되면 이미지를 꾹 눌러서 저장/공유하세요.'; box.appendChild(p);
    const files = blobs.map((b, i) => new File([b], `R2U-리포트-${state.name}-${i + 1}.png`, { type: 'image/png' }));
    files.forEach((f, i) => {
      const url = URL.createObjectURL(f);
      const w = document.createElement('div'); w.className = 'shot';
      const im = document.createElement('img'); im.src = url; im.alt = `리포트 ${i + 1}장`;
      const row = document.createElement('div'); row.className = 'row';
      const a = document.createElement('a'); a.className = 'btn ghost mini'; a.href = url; a.download = f.name; a.textContent = `${i + 1}/${files.length}장 저장`;
      row.appendChild(a); w.append(im, row); box.appendChild(w);
    });
    if (navigator.canShare && navigator.canShare({ files })) {
      const s = document.createElement('button'); s.type = 'button'; s.className = 'btn main'; s.textContent = '📤 공유 / 사진첩에 저장';
      s.addEventListener('click', () => navigator.share({ files, title: 'R2U 리포트' }).catch(() => {}));
      box.insertBefore(s, box.children[1]);
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  el('reportImg').addEventListener('click', () => { if (canSave() && records.length) makeImages(); });
  el('reportOpen').addEventListener('click', open);
  el('reportClose').addEventListener('click', close);
})();
