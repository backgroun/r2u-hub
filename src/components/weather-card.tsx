import { getWeather } from "@/lib/weather";
import WeatherBar from "@/components/weather-bar";

/** 홈 상단(인사말 아래) 날씨: 서버가 울산 날씨를 먼저 채워 주고, 브라우저가 내 위치로 바꾼다 */
export default async function WeatherCard() {
  return <WeatherBar initial={await getWeather()} />;
}
