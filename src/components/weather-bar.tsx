"use client";
import { useEffect, useState } from "react";
import { dustGrade, fetchWeather, placeName, weatherLabel, type Weather, type WeatherKind } from "@/lib/weather";

const KEY = "r2u:weather-pos";

/** 선 하나로 그린 단순 아이콘 (글자색을 따라간다) */
function Icon({ kind }: { kind: WeatherKind }) {
  const cloud = <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5a4.25 4.25 0 0 1 .5 8.5H7z" />;
  return (
    <svg className="weather-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {kind === "sun" && <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>}
      {kind === "partly" && <><circle cx="8.5" cy="8.5" r="2.8" /><path d="M8.5 3v1M3 8.5h1M4.6 4.6l.7.7M12.4 4.6l-.7.7" /><path d="M9 20a3.5 3.5 0 0 1-.3-7A4.7 4.7 0 0 1 17.8 14 3.5 3.5 0 0 1 17.5 20H9z" /></>}
      {kind === "cloud" && cloud}
      {kind === "fog" && <><path d="M4 9h16M3 13h18M5 17h14" /></>}
      {kind === "rain" && <>{cloud}<path d="M9 21l1-2M13 21l1-2" /></>}
      {kind === "snow" && <>{cloud}<path d="M9 20h.01M13 21h.01M17 20h.01" strokeWidth="2.4" /></>}
      {kind === "storm" && <>{cloud}<path d="m12 14-2 3h3l-1 3" /></>}
    </svg>
  );
}

/** 홈 상단 날씨 한 줄. 처음엔 울산 기준으로 보여 주고, 위치를 허용하면 내 위치 기준으로 바뀐다. */
export default function WeatherBar({ initial }: { initial: Weather | null }) {
  const [w, setW] = useState<Weather | null>(initial);
  const [place, setPlace] = useState("울산");
  const [located, setLocated] = useState(false);

  const load = async (lat: number, lon: number) => {
    const [nw, name] = await Promise.all([fetchWeather(lat, lon), placeName(lat, lon)]);
    if (nw) setW(nw);
    if (name) setPlace(name);
    setLocated(true);
  };
  // 위치 가져오기. 사용자가 직접 눌렀을 때(manual)만 안내 문구를 띄운다
  const locate = (manual: boolean) => {
    if (!window.isSecureContext || !navigator.geolocation) { if (manual) window.alert("https 주소(보안 연결)에서만 내 위치를 쓸 수 있어요."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 100) / 100, lon = Math.round(p.coords.longitude * 100) / 100;
        try { localStorage.setItem(KEY, JSON.stringify({ lat, lon })); } catch { /* 저장소 막힘 */ }
        load(lat, lon);
      },
      (e) => { if (manual) window.alert(e.code === 1 ? "위치 권한이 꺼져 있어요. 주소창 왼쪽 자물쇠(설정)에서 ‘위치’를 허용해 주세요." : "내 위치를 가져오지 못했어요. 잠시 후 다시 눌러 주세요."); },
      { maximumAge: 30 * 60_000, timeout: 10_000 },
    );
  };

  useEffect(() => {
    // 예전에 허용한 적이 있으면 조용히 내 위치로, 아니면 ‘내 위치’ 버튼을 눌러 허용을 받는다
    (async () => {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { lat: number; lon: number } | null;
        if (saved) load(saved.lat, saved.lon);
      } catch { /* 저장소 막힘 */ }
      try {
        const st = await navigator.permissions?.query({ name: "geolocation" });
        if (st?.state === "granted") locate(false);
      } catch { /* 권한 조회를 지원하지 않는 브라우저 */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!w) return null;
  const { kind, text } = weatherLabel(w.code);
  const dust = dustGrade(w.pm10, w.pm25);
  return (
    <section className="weather-card" aria-label="오늘 날씨">
      <Icon kind={kind} />
      <span className="weather-temp num">{w.temp}°<small> {text}</small></span>
      <span className="weather-range num">{w.min}°/{w.max}°</span>
      <span className="weather-meta">
        <span>강수 <b className="num">{w.rain}%</b></span>
        {dust && <span>미세먼지 <b className={`dust-${dust.level}`}>{dust.text}</b></span>}
        {located
          ? <span className="weather-place">{place}</span>
          : <button type="button" className="weather-place weather-locate" onClick={() => locate(true)}>{place} · 내 위치</button>}
      </span>
    </section>
  );
}
