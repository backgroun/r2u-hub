import { Fragment } from "react";

/** 운영진 표시: 단순한 선 왕관 아이콘 */
export function CrownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="crown" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="운영진" role="img">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  );
}

/** 닉네임 (운영진이면 앞에 왕관) */
export function Nick({ n, admins }: { n: string; admins: Set<string> }) {
  return <>{admins.has(n) && <CrownIcon />}{n}</>;
}

/** 닉네임 여러 개를 쉼표로 */
export function Nicks({ list, admins }: { list: string[]; admins: Set<string> }) {
  return <>{list.map((n, i) => <Fragment key={n}>{i > 0 && ", "}<Nick n={n} admins={admins} /></Fragment>)}</>;
}
