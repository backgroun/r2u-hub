import { currentUser } from "@/lib/hub";

type KakaoPlace = { id: string; place_name: string; road_address_name: string; address_name: string; place_url: string };

export async function GET(request: Request) {
  if (!(await currentUser())) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  if (query.length < 2) return Response.json({ places: [] });
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return Response.json({ error: "카카오 장소 검색 연결을 준비 중이에요." }, { status: 503 });
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "8");
  try {
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) return Response.json({ error: "카카오 장소 검색을 불러오지 못했어요." }, { status: 502 });
    const data = await response.json() as { documents?: KakaoPlace[] };
    return Response.json({ places: (data.documents ?? []).map((p) => ({ id: p.id, name: p.place_name, address: p.road_address_name || p.address_name, url: p.place_url })) });
  } catch {
    return Response.json({ error: "카카오 장소 검색을 불러오지 못했어요." }, { status: 502 });
  }
}
