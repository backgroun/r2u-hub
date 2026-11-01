// 대회 참가 코스 표기 통일.
// 예전 구글시트에서 옮겨 온 데이터는 같은 코스가 H, 하프, half, 21K 처럼 제각각이라서, 한 가지 이름(5K·10K·Half·Full)으로 모은다.
// 알 수 없는 표기(예: 3K, 트레일 30K)는 손대지 않고 그대로 둔다.
const MAP: Record<string, string> = {
  "5k": "5K", "5km": "5K", "5": "5K",
  "10k": "10K", "10km": "10K", "10": "10K",
  "half": "Half", "하프": "Half", "h": "Half", "hm": "Half", "하프마라톤": "Half", "half마라톤": "Half", "21k": "Half", "21km": "Half", "21.1k": "Half", "21.0975k": "Half",
  "full": "Full", "풀": "Full", "f": "Full", "fm": "Full", "풀마라톤": "Full", "full마라톤": "Full", "42k": "Full", "42km": "Full", "42.195k": "Full",
};

/** 코스 이름을 5K·10K·Half·Full 중 하나로 통일한다. 모르는 표기는 앞뒤 공백만 정리해서 그대로 돌려준다. 빈 값은 "" */
export function canonCourse(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  return MAP[t.toLowerCase().replace(/\s+/g, "")] ?? t;
}
