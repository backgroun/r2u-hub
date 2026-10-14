"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Day = 3 | 2 | 1;
const GUIDE: Record<Day, { title: string; items: string[] }> = {
  3: {
    title: "D-3 · 컨디션을 지키는 날",
    items: [
      "러닝은 20~30분 가볍게만. 강한 훈련·근력운동은 쉬어요.",
      "새로운 음식·신발·장비는 지금부터 금지! 대회 때 신을 신발과 복장을 최종 점검해요.",
      "평소 취침 시간을 지켜요. 일찍 눕는다고 잠이 더 오지는 않아요.",
      "물을 하루 1.5~2L 정도, 나눠서 꾸준히 마셔요.",
      "마사지·찜질 같은 새로운 시도는 피해요. 근육이 뭉치거나 아플 수 있어요.",
      "탄수화물을 평소보다 조금씩 늘릴 준비를 해요. (과식은 금물)",
    ],
  },
  2: {
    title: "D-2 · 먹고 자는 게 훈련인 날",
    items: [
      "밥·면·감자·바나나처럼 소화 잘 되는 탄수화물 비중을 높여요. 많이 먹기보다 평소보다 조금 더.",
      "술은 오늘부터 끊어요. 기름지고 자극적인 음식도 줄여요.",
      "이틀 전 밤 잠이 중요해요. 전날은 긴장해서 못 잘 수 있으니 오늘 푹 자 둬요.",
      "준비물 목록을 적어서 확인해요. 배번호 수령·교통·주차·집결 시간·날씨도 체크!",
      "러닝은 쉬거나 15분 이내 가볍게. 스트레칭·폼롤러 정도만 해요.",
    ],
  },
  1: {
    title: "D-1 · 준비물과 수면이 전부인 날",
    items: [
      "가벼운 조깅·스트레칭은 10~20분 이내. 몸 상태만 확인해요.",
      "저녁은 평소 먹던 탄수화물 위주 식사로, 잠들기 전 속이 편하게 일찍(6~8시쯤) 마쳐요.",
      "가스 차는 음식(콩·브로콜리)과 맵고 기름진 음식, 술·카페인은 피해요.",
      "물은 한 번에 많이 말고 나눠서 마셔요.",
      "러닝복·양말·배번호·기록칩·젤·여분 핀을 챙기고, 번호표는 미리 옷에 달아 둬요. 알람은 2개!",
      "일찍 누워요. 잠이 안 와도 누워서 쉬면 괜찮아요. 대회 관련 알림은 꺼 둬요.",
      "당일 아침: 출발 2~3시간 전 익숙한 음식으로 가볍게. 화장실은 출발 30~40분 전에 다녀와요.",
    ],
  },
};
const SOURCES = [
  { t: "Brooks · 마라톤 준비와 대회 당일 팁", u: "https://www.brooksrunning.com/en_nl/blog/advice-tips/marathon-preparation-and-race-day-tips.html" },
  { t: "대회 전날, 카보로딩보다 먼저 지킬 것", u: "https://wikidocs.net/blog/@Ounwan/27903/" },
  { t: "마라톤 전 식사 가이드", u: "https://runningwikii.com/entry/marathon-pre-race-meal-guide/" },
];

/** D-3~D-1 대회 준비 안내. 작은 버튼을 누르면 창이 열린다. */
export default function RaceGuide({ dd }: { dd: Day }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<Day>(dd);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const g = GUIDE[day];
  return (
    <>
      <button type="button" className="guide-btn ml-auto" onClick={() => { setDay(dd); setOpen(true); }}>🏁 D-{dd} 준비 가이드</button>
      {open && createPortal(
        <div className="guide-back" onClick={() => setOpen(false)} role="presentation">
          <div className="guide-modal" role="dialog" aria-modal="true" aria-label="대회 준비 가이드" onClick={(e) => e.stopPropagation()}>
            <div className="guide-head">
              <b>🏁 대회 준비 가이드</b>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기">✕</button>
            </div>
            <div className="guide-tabs">
              {([3, 2, 1] as Day[]).map((d) => <button key={d} type="button" className={d === day ? "on" : ""} onClick={() => setDay(d)}>D-{d}</button>)}
            </div>
            <h3>{g.title}</h3>
            <ul>{g.items.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="guide-note">일반적인 준비 요령이에요. 체질·컨디션에 따라 다를 수 있고, 지병이 있거나 위장이 예민하다면 평소 방식을 우선해 주세요. 대회 때 처음 하는 건 무엇이든 금지!</p>
            <p className="guide-src">참고: {SOURCES.map((s, i) => <span key={s.u}>{i ? " · " : ""}<a href={s.u} target="_blank" rel="noopener noreferrer">{s.t}</a></span>)}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
