import { headers } from "next/headers";
import { fetchWeather, placeName } from "@/lib/weather";
import WeatherBar from "@/components/weather-bar";

/** 홈 상단 날씨: 위치 허용이 없어도 접속 지역(Vercel IP 위치)으로 먼저 채우고, 브라우저가 허용하면 내 위치로 바꾼다 */
export default async function WeatherCard() {
  const h = await headers();
  const lat = Number(h.get("x-vercel-ip-latitude")), lon = Number(h.get("x-vercel-ip-longitude"));
  const approx = Number.isFinite(lat) && Number.isFinite(lon) && h.has("x-vercel-ip-latitude");
  const [weather, place] = await Promise.all([
    approx ? fetchWeather(lat, lon) : fetchWeather(),
    approx ? placeName(lat, lon) : Promise.resolve(null),
  ]);
  return <WeatherBar initial={weather} initialPlace={approx ? place : null} />;
}
