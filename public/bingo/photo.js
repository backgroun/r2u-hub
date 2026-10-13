// ===== 인증 사진 (고르기 → 줄이기 → 미리보기 → 올리기) =====
// 폰 사진은 크기가 크니까 올리기 전에 브라우저에서 JPEG 1MB 이하로 줄여요.
// 줄이는 과정에서 위치·촬영시각 같은 EXIF 정보는 자동으로 사라져요.
const Photo = (() => {
  const MAX_SIDE = 1280;        // 긴 변 최대 픽셀
  const MAX_BYTES = 1000 * 1024; // 서버 제한(1MB)보다 살짝 작게
  let blob = null;
  let url = '';
  const $p = id => document.getElementById(id);

  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => viaImg(file));
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise((ok, no) => {
      const u = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); ok(im); };
      im.onerror = () => { URL.revokeObjectURL(u); no(new Error('사진을 읽지 못했어요')); };
      im.src = u;
    });
  }
  const toBlob = (cv, q) => new Promise(ok => cv.toBlob(ok, 'image/jpeg', q));

  async function shrink(file) {
    const img = await loadImage(file);
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    if (!w0 || !h0) throw new Error('사진을 읽지 못했어요');
    let scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    for (let round = 0; round < 4; round++) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w0 * scale));
      cv.height = Math.max(1, Math.round(h0 * scale));
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); // 투명 PNG 대비
      g.drawImage(img, 0, 0, cv.width, cv.height);
      for (const q of [0.82, 0.7, 0.58, 0.46]) {
        const b = await toBlob(cv, q);
        if (b && b.size <= MAX_BYTES) { if (img.close) img.close(); return b; }
      }
      scale *= 0.75; // 그래도 크면 더 작게
    }
    throw new Error('사진 용량을 줄이지 못했어요. 다른 사진을 골라주세요');
  }

  function show() {
    const has = !!blob;
    $p('sPrev').hidden = !has;
    $p('sPhotoClear').hidden = !has;
    $p('sPhotoBtn').textContent = has ? '📷 다른 사진 고르기' : '📷 사진 고르기';
    if (url) { URL.revokeObjectURL(url); url = ''; }
    if (has) { url = URL.createObjectURL(blob); $p('sPrev').src = url; } else { $p('sPrev').removeAttribute('src'); }
  }
  function reset() { blob = null; $p('sPhotoIn').value = ''; show(); }

  async function onPick(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^image\//i.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
      toast('사진 파일을 골라주세요'); e.target.value = ''; return;
    }
    $p('sPhotoBtn').disabled = true;
    $p('sPhotoBtn').textContent = '사진을 줄이는 중…';
    try { blob = await shrink(f); }
    catch (err) { blob = null; toast(err.message || '사진을 불러오지 못했어요 (HEIC는 JPG로 바꿔 주세요)', 4000); }
    finally { $p('sPhotoBtn').disabled = false; e.target.value = ''; show(); }
  }

  // 서버가 준 일회용 경로(path)에 올려요
  async function upload(path) {
    if (!blob) return;
    const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' };
    if (/^eyJ/.test(SUPABASE_ANON_KEY)) headers.Authorization = 'Bearer ' + SUPABASE_ANON_KEY;
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/storage/v1/object/proofs/${path.split('/').map(encodeURIComponent).join('/')}`,
        { method: 'POST', headers, body: blob });
    } catch (e) {
      const err = new Error('사진을 올리지 못했어요. 연결을 확인해 주세요'); err.code = 'NET'; throw err;
    }
    if (!res.ok) {
      const err = new Error('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요');
      err.code = 'HTTP ' + res.status; throw err;
    }
  }

  function init() {
    $p('sPhotoBtn').addEventListener('click', () => $p('sPhotoIn').click());
    $p('sPhotoIn').addEventListener('change', onPick);
    $p('sPhotoClear').addEventListener('click', reset);
    $p('photoField').hidden = !SYNC; // 테스트 모드(서버 없음)에서는 사진 칸을 숨겨요
  }
  return { init, reset, upload, has: () => !!blob };
})();
