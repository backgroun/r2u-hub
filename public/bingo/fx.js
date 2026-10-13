// ===== 버튼 효과음 / 진동 (음원 파일 없이 브라우저에서 만들어요) =====
(() => {
  const SKEY = 'r2u-sound';
  let on = true;
  try { on = localStorage.getItem(SKEY) !== 'off'; } catch (e) {}
  let ac = null;
  function audio() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ac = new C(); } catch (e) { return null; }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  // 짧은 소리 하나: 높이(freq)에서 slide 높이로 미끄러지며 사라져요
  function tone(freq, start, dur, type, vol, slide) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + start;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const SOUND = {
    click: () => tone(720, 0, 0.07, 'sine', 0.16, 430),
    cell:  () => tone(540, 0, 0.08, 'triangle', 0.16, 330),
    ok:    () => { tone(660, 0, 0.12, 'triangle', 0.18); tone(880, 0.1, 0.18, 'triangle', 0.18); },
    undo:  () => tone(300, 0, 0.12, 'sine', 0.16, 200),
    bingo: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle', 0.2)),
  };
  function play(name, buzz) {
    if (!on) return;
    if (SOUND[name]) SOUND[name]();
    if (buzz && navigator.vibrate) { try { navigator.vibrate(buzz); } catch (e) {} } // 안드로이드 진동
  }

  // 버튼을 누르는 순간 소리
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('button, .cell, a.btn');
    if (!b || b.disabled || b.id === 'fxToggle') return;
    play(b.classList.contains('cell') ? 'cell' : 'click', 8);
  }, true);
  // 아이폰은 '탭'이 끝나야 소리를 켤 수 있어서, 첫 탭에서 미리 준비해요
  document.addEventListener('click', () => { if (on) audio(); }, true);

  // 인증 결과 안내(토스트)에 맞는 소리
  const toastEl = document.getElementById('toast');
  if (toastEl && window.MutationObserver) {
    new MutationObserver(() => {
      const t = toastEl.textContent || '';
      if (t.startsWith('🎉') || t.startsWith('🏆')) play('bingo', [20, 40, 20]);
      else if (t.startsWith('인증완료')) play('ok', 15);
      else if (t.startsWith('인증을 취소')) play('undo', 10);
    }).observe(toastEl, { childList: true, characterData: true, subtree: true });
  }

  // 효과음 켜기/끄기 스위치
  const sw = document.getElementById('fxToggle');
  function paint() { sw.textContent = on ? '🔊' : '🔇'; sw.setAttribute('aria-label', on ? '효과음 끄기' : '효과음 켜기'); sw.title = on ? '효과음 끄기' : '효과음 켜기'; }
  if (sw) {
    paint();
    sw.addEventListener('click', () => {
      on = !on; try { localStorage.setItem(SKEY, on ? 'on' : 'off'); } catch (e) {}
      paint(); if (on) play('click', 8);
    });
  }
})();
