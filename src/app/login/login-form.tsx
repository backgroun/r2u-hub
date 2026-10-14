"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { login } from "@/app/actions";
import { CrownIcon } from "@/components/crown";

const LAST_NICK = "r2u:lastNick"; // 이 기기에서 마지막으로 입장한 닉네임
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
/** 한글 초성만 뽑기: 정이 → ㅈㅇ */
const chosung = (s: string) => [...s].map((c) => {
  const code = c.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c;
}).join("");
const matches = (nick: string, q: string) => {
  const n = nick.toLowerCase(), k = q.trim().toLowerCase();
  if (!k) return true;
  return n.includes(k) || chosung(n).includes(k);
};

export default function LoginForm({ members, next, children }: { members: { nick: string; hasPw: boolean; admin?: boolean }[]; next: string; children?: React.ReactNode }) {
  const [state, run, pending] = useActionState(login, null);
  const [nick, setNick] = useState("");
  const [q, setQ] = useState("");
  const [staff, setStaff] = useState(false); // 운영진 모드: 관리용 ‘운영진’ 계정으로 입장
  const m = members.find((x) => x.nick === nick);
  const first = !staff && m && !m.hasPw;
  const list = useMemo(() => members.filter((x) => matches(x.nick, q)), [members, q]);

  // 이 기기에서 마지막으로 쓴 닉네임을 미리 골라 둔다
  useEffect(() => {
    try { const last = localStorage.getItem(LAST_NICK); if (last && members.some((x) => x.nick === last)) setNick(last); } catch { /* 저장소 막힘 */ }
  }, [members]);
  const remember = () => { try { if (nick && !staff) localStorage.setItem(LAST_NICK, nick); } catch { /* 저장소 막힘 */ } };

  return (
    <div className="grid gap-3">
      <form action={run} onSubmit={remember} className="panel p-5 grid gap-4" autoComplete="off" data-af="1">
        <input type="hidden" name="next" value={next} />
        {staff ? (
          <>
            <input type="hidden" name="nick" value="운영진" />
            <p className="font-bold">운영진 모드</p>
          </>
        ) : nick ? (
          <div className="field">
            <span className="label">닉네임</span>
            <div className="nick-picked">
              <b className="inline-flex items-center gap-1">{m?.admin && <CrownIcon size={15} />}{nick}</b>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => { setNick(""); setQ(""); }}>바꾸기</button>
            </div>
            <input type="hidden" name="nick" value={nick} />
          </div>
        ) : (
          <div className="field">
            <div className="nick-grid" aria-label="닉네임 목록">
              {list.map((x) => (
                <button key={x.nick} type="button" className="nick-chip" onClick={() => setNick(x.nick)}>{x.admin && <CrownIcon size={13} />}{x.nick}</button>
              ))}
              {list.length === 0 && <span className="text-sm text-muted">‘{q}’에 맞는 닉네임이 없어요.</span>}
            </div>
          </div>
        )}
        {(nick || staff) && (
          <label className="field">
            <span className="label">{first ? "새 비밀번호 (4자 이상)" : staff ? "운영진 비밀번호" : "비밀번호"}</span>
            <input id="pw" name="pw" type="text" className="input pw-mask" required minLength={first ? 4 : 1} autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore />
          </label>
        )}
        {first && (
          <label className="field">
            <span className="label">새 비밀번호 확인</span>
            <input id="pw2" name="pw2" type="text" className="input pw-mask" required minLength={4} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore />
          </label>
        )}
        {state?.msg && <p role="alert" className="text-sm text-[var(--bad)]">{state.msg}</p>}
        {(nick || staff) && (
          <button className="btn btn-primary text-base py-3.5" disabled={pending}>
            {pending ? "확인 중…" : first ? "비밀번호 정하고 입장" : staff ? "운영진으로 입장" : "입장하기"}
          </button>
        )}
      </form>
      {!staff && !nick && (
        <div className="flex items-center gap-3 px-1">
          <input className="input min-w-0 flex-1 nick-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 찾기 (한두 글자 또는 초성, 예: ㅈㅇ)" aria-label="닉네임 찾기" />
        </div>
      )}
      {children}
      <button type="button" className="justify-self-center text-xs text-muted underline underline-offset-2 py-2" onClick={() => setStaff((v) => !v)}>
        {staff ? "크루원으로 입장하기" : "운영진 모드"}
      </button>
    </div>
  );
}
