import { NextResponse, type NextRequest } from "next/server";
import { eventOpen } from "@/lib/event";

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
  if (await valid(req.cookies.get("r2u_s")?.value)) {
    // 이벤트 오픈일 전에는 빙고 화면 대신 안내 페이지로 (운영진 미리보기 쿠키가 있으면 허용)
    const p = req.nextUrl.pathname;
    if ((p === "/bingo" || p === "/bingo/index.html") && req.nextUrl.searchParams.get("preview") !== "1" && !((await valid(req.cookies.get("r2u_ev")?.value)) && sameNick(req.cookies.get("r2u_ev")?.value, req.cookies.get("r2u_s")?.value)) && !(await eventOpen())) {
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
  matcher: ["/((?!login|join|api|_next|favicon\\.ico|logo\\.png|apple-touch-icon\\.png|og\\.png|sw\\.js|icon-.+\\.png|manifest\\.webmanifest|bingo/.+\\.(?:js|css|png|webmanifest|woff2)).*)"],
};
