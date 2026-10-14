"use client";
import { useEffect, useState } from "react";

/** 홈 화면에 추가한 앱(주소창 없는 화면)에서만 보이는 뒤로·앞으로·새로고침 버튼 */
export default function AppBar() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setOn(standalone);
    document.documentElement.classList.toggle("is-app", standalone);
  }, []);
  if (!on) return null;
  return (
    <div className="app-bar" role="toolbar" aria-label="이동">
      <button type="button" onClick={() => history.back()} aria-label="뒤로 가기">‹</button>
      <button type="button" onClick={() => location.reload()} aria-label="새로고침">⟳</button>
      <button type="button" onClick={() => history.forward()} aria-label="앞으로 가기">›</button>
    </div>
  );
}
