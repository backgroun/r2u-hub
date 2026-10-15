import "server-only";
import { createHmac } from "crypto";

/* 쿠팡 파트너스 Open API (딥링크): 쿠팡 주소를 파트너스 짧은 링크(coupa.ng/…)로 바꾼다.
   인증: 요청마다 HMAC-SHA256 서명을 Authorization 헤더에 담는다 (서명 글자 = 서명시각 + 메서드 + 경로 + 쿼리, 시각은 GMT yyMMddTHHmmssZ).
   키는 환경변수(COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY)에서만 읽고, 화면·로그·오류 메시지에는 절대 내보내지 않는다. */
const HOST = "https://api-gateway.coupang.com";
const DEEPLINK = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

export const coupangReady = () => !!(process.env.COUPANG_ACCESS_KEY && process.env.COUPANG_SECRET_KEY);

function authorization(method: string, path: string): string {
  const access = process.env.COUPANG_ACCESS_KEY ?? "", secret = process.env.COUPANG_SECRET_KEY ?? "";
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  const signedDate = `${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const [pathOnly, query = ""] = path.split("?");
  const signature = createHmac("sha256", secret).update(signedDate + method + pathOnly + query).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${access}, signed-date=${signedDate}, signature=${signature}`;
}

/** 쿠팡 주소 여러 개를 파트너스 짧은 링크로 바꾼다. 실패하면 이유를 담아 던진다(키는 담지 않는다). */
export async function makeDeeplinks(urls: string[]): Promise<{ originalUrl: string; shortenUrl: string }[]> {
  if (!coupangReady()) throw new Error("쿠팡 키가 설정되지 않았어요. (.env.local에 COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY)");
  const res = await fetch(HOST + DEEPLINK, {
    method: "POST",
    headers: { Authorization: authorization("POST", DEEPLINK), "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({ coupangUrls: urls }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { rCode?: string; rMessage?: string; message?: string; code?: string; data?: { originalUrl: string; shortenUrl: string }[] } | null;
  if (!res.ok || !body || (body.rCode != null && body.rCode !== "0")) {
    const why = body?.rMessage || body?.message || `HTTP ${res.status}`;
    throw new Error(`쿠팡 응답 오류: ${why}`);
  }
  return body.data ?? [];
}
