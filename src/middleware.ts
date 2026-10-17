import { NextResponse, type NextRequest } from "next/server";

/** 이벤트 공개 여부: 미들웨어(엣지)는 DB 에 직접 접속하지 못해서 서버의 작은 API 로 묻는다. 못 읽으면 이벤트 전 화면(안내)으로 보낸다. */
async function eventVisibleViaApi(req: NextRequest): Promise<boolean> {
  try {
    const res = await fetch(new URL("/api/event/visible", req.url), { cache: "no-store" });
    if (!res.ok) return false;
    return Boolean((await res.json() as { visible?: boolean }).visible);
  } catch { return false; }
}

// 로그인한 크루원만 페이지를 볼 수 있다. 쿠키 서명만 확인하고, 역할 확인은 각 페이지가 DB로 한다.
async function valid(raw: string | undefined) {
  if (!raw || !process.env.SESSION_SECRET) return false;
  const [n, t, sig] = raw.split(".");
  if (!sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${n}.${t}`)));
  const b64 = btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64 === sig;
}

// 쿠키 앞부분(닉네임)을 꺼낸다. 서명은 valid()로 따로 확인한다.
const nickOf = (raw: string | undefined) => { try { return atob((raw ?? "").split(".")[0].replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; } };
const sameNick = (a: string | undefined, b: string | undefined) => new TextDecoder().decode(Uint8Array.from(nickOf(a), (c) => c.charCodeAt(0))) === new TextDecoder().decode(Uint8Array.from(nickOf(b), (c) => c.charCodeAt(0)));

export async function middleware(req: NextRequest) {
  // 점검 모드(MAINTENANCE=1): 읽기는 그대로 두고, 쓰기 요청(POST 등)만 막는다. 로그인은 허용.
  if (process.env.MAINTENANCE === "1" && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.nextUrl.pathname !== "/login") {
    return new NextResponse("점검 중이라 지금은 저장할 수 없어요. 잠시 후 다시 해 주세요.", { status: 503, headers: { "Retry-After": "600", "Cache-Control": "no-store" } });
  }
  // 점검 모드가 아닐 때 API 는 예전처럼 미들웨어를 거치지 않는다 (쓰기 차단만 위에서 처리).
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  if (await valid(req.cookies.get("r2u_s")?.value)) {
    // 이벤트 오픈일 전이거나 운영진이 숨긴 동안에는 빙고 화면 대신 안내 페이지로 (운영진 미리보기 쿠키가 있으면 허용)
    const p = req.nextUrl.pathname;
    if ((p === "/bingo" || p === "/bingo/index.html") && req.nextUrl.searchParams.get("preview") !== "1" && !((await valid(req.cookies.get("r2u_ev")?.value)) && sameNick(req.cookies.get("r2u_ev")?.value, req.cookies.get("r2u_s")?.value)) && !(await eventVisibleViaApi(req))) {
      const url = req.nextUrl.clone();
      url.pathname = "/event"; url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 로그인 화면, API, 정적 파일(빙고 css/js/이미지 포함)은 제외. 빙고 화면(/bingo, /bingo/index.html)은 보호.
  matcher: ["/api/:path*", "/((?!login|join|api|_next|favicon\\.ico|logo\\.png|apple-touch-icon\\.png|og\\.png|sw\\.js|icon-.+\\.png|icons/.+\\.png|gear/.+\\.webp|manifest\\.webmanifest|bingo/.+\\.(?:js|css|png|webmanifest|woff2)).*)"],
};
