"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { login } from "@/app/actions";
import PasswordInput from "@/components/password-input";

/** 즐겨찾기(비밀번호 설정함) 표시: 선만 있는 빈 별 */
function StarIcon({ onPick, filled }: { onPick?: () => void; filled?: boolean }) {
  return (
    <svg className="nick-star" onClick={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined} viewBox="0 0 24 24" width={16} height={16} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" role="img" aria-label="비밀번호 설정함">
      <path d="M12 2.8l2.84 5.76 6.36.92-4.6 4.48 1.08 6.34L12 17.3l-5.68 2.99 1.08-6.34-4.6-4.48 6.36-.92z" />
    </svg>
  );
}

const ONLY_NICK = "r2u:onlyNick"; // 별을 눌러 ‘내 닉네임만 보기’로 해 둔 닉네임
const LAST_NICK = "r2u:lastNick"; // 이 기기에서 마지막으로 입장한 닉네임
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
/** 한글 초성만 뽑기: 정이 → ㅈㅇ */
const chosung = (s: string) => [...s].map((c) => {
  const code = c.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c;
}).join("");
const matches = (nick: string, name: string, q: string) => {
  const n = `${nick} ${name}`.toLowerCase(), k = q.trim().toLowerCase();
  if (!k) return true;
  return n.includes(k) || chosung(n).includes(k);
};

export default function LoginForm({ members, next, children }: { members: { nick: string; name: string; hasPw: boolean; admin?: boolean; manager?: boolean }[]; next: string; children?: React.ReactNode }) {
  const [state, run, pending] = useActionState(login, null);
  const [showError, setShowError] = useState(true);
  const [nick, setNick] = useState("");
  const [q, setQ] = useState("");
  const [staffNick, setStaffNick] = useState<"운영진" | null>(null);
  const m = members.find((x) => x.nick === nick);
  const first = !staffNick && m && !m.hasPw;
  const [only, setOnly] = useState<string | null>(null); // 내 별을 눌러 내 닉네임만 보는 중
  const list = useMemo(() => only ? members.filter((x) => x.nick === only) : members.filter((x) => matches(x.nick, x.name, q)), [members, q, only]);
  const pickOnly = (v: string | null) => { setOnly(v); try { if (v) localStorage.setItem(ONLY_NICK, v); else localStorage.removeItem(ONLY_NICK); } catch { /* 저장소 막힘 */ } };

  // 이 기기에서 마지막으로 쓴 닉네임을 미리 골라 둔다
  useEffect(() => {
    try { const o = localStorage.getItem(ONLY_NICK); if (o && members.some((x) => x.nick === o && x.hasPw)) setOnly(o); } catch { /* 저장소 막힘 */ }
    try { const last = localStorage.getItem(LAST_NICK); if (last && members.some((x) => x.nick === last)) setNick(last); } catch { /* 저장소 막힘 */ }
  }, [members]);
  useEffect(() => { if (state?.msg) setShowError(true); }, [state]);
  const chooseNick = (value: string) => { setNick(value); setShowError(false); };
  const remember = () => { try { if (nick && !staffNick) localStorage.setItem(LAST_NICK, nick); } catch { /* 저장소 막힘 */ } };

  return (
    <div className="grid gap-3">
      <form action={run} onSubmit={remember} className="panel p-5 grid gap-4" autoComplete="off" data-af="1">
        <input type="hidden" name="next" value={next} />
        {staffNick ? (
          <>
            <input type="hidden" name="nick" value={staffNick} />
            <p className="font-bold">{staffNick} 모드</p>
          </>
        ) : nick ? (
          <div className="field">
            <span className="label">닉넴/이름</span>
            <div className="nick-picked">
              <b className="inline-flex items-center gap-1">{m?.hasPw && <StarIcon filled={only === nick} />}{nick}/<span className={m?.manager ? "is-manager" : m?.admin ? "is-admin" : undefined}>{m?.name || "없음"}</span></b>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => { chooseNick(""); setQ(""); }}>바꾸기</button>
            </div>
            <input type="hidden" name="nick" value={nick} />
          </div>
        ) : (
          <div className="field">
            <div className="nick-grid" aria-label="닉넴/이름 목록">
              {list.map((x) => (
                <button key={x.nick} type="button" className="nick-chip" onClick={() => chooseNick(x.nick)}>{x.hasPw && <StarIcon filled={only === x.nick} onPick={() => pickOnly(only === x.nick ? null : x.nick)} />}{x.nick}/<span className={x.manager ? "is-manager" : x.admin ? "is-admin" : undefined}>{x.name}</span></button>
              ))}
              {list.length === 0 && <span className="text-sm text-muted">‘{q}’에 맞는 닉네임이 없어요.</span>}
            </div>
            {only && <button type="button" className="text-xs text-muted underline underline-offset-2 justify-self-center py-1" onClick={() => pickOnly(null)}>전체 닉네임 보기</button>}
          </div>
        )}
        {(nick || staffNick) && (
          <label className="field">
            <span className="label">{first ? "새 비밀번호 (4자 이상)" : staffNick ? `${staffNick} 비밀번호` : "비밀번호"}</span>
            {staffNick ? (
              <input id="pw" name="pw" type="text" className="input pw-mask" required autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore />
            ) : (
              <PasswordInput id="pw" name="pw" className="input pw-mask" required minLength={first ? 4 : 1} autoFocus data-lpignore="true" data-1p-ignore />
            )}
          </label>
        )}
        {first && (
          <label className="field">
            <span className="label">새 비밀번호 확인</span>
            <PasswordInput id="pw2" name="pw2" className="input pw-mask" required minLength={4} data-lpignore="true" data-1p-ignore />
          </label>
        )}
        {showError && state?.msg && <p role="alert" className="text-sm text-[var(--bad)]">{state.msg}</p>}
        {(nick || staffNick) && (
          <button className="btn btn-primary text-base py-3.5" disabled={pending}>
            {pending ? "확인 중…" : first ? "비밀번호 정하고 입장" : staffNick ? `${staffNick}로 입장` : "입장하기"}
          </button>
        )}
      </form>
      {!staffNick && !nick && !only && (
        <div className="flex items-center gap-3 px-1">
          <input className="input min-w-0 flex-1 nick-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉넴/이름 찾기 (한두 글자 또는 초성)" aria-label="닉넴/이름 찾기" />
        </div>
      )}
      {children}
      <button type="button" className="justify-self-center text-xs text-muted underline underline-offset-2 py-2" onClick={() => { setStaffNick(staffNick === "운영진" ? null : "운영진"); setNick(""); setShowError(false); }}>
        {staffNick === "운영진" ? "크루원으로 입장하기" : "운영진 모드"}
      </button>
    </div>
  );
}
