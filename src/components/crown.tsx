import { Fragment } from "react";

/** 운영진 표시: 단순한 선 왕관 아이콘 */
export function CrownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="crown" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="운영진" role="img">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  );
}

/** 관리자 표시 */
export function GearIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="crown gear" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="관리자" role="img">
      <path d="M10 2h4l.6 2.2 1.7.7 2-.9 2.8 2.8-.9 2 .7 1.7L23 11v2l-2.1.5-.7 1.7.9 2-2.8 2.8-2-.9-1.7.7L14 22h-4l-.6-2.2-1.7-.7-2 .9-2.8-2.8.9-2-.7-1.7L1 13v-2l2.1-.5.7-1.7-.9-2L5.7 4l2 .9 1.7-.7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 운전자 표시: 흰 동그라미 안의 까만 핸들 (어두운 화면에서도 또렷하게) */
export function WheelIcon({ size = 20 }: { size?: number }) {
  return (
    <span className="wheel-badge" style={{ width: size, height: size }} role="img" aria-label="운전자">
      <svg viewBox="0 0 24 24" width={size - 4} height={size - 4} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        <path d="M3.5 10.5 10 12M20.5 10.5 14 12M12 14.2v6.8" />
      </svg>
    </span>
  );
}

/** 닉네임 (운영진이면 앞에 왕관) */
export function Nick({ n, admins, managers, names, badgeAfter = false }: { n: string; admins: Set<string>; managers?: Set<string>; names?: Record<string, string>; badgeAfter?: boolean }) {
  const badge = managers?.has(n) ? <GearIcon /> : admins.has(n) ? <CrownIcon /> : null;
  return <>{!badgeAfter && badge}{n}/{names?.[n]?.trim() || "없음"}{badgeAfter && badge && <span className="badge-after">{badge}</span>}</>;
}

/** 닉네임 여러 개를 쉼표로 */
export function Nicks({ list, admins, managers, names }: { list: string[]; admins: Set<string>; managers?: Set<string>; names?: Record<string, string> }) {
  return <>{list.map((n, i) => <Fragment key={n}>{i > 0 && ", "}<Nick n={n} admins={admins} managers={managers} names={names} /></Fragment>)}</>;
}
