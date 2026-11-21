import Link from "next/link";
import { currentUser } from "@/lib/hub";
import { activeChallenge, displayBlock } from "@/lib/event-blocks";
import { PHASE_LABEL, currentPhase, fmtDateTime, nowKst } from "@/lib/challenge/rules";

/** 이벤트 탭 위에 붙는 챌린지 안내 띠. 이벤트 탭 본문이 이미 챌린지이면 보이지 않는다. */
export default async function ChallengeBanner() {
  const u = await currentUser();
  const opts = { staff: !!u?.admin};
  const [chal, shown] = await Promise.all([activeChallenge(undefined, opts), displayBlock(opts)]);
  if (!chal?.challenge || shown?.id === chal.id) return null;
  const cfg = chal.challenge;
  const phase = currentPhase(cfg, nowKst());
  const test = cfg.testMode;
  const text = test ? `🧪 테스트 모드 · ${chal.title} · ${PHASE_LABEL[phase]} (운영진에게만 보여요)` : phase === "signup" ? `${chal.title} · ${fmtDateTime(cfg.signupEnd)}까지 신청 받아요` : phase === "running" || phase === "upload" ? `${chal.title} · 기록 올리기` : `${chal.title} · 순위·결과 보기`;
  return (
    <Link href="/event/challenge" className="event-challenge-banner flex items-center justify-between gap-2 px-4 py-2 text-sm font-bold" style={{ background: "#c9a965", color: "#17120a" }}>
      <span className="truncate">{test ? "" : "🏃 "}{text}</span><span aria-hidden>›</span>
    </Link>
  );
}
