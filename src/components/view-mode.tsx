import { setViewMode } from "@/app/actions";

/** 운영진 전용: 메뉴의 내 이름 탭 옆에 세로로 놓는 보기 모드 전환 (운영자 ↔ 크루). 어느 화면에서든 바로 바꾼다. */
export function ViewModeStack({ crew }: { crew: boolean }) {
  return (
    <form action={setViewMode} className="mode-stack" role="group" aria-label="보기 모드">
      <button name="mode" value="admin" className={!crew ? "on" : ""} aria-pressed={!crew} aria-label="운영진 모드" title="운영진 모드">O</button>
      <button name="mode" value="crew" className={crew ? "on" : ""} aria-pressed={crew} aria-label="크루 모드" title="크루 모드">C</button>
    </form>
  );
}
