// ===== 크루 전체 현황의 ‘이미지로 보기’: 모두의 인증 사진을 모자이크 타일처럼 나열해요 (눌러도 확대는 안 돼요) =====
(() => {
  const el = id => document.getElementById(id);
  const photoUrl = p => `${SUPABASE_URL}/storage/v1/object/public/proofs/${p.split('/').map(encodeURIComponent).join('/')}`;

  function close() { el('mosaic').hidden = true; document.body.classList.remove('noscroll'); }
  async function open() {
    el('mosaic').hidden = false; document.body.classList.add('noscroll');
    el('mosaicSum').textContent = '불러오는 중…'; el('mosaicGrid').textContent = '';
    try {
      const j = await api({ action: 'photos' });
      draw(j.photos || []);
    } catch (e) {
      el('mosaicSum').textContent = (e.message || '이미지를 불러오지 못했어요') + (e.detail ? ` (${e.detail})` : '');
    }
  }
  function draw(list) {
    el('mosaicSum').textContent = list.length ? `인증 이미지 ${list.length}장` : '아직 올라온 인증 이미지가 없어요.';
    const grid = el('mosaicGrid'); grid.textContent = '';
    for (const r of list) {
      const fig = document.createElement('figure');
      const cap = document.createElement('figcaption'); cap.textContent = r.n; // 누가 올렸는지 사진 위에
      const im = document.createElement('img');
      im.loading = 'lazy'; im.decoding = 'async'; im.alt = `${r.n} 인증 사진`;
      // 작은 사진(.t.jpg)을 먼저 쓰고, 없는 예전 사진은 원본으로 대신해요
      im.onerror = () => { im.onerror = null; im.src = photoUrl(r.photo); };
      im.src = photoUrl(r.photo.replace(/\.jpg$/, '.t.jpg'));
      fig.append(cap, im); grid.appendChild(fig);
    }
  }

  el('mosaicOpen').addEventListener('click', open);
  el('mosaicClose').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el('mosaic').hidden) close(); });
})();
