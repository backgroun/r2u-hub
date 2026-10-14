"use client";
import { useEffect, useId, useRef, useState } from "react";
import { fmtPace } from "@/lib/garmin/aggregate";

/** 가민 분석용 SVG 차트 (라이브러리 없음). 색은 globals.css 변수(--lane 기본색, --bib 강조색)를 따라 다크 모드도 맞는다.
 *  마우스를 올리거나(모바일은 눌러서) 보면 가장 가까운 점·막대의 수치 말풍선이 뜬다 */
const W0 = 600, H = 200, L = 46, R = 16, T = 20, B = 30; // W0: 서버에서 먼저 그릴 때의 기본 폭

/** 그래프 폭을 화면 폭에 맞춘다: 1단위 = 1px 이라 글자가 줄어들지 않는다 (휴대폰에서도 같은 크기) */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(W0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** 서버 컴포넌트에서 함수를 넘길 수 없어서 표시 형식은 이름으로 고른다 */
export type Fmt = "pace" | "int" | "dec2" | "km1";
const FORMATS: Record<Fmt, (n: number) => string> = {
  pace: (n) => fmtPace(n),
  int: (n) => `${Math.round(n)}`,
  dec2: (n) => n.toFixed(2),
  km1: (n) => `${Math.round(n * 10) / 10}`,
};

const gid = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const ts = (s: string) => Date.parse(`${s.length > 10 ? s.replace(" ", "T") : `${s}T00:00:00`}Z`);

/** 제목 옆 (i) 도움말: PC는 마우스를 올리면 뜨고, 모바일은 눌러서 본다.
 *  닫기: 다시 누르기 · 풍선 누르기 · 바깥 누르기 · 스크롤 · Esc */
export function InfoTip({ text }: { text: string }) {
  const id = gid(useId());
  const box = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false); // 마우스를 올린 동안 (터치는 제외)
  const [pin, setPin] = useState(false); // 눌러서 고정
  const open = hover || pin;
  const close = () => { setPin(false); setHover(false); };

  useEffect(() => {
    if (!open) return;
    const out = (e: Event) => { if (!box.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, { passive: true });
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", close); };
  }, [open]);

  return (
    <span ref={box} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}>
      <button type="button" aria-label="설명 보기" aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={() => (open ? close() : setPin(true))}
        style={{ ...noSelect, width: 16, height: 16, borderRadius: 999, padding: 0, display: "inline-grid", placeItems: "center", cursor: "pointer", transition: "background .15s, color .15s",
          border: "1.4px solid var(--ink)", fontFamily: "var(--font-body)", fontStyle: "normal", fontWeight: 700, fontSize: 10, lineHeight: 1,
          background: open ? "var(--ink)" : "transparent", color: open ? "var(--paper)" : "var(--ink)" }}>
        i
      </button>
      {open && (
        <span role="tooltip" id={id} onClick={close}
          style={{ position: "absolute", zIndex: 30, top: "calc(100% + 10px)", left: -8, width: "max-content", maxWidth: "min(280px, calc(100vw - 72px))", padding: "11px 14px", borderRadius: 13, background: "var(--ink)", color: "var(--paper)", fontSize: 13, fontWeight: 500, lineHeight: 1.6, letterSpacing: 0, textTransform: "none", boxShadow: "0 10px 28px rgba(0,0,0,.38)", textAlign: "left", whiteSpace: "normal", cursor: "pointer" }}>
          <span aria-hidden style={{ position: "absolute", top: -4, left: 16, width: 10, height: 10, background: "var(--ink)", transform: "rotate(45deg)", borderRadius: 2 }} />
          {text}
        </span>
      )}
    </span>
  );
}

/** 값이 튀지 않는 부드러운 곡선 (단조 3차 보간) */
function smooth(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return "";
  const dx: number[] = [], m: number[] = [], t: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = dx[i] ? (pts[i + 1].y - pts[i].y) / dx[i] : 0; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i].x + h).toFixed(1)} ${(pts[i].y + t[i] * h).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)} ${(pts[i + 1].y - t[i + 1] * h).toFixed(1)} ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/** 말풍선: 글자 폭을 어림해서 차트 안에 들어오게 자리를 잡는다 */
function Tip({ x, y, text, W }: { x: number; y: number; text: string; W: number }) {
  const w = [...text].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 7.8 : 13.6), 0) + 28, h = 32;
  const bx = Math.min(Math.max(x - w / 2, 2), W - w - 2);
  const by = y - h - 14 < 0 ? y + 16 : y - h - 14;
  return (
    <g pointerEvents="none" style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,.35))" }}>
      <rect x={bx} y={by} width={w} height={h} rx="10" fill="var(--ink)" opacity="0.95" />
      <text x={bx + w / 2} y={by + 21} textAnchor="middle" fontSize="13.5" fontWeight="700" fill="var(--paper)">{text}</text>
    </g>
  );
}

/** 그래프를 누르거나 길게 눌러도 글자가 선택되거나 메뉴·파란 하이라이트가 뜨지 않게 한다 */
const noSelect = { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" } as const;
const svgStyle = { width: "100%", height: "auto", display: "block", touchAction: "pan-y", ...noSelect } as const;

export type LinePoint = { date: string; at: string; y: number; hollow?: boolean; tip: string };

/** invert: 값이 작을수록 위로 (페이스처럼 빠를수록 좋은 값) */
export function LineChart({ points, fmt, invert = false, label }: { points: LinePoint[]; fmt: Fmt; invert?: boolean; label: string }) {
  const id = gid(useId());
  const [boxRef, W] = useWidth();
  const [on, setOn] = useState<number | null>(null);
  const f = FORMATS[fmt];
  if (points.length < 2) return <p className="text-sm text-muted">기록이 2개 이상이면 그래프가 나와요.</p>;

  const ys = points.map((p) => p.y);
  const lo0 = Math.min(...ys), hi0 = Math.max(...ys);
  const pad = Math.max((hi0 - lo0) * 0.14, hi0 * 0.01, 0.01);
  const lo = lo0 - pad, hi = hi0 + pad;
  const t0 = ts(points[0].at), t1 = ts(points[points.length - 1].at);
  const x = (at: string) => (t1 === t0 ? (L + W - R) / 2 : L + ((ts(at) - t0) / (t1 - t0)) * (W - L - R));
  const base = H - B;
  const y = (v: number) => T + ((invert ? v - lo : hi - v) / (hi - lo)) * (base - T);
  const xy = points.map((p) => ({ x: x(p.at), y: y(p.y) }));
  const ticks = [0, 0.5, 1].map((r) => lo + (hi - lo) * (invert ? r : 1 - r));
  const line = smooth(xy);
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)} ${base} L${xy[0].x.toFixed(1)} ${base} Z`;
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
  const last = points.length - 1;

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    xy.forEach((p, i) => { if (Math.abs(p.x - px) < Math.abs(xy[best].x - px)) best = i; });
    setOn(best);
  };

  const hasHollow = points.some((p) => p.hollow);
  return (
    <div ref={boxRef} style={noSelect}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted" style={{ marginBottom: 4 }} aria-hidden>
      <span className="inline-flex items-center gap-1.5"><i style={{ width: 16, borderTop: "2px dashed var(--bib)", display: "inline-block" }} />평균 <b className="num" style={{ color: "var(--ink)" }}>{f(avg)}</b></span>
      <span className="inline-flex items-center gap-1.5">최근 {shortDate(points[last].date)} <b className="num" style={{ color: "var(--ink)" }}>{f(points[last].y)}</b></span>
      <span className="inline-flex items-center gap-1.5"><i style={{ width: 8, height: 8, borderRadius: 99, background: "var(--lane)", display: "inline-block" }} />{hasHollow ? "야외" : "기록"}</span>
      {hasHollow && <span className="inline-flex items-center gap-1.5"><i style={{ width: 8, height: 8, borderRadius: 99, border: "2px solid var(--bib)", display: "inline-block", boxSizing: "content-box" }} />트레드밀</span>}
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={svgStyle}
      onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setOn(null)}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--lane)", stopOpacity: 0.34 }} />
          <stop offset="1" style={{ stopColor: "var(--lane)", stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--lane)", stopOpacity: 0.65 }} />
          <stop offset="1" style={{ stopColor: "var(--lane)" }} />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" opacity="0.7" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{f(v)}</text>
        </g>
      ))}
      {/* 평균선 */}
      <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke="var(--bib)" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.7" />
      <path d={area} fill={`url(#${id}a)`} className="rc-fade" />
      <path d={line} pathLength={1} fill="none" stroke={`url(#${id}l)`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="rc-draw" />
      {on != null && <line x1={xy[on].x} x2={xy[on].x} y1={T} y2={base} stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 4" opacity="0.35" />}
      {points.map((p, i) => {
        const hot = on === i;
        return (
          <g key={i} pointerEvents="none">
            {(hot || i === last) && <circle cx={xy[i].x} cy={xy[i].y} r={hot ? 11 : 9} fill="var(--lane)" opacity={hot ? 0.22 : 0.16} />}
            <circle cx={xy[i].x} cy={xy[i].y} r={hot ? 5.6 : 3.8} fill={p.hollow ? "var(--card)" : "var(--lane)"} stroke={p.hollow ? "var(--bib)" : "var(--card)"} strokeWidth={p.hollow ? 2.2 : 1.6} />
          </g>
        );
      })}
      <text x={L} y={H - 8} fontSize="12" fill="var(--muted)">{shortDate(points[0].date)}</text>
      <text x={W - R} y={H - 8} textAnchor="end" fontSize="12" fill="var(--muted)">{shortDate(points[last].date)}</text>
      {on != null && <Tip W={W} x={xy[on].x} y={xy[on].y} text={points[on].tip} />}
    </svg>
    </div>
  );
}

/** 막대 그래프: 가장 큰 막대는 강조색, 올려 둔 막대는 진하게 */
export function BarChart({ bars, fmt, label }: { bars: { label: string; value: number; tip?: string }[]; fmt: Fmt; label: string }) {
  const id = gid(useId());
  const [boxRef, W] = useWidth();
  const [on, setOn] = useState<number | null>(null);
  const f = FORMATS[fmt];
  const max = Math.max(...bars.map((b) => b.value), 0.0001);
  const slot = (W - L - R) / bars.length, bw = Math.min(40, slot * 0.6);
  const base = H - B, top = T + 18;
  const every = Math.max(1, Math.ceil(36 / slot)); // 라벨이 겹치지 않게 (한 칸 폭이 36px보다 좁으면 건너뜀)
  const peak = bars.length > 2 ? bars.findIndex((b) => b.value === max) : -1;
  return (
    <div ref={boxRef} style={noSelect}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={svgStyle} onPointerLeave={() => setOn(null)}>
      <defs>
        {[["l", "--lane"], ["b", "--bib"]].map(([k, v]) => (
          <linearGradient key={k} id={`${id}${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: `var(${v})` }} />
            <stop offset="1" style={{ stopColor: `var(${v})`, stopOpacity: 0.5 }} />
          </linearGradient>
        ))}
      </defs>
      {[0.5, 1].map((r) => <line key={r} x1={L - 8} x2={W - R} y1={base - r * (base - top)} y2={base - r * (base - top)} stroke="var(--line)" strokeWidth="1" opacity="0.6" strokeDasharray={r === 1 ? "0" : "4 5"} />)}
      <line x1={L - 8} x2={W - R} y1={base} y2={base} stroke="var(--line)" />
      {bars.map((b, i) => {
        const h = b.value ? Math.max((b.value / max) * (base - top), 3) : 0, cx = L + slot * i + slot / 2, x0 = cx - bw / 2, y0 = base - h;
        const r = Math.min(7, bw / 2, h);
        const hot = on === i;
        return (
          <g key={b.label + i} onPointerEnter={() => setOn(i)} onPointerDown={() => setOn(on === i ? null : i)} style={{ cursor: "pointer" }}>
            <rect x={cx - slot / 2} y={T} width={slot} height={base - T} fill="var(--ink)" opacity={hot ? 0.05 : 0} />
            {h > 0 && (
              <path d={`M${x0} ${base} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} H${x0 + bw - r} Q${x0 + bw} ${y0} ${x0 + bw} ${y0 + r} V${base} Z`}
                fill={`url(#${id}${i === peak ? "b" : "l"})`} opacity={on == null || hot ? 1 : 0.55} className="rc-bar" style={{ animationDelay: `${i * 40}ms`, transition: "opacity .15s" }} />
            )}
            {b.value > 0 && <text x={cx} y={y0 - 6} textAnchor="middle" fontSize="13" fontWeight={hot || i === peak ? 800 : 600} fill="var(--ink)" stroke="var(--card)" strokeWidth="3.5" paintOrder="stroke" strokeLinejoin="round" pointerEvents="none">{f(b.value)}</text>}
            {i % every === 0 && <text x={cx} y={H - 8} textAnchor="middle" fontSize="12" fill={hot ? "var(--ink)" : "var(--muted)"} fontWeight={hot ? 700 : 400} pointerEvents="none">{b.label}</text>}
          </g>
        );
      })}
      {on != null && bars[on] && <Tip W={W} x={L + slot * on + slot / 2} y={base - (bars[on].value ? Math.max((bars[on].value / max) * (base - top), 3) : 0)} text={bars[on].tip ?? `${bars[on].label} ${f(bars[on].value)}`} />}
    </svg>
    </div>
  );
}

/** 가로 막대 비율 목록 (거리대·시간대 등): 1위는 강조색 */
export function HBars({ rows, unit = "회" }: { rows: { label: string; value: number; note?: string }[]; unit?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const top = rows.findIndex((r) => r.value === max);
  return (
    <ul className="grid gap-2.5 text-sm">
      {rows.map((r, i) => {
        const hot = i === top && r.value > 0;
        const color = hot ? "var(--bib)" : "var(--lane)";
        return (
          <li key={r.label} className="grid items-center gap-x-3" style={{ gridTemplateColumns: "92px 1fr auto" }}>
            <span className={`truncate ${r.value ? "" : "text-muted"}`} style={{ fontWeight: hot ? 700 : 500 }}>{r.label}</span>
            <span aria-hidden style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)", borderRadius: 999, height: 12, overflow: "hidden" }}>
              {r.value > 0 && (
                <span className="rc-hbar" style={{ display: "block", height: "100%", width: `${Math.max((r.value / max) * 100, 6)}%`, borderRadius: 999, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})` }} />
              )}
            </span>
            <span className="num text-right" style={{ minWidth: 76 }}>
              <b>{r.value}{unit}</b> <span className="text-muted text-xs">{r.value ? `${Math.round((r.value / total) * 100)}%` : ""}</span>
              {r.note && <span className="text-muted text-xs block">{r.note}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const RAMP = [
  "color-mix(in srgb, var(--lane) 30%, var(--card))",
  "color-mix(in srgb, var(--lane) 52%, var(--card))",
  "color-mix(in srgb, var(--lane) 76%, var(--card))",
  "var(--lane)",
  "var(--bib)",
];

/** 도넛 차트: 조각에 올리면 가운데에 그 값이 보인다 */
export function Donut({ slices, centerTop, centerBottom, unit = "회" }: { slices: { label: string; value: number }[]; centerTop: string; centerBottom: string; unit?: string }) {
  const [on, setOn] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return <p className="text-sm text-muted">훈련효과 기록이 없어요.</p>;
  const R0 = 54, C = 2 * Math.PI * R0, shown = slices.filter((s) => s.value > 0).length, gap = shown > 1 ? 3 : 0;
  let acc = 0;
  const cur = on != null ? slices[on] : null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <svg viewBox="0 0 150 150" role="img" aria-label="훈련효과 분포" style={{ width: 150, height: 150, flex: "none", ...noSelect }} onPointerLeave={() => setOn(null)}>
        <circle cx="75" cy="75" r={R0} fill="none" stroke="color-mix(in srgb, var(--ink) 8%, transparent)" strokeWidth="22" />
        <g transform="rotate(-90 75 75)">
          {slices.map((s, i) => {
            if (!s.value) return null;
            const len = (s.value / total) * C, off = acc, dash = Math.max(len - gap, 0.5);
            acc += len;
            return (
              <circle key={s.label} cx="75" cy="75" r={R0} fill="none" stroke={RAMP[i % RAMP.length]} strokeWidth={on === i ? 26 : 22}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off}
                opacity={on == null || on === i ? 1 : 0.4} style={{ transition: "all .15s", cursor: "pointer" }}
                onPointerEnter={() => setOn(i)} onPointerDown={() => setOn(on === i ? null : i)} />
            );
          })}
        </g>
        <text x="75" y={cur ? 70 : 72} textAnchor="middle" fontSize={cur ? 22 : 25} fontWeight="800" fill="var(--ink)" pointerEvents="none">{cur ? `${cur.value}${unit}` : centerTop}</text>
        <text x="75" y="90" textAnchor="middle" fontSize="11" fill="var(--muted)" pointerEvents="none">{cur ? `${Math.round((cur.value / total) * 100)}%` : centerBottom}</text>
      </svg>
      <ul className="grid gap-1.5 text-sm" style={{ flex: 1, minWidth: 150 }}>
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2" style={{ opacity: s.value ? 1 : 0.45, fontWeight: on === i ? 700 : 400 }}
            onPointerEnter={() => setOn(i)} onPointerLeave={() => setOn(null)}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: RAMP[i % RAMP.length], flex: "none" }} />
            <span className="truncate">{s.label}</span>
            <b className="num ml-auto">{s.value}{unit}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
