"use client";

/* 관리자용 테스트 버튼: 확률·제한과 상관없이 스팟게임 용품을 바로 하나 띄운다. 포인트는 서버에 반영되지 않는다. */
export default function SpotTestButton() {
  return (
    <button type="button" className="btn btn-primary text-sm" onClick={() => window.dispatchEvent(new CustomEvent("r2u:spot-test"))}>
      스팟게임 테스트
    </button>
  );
}
