import Link from "next/link";
import { kstToday } from "@/lib/hub";
import { activeChallenge, displayBlock } from "@/lib/event-blocks";
import { fmtDate, phaseOf } from "@/lib/challenge/rules";

/** 이벤트 탭 위에 붙는 챌린지 안내 띠. 이벤트 탭 본문이 이미 챌린지이면 보이지 않는다. */
export default async function ChallengeBanner() {
  const [chal, shown] = await Promise.all([activeChallenge(), displayBlock()]);
  if (!chal?.challenge || shown?.id === chal.id) return null;
  const cfg = chal.challenge;
  const phase = phaseOf(cfg, kstToday());
  const text = phase === "signup" ? `${chal.title} · ${fmtDate(cfg.signupEnd)}까지 신청 받아요` : phase === "running" || phase === "upload" ? `${chal.title} · 기록 올리기` : `${chal.title} · 순위·결과 보기`;
  return (
    <Link href="/event/challenge" className="flex items-center justify-between gap-2 px-4 py-2 text-sm font-bold" style={{ background: "#c9a965", color: "#17120a" }}>
      <span className="truncate">🏃 {text}</span><span aria-hidden>›</span>
    </Link>
  );
}
