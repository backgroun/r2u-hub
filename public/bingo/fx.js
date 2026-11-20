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

  // 축포: 화면 위에 색종이를 흩뿌려요 (big=true 면 25칸 완성용으로 더 크게)
  window.fxConfetti = function (big) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    const dpr = window.devicePixelRatio || 1;
    const W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
    document.body.appendChild(cv);
    const g = cv.getContext('2d');
    const colors = ['#ff5a5f', '#ffb400', '#2ec4b6', '#4cc9f0', '#b388ff', '#7bd88f', '#ff8fab'];
    const n = big ? 220 : 110, ps = [];
    const bursts = big ? [0.2, 0.5, 0.8] : [0.5];
    for (let i = 0; i < n; i++) {
      const bx = bursts[i % bursts.length] * W, by = H * 0.55;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = (6 + Math.random() * 9) * dpr;
      ps.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: (5 + Math.random() * 6) * dpr,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length] });
    }
    const t0 = performance.now(), dur = big ? 3600 : 2400;
    (function frame(now) {
      const el = now - t0;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = Math.max(0, Math.min(1, (dur - el) / 600));
      ps.forEach(p => {
        p.vy += 0.28 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
      });
      if (el < dur) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  };

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
