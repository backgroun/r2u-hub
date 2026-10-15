"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { catchRunner, gearLink, runnerNext, trackCoupangClick } from "@/app/actions";
import { showToast } from "@/components/toaster";
import { GEARS, GearArt } from "@/components/gear-art";
import { RUNNER_RULES, rollPoints } from "@/lib/runner-rules";
import Confetti from "@/components/confetti";
import SuggestForm from "@/components/suggest-form";
import { bounceSound, catchSound, missSound, unlockAudio } from "@/lib/gear-sfx";

/* 스팟게임(깜짝 러닝 용품): 아주 가끔 러닝 용품(신발·시계·모자…)이 위·양옆·아래 어디선가 나타나 화면을 튕기다 사라진다.
   용품마다 튕기는 방식이 달라서(느렸다 빨랐다, 둥둥, 갑자기 돌진, 방향 바꾸기…) 쉽게 잡히지 않는다.
   누르면 바로 잡혀서 사라지고 종이 축포가 터지며(팡파르), 잡으면 하루 한 번 1~3P(랜덤)와 그 용품이 러닝에 어떻게 도움 되는지 알려 준다.
   한 사람에게는 이미 잡은 용품이 되도록 다시 나오지 않는다(서버가 못 잡은 용품 중에서 고른다).
   계정당 하루 한 번만 나온다(서버가 기록하므로 못 잡아도 그날은 다시 안 나온다). 그날 한 번 잡으면 다시 나오지 않고, 같은 계정은 일주일(월~일)에 3번까지만 나온다.
   앱을 열면 매일 한 번 나온다. (로컬 반복 테스트는 아래 TEST를 true로)
   주소에 ?runner=1을 붙이면 잡은 날에도 나온다. */
const { chance: CHANCE, need: NEED, life: LIFE } = RUNNER_RULES;
const SIZE = 56; // 버튼 한 변(px)
const TEST = false; // true로 바꾸면 로컬(개발)에서 제한·확률 없이 매번 나오고 포인트는 서버에 반영하지 않는다 (테스트용). 평소에는 ?runner=1 로 잠깐 볼 수 있다.
const HIDE_ON = ["/login", "/join", "/admin"]; // 로그인·가입 화면과 운영진 페이지에서는 나오지 않는다
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 괜찮다 */ } },
};

type Item = { id: number; g: number };
type Reward = { g: number; pending?: boolean; points?: number; msg?: string; test?: boolean; preview?: boolean; link?: string | null };

export default function RunnerBuddy() {
  const path = usePathname();
  const [item, setItem] = useState<Item | null>(null);
  const [hits, setHits] = useState(0);
  const [caught, setCaught] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [fw, setFw] = useState(0); // 종이 축포: 0이면 없음, 값이 바뀔 때마다 새로 터진다
  const [tick, setTick] = useState(0); // 로컬: 하나가 끝나면 다음 용품을 부른다
  const btn = useRef<HTMLButtonElement>(null);
  const face = useRef<HTMLSpanElement>(null);
  const testRun = useRef(false); // 운영자 테스트 버튼으로 띄운 용품인지 (포인트를 서버에 반영하지 않는다)
  const [suggestOpen, setSuggestOpen] = useState(false); // 카드의 제품 추천 폼이 열려 있는지(열려 있는 동안은 카드가 저절로 닫히지 않는다)
  const shownAt = useRef(0); // 카드가 뜬 시각: 누른 손가락의 클릭이 카드를 바로 닫지 않게
  const phys = useRef({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, stop: false });

  // 소리는 화면을 한 번 만진 뒤에야 날 수 있어서, 첫 터치 때 미리 깨워 둔다
  useEffect(() => {
    const on = () => unlockAudio();
    document.addEventListener("pointerdown", on, { passive: true });
    document.addEventListener("keydown", on);
    return () => { document.removeEventListener("pointerdown", on); document.removeEventListener("keydown", on); };
  }, []);

  // 운영자 테스트 버튼: 확률·제한·화면(운영진 페이지 포함)과 상관없이 용품을 바로 하나 띄운다
  useEffect(() => {
    const on = (e: Event) => {
      const g = (e as CustomEvent<{ g?: number }>).detail?.g;
      testRun.current = true;
      setCaught(false); setHits(0); setReward(null);
      setItem({ id: Date.now(), g: typeof g === "number" && g >= 0 && g < GEARS.length ? g : Math.floor(Math.random() * GEARS.length) });
    };
    window.addEventListener("r2u:spot-test", on);
    return () => window.removeEventListener("r2u:spot-test", on);
  }, []);

  // 운영진 화면에서 용품을 누르면: 잡지 않고 그 용품의 설명 카드만 바로 띄운다 (포인트·클릭 집계 없음)
  useEffect(() => {
    const on = (e: Event) => {
      const g = (e as CustomEvent<{ g?: number }>).detail?.g;
      if (typeof g !== "number" || g < 0 || g >= GEARS.length) return;
      setItem(null); setFw(0); setSuggestOpen(false);
      shownAt.current = Date.now();
      setReward({ g, test: true, preview: true });
      void gearLink(g).then((link) => setReward((r) => (r && r.g === g ? { ...r, link } : r))).catch(() => {});
    };
    window.addEventListener("r2u:spot-card", on);
    return () => window.removeEventListener("r2u:spot-card", on);
  }, []);

  // 언제 나올지 정한다
  useEffect(() => {
    if (HIDE_ON.some((p) => path.startsWith(p)) && !path.includes("runner-preview")) return;
    const force = new URLSearchParams(window.location.search).has("runner");
    if (!force && !TEST && (store.get("spotDay") === today() || Math.random() > CHANCE)) return; // 오늘 이 기기에서 이미 정해졌으면 서버에 다시 묻지 않는다
    let off = false;
    // 화면을 연 뒤 조금 있다가 나온다. 한 계정이 주 3번 잡았으면 서버가 막는다.
    const t = setTimeout(async () => {
      let pick: number | null = null;
      if (!TEST) {
        pick = await runnerNext().catch(() => null);
        if (pick === -1) { store.set("spotDay", today()); pick = null; if (!force) return; } // 오늘은 이미 나왔다
        else if (pick != null) store.set("spotDay", today()); // 오늘 나오기로 했다
        else if (!force) return; // 로그인 전 등
      } // 서버가 보여 줄지·어떤 용품인지 정한다 (이미 잡은 용품은 되도록 피한다)
      if (off) return;
      // 로컬: 새로고침·화면 이동에도 이어지게 순번을 브라우저에 저장해 용품을 차례대로
      const next = (Number(store.get("runnerSeq")) || 0) % GEARS.length;
      if (TEST) store.set("runnerSeq", String(next + 1));
      testRun.current = false; // 정상 등장은 테스트가 아니다
      setCaught(false); setHits(0);
      setItem({ id: Date.now(), g: TEST ? next : (pick ?? Math.floor(Math.random() * GEARS.length)) });
    }, TEST ? 1200 : 3000 + Math.random() * 6000);
    return () => { off = true; clearTimeout(t); };
  }, [path, tick]);

  // 튕기는 움직임: 위에서 떨어져 바닥·벽에서 반동하며 돈다. 용품마다 중력·속도·밀당 방식이 다르다.
  useEffect(() => {
    if (!item) return;
    const m = GEARS[item.g].move;
    const W = window.innerWidth, H = window.innerHeight;
    const floor = H - 110 - SIZE; // 아래 탭바 위
    const p = phys.current;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const vx0 = m.vx[0] + Math.random() * (m.vx[1] - m.vx[0]);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    // 등장 방향: 위에서 떨어지기 · 왼쪽/오른쪽에서 날아 들어오기 · 아래에서 솟구치기
    const mode = (["top", "left", "right", "bottom"] as const)[Math.floor(Math.random() * 4)];
    const start = {
      top: { x: SIZE + Math.random() * Math.max(10, W - SIZE * 3), y: -SIZE - 10, vx: dir * vx0, vy: 60 },
      left: { x: -SIZE - 8, y: rnd(H * 0.08, H * 0.5), vx: Math.max(240, vx0 * 1.5), vy: rnd(-420, 60) },
      right: { x: W + 8, y: rnd(H * 0.08, H * 0.5), vx: -Math.max(240, vx0 * 1.5), vy: rnd(-420, 60) },
      bottom: { x: rnd(SIZE, Math.max(SIZE + 10, W - SIZE * 2)), y: H + 10, vx: dir * rnd(60, 170), vy: -Math.sqrt(2 * m.g * rnd(0.4, 0.7) * H) }, // 솟구쳐 올랐다가 떨어진다
    }[mode];
    Object.assign(p, { ...start, rot: 0, vr: dir * (160 + vx0 * 0.9), stop: false });
    const slowAt = 1100 + Math.random() * 1400, slowLen = 1500; // 한 번쯤 느려지는 순간(잡기 쉽게)
    let slowOn = false;
    const born = performance.now();
    let last = born, raf = 0, nextBurst = (m.burst ?? 0) * 1000, nextFlip = (m.flip ?? 0) * 1000;
    const snd = GEARS[item.g].snd;
    const end = () => { missSound(); setItem(null); if (TEST) setTimeout(() => setTick((t) => t + 1), 700); }; // 못 잡고 사라질 때 아쉬운 소리
    const frame = (now: number) => {
      const real = Math.min(0.034, (now - last) / 1000); last = now;
      const t = now - born;
      if (!p.stop) {
        // 시간 배율: 느렸다 빨랐다 (밀당)
        const s = m.amp ? Math.max(0.28, 1 + m.amp * Math.sin((2 * Math.PI * t) / 1000 / (m.period ?? 2) + (m.phase ?? 0))) : 1;
        let k = 1; // 느려지는 구간: 부드럽게 느려졌다가 다시 빨라진다
        const inSlow = t > slowAt && t < slowAt + slowLen;
        if (inSlow) k = 1 - 0.75 * Math.sin((Math.PI * (t - slowAt)) / slowLen);
        if (inSlow !== slowOn) { slowOn = inSlow; face.current?.classList.toggle("bi-slow", inSlow); } // 느려지는 동안 살짝 빛나서 눌러야 할 때를 알려 준다
        const dt = real * s * k;
        const leaving = t > LIFE * 1000;
        if (m.burst && t > nextBurst) { nextBurst = t + m.burst * 1000; p.vx = Math.sign(p.vx || 1) * Math.min(560, Math.abs(p.vx) * 1.9); p.vy -= 380; } // 갑자기 돌진
        if (m.flip && t > nextFlip) { nextFlip = t + m.flip * 1000; p.vx = -p.vx; p.vr = -p.vr; } // 방향 바꾸기
        p.vy += m.g * dt;
        p.y += p.vy * dt; p.x += p.vx * dt; p.rot += p.vr * dt;
        if (m.sway) p.x += Math.sin(t / 1000 * 4.4) * m.sway * dt;
        if (!leaving && p.y > floor && p.vy > 0) { // 바닥: 통통 (너무 낮게 튀면 다시 힘을 준다)
          bounceSound(snd, Math.abs(p.vy) / 1600); // 바닥에 부딪히는 소리 (세게 떨어질수록 크게)
          p.y = floor; p.vy = -Math.max(Math.abs(p.vy) * m.e, m.minB);
          p.vr *= 0.92;
        }
        if (p.x < 0 && p.vx < 0) { p.x = 0; bounceSound(snd, Math.abs(p.vx) / 900); p.vx = Math.abs(p.vx) * 0.95; }
        if (p.x > W - SIZE && p.vx > 0) { p.x = W - SIZE; bounceSound(snd, Math.abs(p.vx) / 900); p.vx = -Math.abs(p.vx) * 0.95; }
        if (leaving && p.y > H + SIZE) { end(); return; }
        if (btn.current) btn.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        if (face.current) face.current.style.transform = `rotate(${p.rot}deg)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [item]);

  // 보상 카드는 몇 초 뒤 저절로 닫힌다
  useEffect(() => {
    if (!reward || suggestOpen) return;
    const t = setTimeout(() => closeReward(), 12000);
    return () => clearTimeout(t);
  });

  function closeReward(byTap = false) {
    if (byTap && Date.now() - shownAt.current < 900) return; // 방금 뜬 카드는 탭으로 닫히지 않는다
    setReward(null); setSuggestOpen(false);
    if (TEST) setTimeout(() => setTick((t) => t + 1), 500);
  }

  async function hit() {
    if (!item || caught) return;
    try { navigator.vibrate?.(hits + 1 < NEED ? 12 : [18, 40, 18]); } catch { /* 진동 미지원 */ }
    const p = phys.current;
    if (hits + 1 < NEED) { // 아직 못 잡았다: 세게 튕겨 날아간다
      setHits(hits + 1);
      p.vy = -(900 + Math.random() * 300);
      p.vx = (Math.random() < 0.5 ? -1 : 1) * (260 + Math.random() * 200);
      p.vr = p.vx * 2.2;
      return;
    }
    const g = item.g;
    setCaught(true); p.stop = true;
    shownAt.current = Date.now();
    setFw(Date.now()); catchSound(); // 종이 축포 + 팡파르
    setItem(null); // 누르면 바로 사라진다
    if (TEST || testRun.current) { // 테스트(로컬 테스트 모드 · 운영자 테스트 버튼): 서버에 요청하지 않고 포인트 화면만 임시로 보여 준다 (실제로는 쌓이지 않는다)
      setReward({ g, points: rollPoints(), test: true });
      void gearLink(g).then((link) => setReward((r) => (r && r.g === g ? { ...r, link } : r))).catch(() => {});
      return;
    }
    store.set("runnerCaught", today());
    setReward({ g, pending: true }); // 서버 응답을 기다리지 않고 바로 카드를 띄운다 (포인트는 도착하면 채운다)
    void gearLink(g).then((link) => setReward((r) => (r && r.g === g ? { ...r, link } : r))).catch(() => {}); // 쿠팡 링크는 따로 받아 카드에 붙인다
    const r = await catchRunner(g).catch(() => null);
    if (r && r.ok === false && r.msg) showToast(r.msg, "err");
    setReward((prev) => ({ ...prev, g, points: r?.points, msg: r?.points != null ? undefined : r?.msg ?? "포인트를 확인하지 못했어요.", pending: false }));
  }

  return (
    <>
      {item && (
        <button
          key={item.id}
          ref={btn}
          type="button"
          className={`bounce-item ${caught ? "is-caught" : ""}`}
          style={{ transform: "translate3d(0, -200px, 0)" }}
          aria-label={`스팟게임: ${GEARS[item.g].name} 잡기`}
          onPointerDown={(e) => { e.preventDefault(); void hit(); }}
        >
          <span ref={face} className="bi-face" aria-hidden><GearArt i={item.g} size={SIZE - 8} /></span>
          {hits > 0 && !caught && <span key={hits} className="bi-hit" aria-hidden>{NEED - hits}</span>}
        </button>
      )}
      {fw > 0 && <Confetti key={fw} onDone={() => setFw(0)} />}
      {reward && (
        <div className="bi-reward" role="status" onClick={() => closeReward(true)}>
          <div className="bi-reward-card">
            <div className="bi-reward-art"><GearArt i={reward.g} size={60} /></div>
            <div className="bi-reward-body">
              {reward.preview ? <p className="bi-reward-p bi-reward-none">카드 미리보기<small className="bi-reward-test">포인트 없음</small></p> : reward.pending ? <p className="bi-reward-p bi-reward-none">잡았어요! 포인트 확인 중…</p> : reward.points ? <p className="bi-reward-p">+{reward.points}P 획득!{reward.test && <small className="bi-reward-test">테스트 · 반영 안 됨</small>}</p> : reward.points === 0 ? <p className="bi-reward-p bi-reward-none">꽝! 이번엔 포인트가 없어요 😢{reward.test && <small className="bi-reward-test">테스트</small>}</p> : <p className="bi-reward-p bi-reward-none">{reward.msg}</p>}
              <p className="bi-reward-name">{GEARS[reward.g].name}</p>
              <p className="bi-reward-tip">{GEARS[reward.g].tip}</p>
              <p className="bi-reward-pitch">{GEARS[reward.g].pitch}</p>
              {GEARS[reward.g].shop !== false && <div className="bi-reward-shop" onClick={(e) => e.stopPropagation()}>
                {reward.link && <a href={reward.link} target="_blank" rel="sponsored noopener noreferrer" onClick={() => { if (!reward.test) void trackCoupangClick(reward.g).catch(() => {}); setTimeout(() => closeReward(), 150); }}>쿠팡에서 보기</a>}
                <button type="button" className="bi-reward-sug" onClick={() => setSuggestOpen((v) => !v)} aria-expanded={suggestOpen}>제품 추천하기</button>
              </div>}
            </div>
            {suggestOpen && GEARS[reward.g].shop !== false && <SuggestForm g={reward.g} test={reward.test} onDone={() => closeReward()} />}
            {reward.link && GEARS[reward.g].shop !== false && <p className="bi-reward-note">쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받음</p>}
            <button type="button" className="bi-reward-x" aria-label="닫기">✕</button>
          </div>
        </div>
      )}
    </>
  );
}
