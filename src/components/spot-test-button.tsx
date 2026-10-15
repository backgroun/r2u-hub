"use client";

/* 관리자용 테스트 버튼: 확률·제한과 상관없이 스팟게임 용품을 바로 하나 띄운다. 포인트는 서버에 반영되지 않는다. */
export default function SpotTestButton() {
  return (
    <button type="button" className="btn btn-primary text-sm shrink-0" onClick={() => window.dispatchEvent(new CustomEvent("r2u:spot-test"))}>
      스팟게임 테스트
    </button>
  );
}

/* 용품 목록에서 용품을 누르면 그 용품의 카드(이름·도움 설명·쿠팡 버튼)를 보여 준다. */
export function SpotCardButton({ g, className, label, children }: { g: number; className?: string; label: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} aria-label={label} onClick={() => window.dispatchEvent(new CustomEvent("r2u:spot-card", { detail: { g } }))}>
      {children}
    </button>
  );
}
