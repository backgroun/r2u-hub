"use client";
import { useEffect } from "react";

/** 가로 스크롤 칩 줄에서 선택된 칩이 화면 밖에 있으면 보이는 위치로 옮긴다 */
export default function ScrollToCurrent({ selector }: { selector: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`${selector} [aria-current="page"]`);
    const box = el?.parentElement;
    if (el && box) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
  }, [selector]);
  return null;
}
