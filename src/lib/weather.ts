// 오늘 울산 날씨·미세먼지 (Open-Meteo, 키 필요 없음). 10분 캐시, 실패하면 null 이라 화면에서 조용히 빠진다.
const LAT = 35.5384, LON = 129.3114;

export type Weather = { temp: number; feels: number; min: number; max: number; rain: number; wind: number; code: number; pm10: number | null; pm25: number | null };

/** 좌표 기준 날씨·미세먼지 (서버·브라우저 어디서든 호출 가능). 실패하면 null */
export async function fetchWeather(lat = LAT, lon = LON): Promise<Weather | null> {
  try {
    const opt = { next: { revalidate: 600 }, signal: AbortSignal.timeout(4000) } as RequestInit;
    const [w, a] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`, opt).then((r) => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=auto`, opt).then((r) => r.json()).catch(() => null),
    ]);
    const c = w?.current, d = w?.daily;
    if (typeof c?.temperature_2m !== "number") return null;
    return {
      temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature ?? c.temperature_2m),
      min: Math.round(d?.temperature_2m_min?.[0] ?? c.temperature_2m), max: Math.round(d?.temperature_2m_max?.[0] ?? c.temperature_2m),
      rain: Math.round(d?.precipitation_probability_max?.[0] ?? 0), wind: Math.round(((c.wind_speed_10m ?? 0) / 3.6) * 10) / 10, code: c.weather_code ?? 0,
      pm10: typeof a?.current?.pm10 === "number" ? Math.round(a.current.pm10) : null,
      pm25: typeof a?.current?.pm2_5 === "number" ? Math.round(a.current.pm2_5) : null,
    };
  } catch { return null; }
}
export const getWeather = () => fetchWeather();

/** 좌표 → 동네 이름 (무료 역지오코딩, 실패하면 null) */
export async function placeName(lat: number, lon: number): Promise<string | null> {
  try {
    const j = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json());
    return (j?.locality || j?.city || j?.principalSubdivision || "").toString().slice(0, 12) || null;
  } catch { return null; }
}

/** WMO 날씨 코드 → 단순 아이콘 종류·한글 */
export type WeatherKind = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";
export function weatherLabel(code: number): { kind: WeatherKind; text: string } {
  if (code === 0) return { kind: "sun", text: "맑음" };
  if (code <= 2) return { kind: "partly", text: "구름 조금" };
  if (code === 3) return { kind: "cloud", text: "흐림" };
  if (code === 45 || code === 48) return { kind: "fog", text: "안개" };
  if (code >= 51 && code <= 57) return { kind: "rain", text: "이슬비" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: "rain", text: "비" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", text: "눈" };
  if (code >= 95) return { kind: "storm", text: "천둥번개" };
  return { kind: "cloud", text: "구름 많음" };
}

/** 한국 기준 미세먼지 등급 */
export function dustGrade(pm10: number | null, pm25: number | null): { text: string; level: 0 | 1 | 2 | 3 } | null {
  if (pm10 == null && pm25 == null) return null;
  const g = (v: number | null, cuts: number[]) => (v == null ? 0 : v <= cuts[0] ? 0 : v <= cuts[1] ? 1 : v <= cuts[2] ? 2 : 3);
  const level = Math.max(g(pm10, [30, 80, 150]), g(pm25, [15, 35, 75])) as 0 | 1 | 2 | 3;
  return { text: ["좋음", "보통", "나쁨", "매우 나쁨"][level], level };
}
