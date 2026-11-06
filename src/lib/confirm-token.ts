import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { currentRealUser } from "@/lib/hub";

// 민감한 동작(삭제 등) 확인용 토큰: 본인 로그인 비밀번호를 다시 입력해 맞으면 /api/confirm-pw 가 짧은 시간 동안만 쓰는 토큰을 준다.
// 각 동작은 이 토큰을 서버에서 다시 확인한다 (화면에서만 막는 게 아니다). 토큰은 로그인한 본인 닉네임에 묶여 있다.
const TTL_MS = 3 * 60 * 1000;
const sig = (nick: string, exp: number) => createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`confirm:${nick}:${exp}`).digest("base64url");

export function issueConfirmToken(nick: string) {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sig(nick, exp)}`;
}

function valid(token: string, nick: string) {
  const [expS, mac] = token.split(".");
  const exp = Number(expS);
  if (!mac || !Number.isFinite(exp) || exp < Date.now()) return false;
  const a = Buffer.from(sig(nick, exp)), b = Buffer.from(mac);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 지금 로그인한 본인이 방금 비밀번호를 확인했는가 */
export async function isConfirmed(token: unknown) {
  if (typeof token !== "string" || !token) return false;
  const u = await currentRealUser();
  return !!u && valid(token, u.nick);
}

/** 비밀번호 확인이 안 됐을 때 화면에 보여 줄 문구 */
export const CONFIRM_REQUIRED = "비밀번호 확인이 필요해요. 다시 시도해 주세요.";
