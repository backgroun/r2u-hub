"use client";
import { useEffect, useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { voteGbPoll } from "@/app/actions";

export type PollView = {
  id: string; question: string; options: string[]; maxPick: number; changeable: boolean; showLive: boolean;
  deadlineLabel: string | null; open: boolean;
  /** 항목별 이미지 유무 (options와 같은 순서). 있으면 /api/gb-poll-image/{id}/{항목 번호} */
  optionImages: boolean[];
  /** 마지막 수정 시각. 이미지 주소에 붙여 바뀐 사진이 캐시에 가려지지 않게 한다 */
  ver: number;
  /** 선택지별 득표 수. 결과 비공개면 null */
  counts: number[] | null; voters: number; mine: number[] | null;
  /** 운영진 전용: 항목별 투표자 (닉네임/이름). 크루원에게는 null */
  voterNames: string[][] | null;
};

/** 공구 페이지 투표 카드: 단일/복수 선택, 변경 가능 여부는 투표마다 다르다 */
export default function PollCard({ poll: p, canVote }: { poll: PollView; canVote: boolean }) {
  const [picked, setPicked] = useState<number[]>(p.mine ?? []);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const multi = p.maxPick > 1;
  const done = !!p.mine && !p.changeable; // 변경 불가 투표를 이미 한 경우
  const locked = !p.open || !canVote || done;
  const max = Math.max(1, ...(p.counts ?? [1]));

  function toggle(i: number) {
    if (locked) return;
    setPicked((cur) => {
      if (!multi) return [i];
      if (cur.includes(i)) return cur.filter((x) => x !== i);
      return cur.length >= p.maxPick ? cur : [...cur, i];
    });
  }

  const rule = [
    multi ? `최대 ${p.maxPick}개 선택` : "1개 선택",
    p.changeable ? "마감 전 변경 가능" : "한 번만 투표",
    p.deadlineLabel ? `마감 ${p.deadlineLabel}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <ActionForm action={voteGbPoll} keep className="panel p-3.5 grid gap-2.5">
      <input type="hidden" name="id" value={p.id} />
      {picked.map((i) => <input key={i} type="hidden" name="pick" value={i} />)}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`chip ${p.open ? "chip-open" : ""}`}>{p.open ? "투표 중" : "마감"}</span>
        <span className="text-xs text-muted">{rule}</span>
      </div>
      <h3 className="font-bold text-base leading-snug">{p.question}</h3>
      <div className="grid gap-2" role={multi ? "group" : "radiogroup"} aria-label={p.question}>
        {p.options.map((o, i) => {
          const on = picked.includes(i);
          const n = p.counts?.[i];
          const src = p.optionImages[i] ? `/api/gb-poll-image/${p.id}/${i}?v=${p.ver}` : null;
          return (
            <div key={i} className="flex items-stretch gap-2">
              {/* 사진은 누르면 화면 안에서 크게 보인다 (선택 버튼 안에 넣을 수 없어서 옆에 따로 둔다) */}
              {src && (
                <button type="button" onClick={() => setZoom({ src, alt: o })} aria-label={`${o} 사진 크게 보기`} className="shrink-0 rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${o} 사진`} loading="lazy" className="rounded-xl w-14 h-14 object-cover" />
                </button>
              )}
              <button
                type="button" onClick={() => toggle(i)} aria-disabled={locked}
                role={multi ? "checkbox" : "radio"} aria-checked={on}
                className="relative overflow-hidden text-left rounded-xl border px-3 py-2.5 min-h-[44px] flex-1 min-w-0 flex items-center justify-between gap-2"
                style={{ borderColor: on ? "var(--lane)" : "var(--line)", background: "var(--card)", cursor: locked ? "default" : "pointer" }}
              >
                {n !== undefined && <span aria-hidden className="absolute inset-y-0 left-0 opacity-20" style={{ width: `${(n / max) * 100}%`, background: "var(--lane)" }} />}
                <span className="relative text-sm">{on ? "✓ " : ""}{o}</span>
                {n !== undefined && <span className="relative num text-sm text-muted shrink-0">{n}표</span>}
              </button>
            </div>
          );
        })}
      </div>
      {p.voterNames && (
        <details className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
          <summary className="text-sm font-bold cursor-pointer min-h-[44px] flex items-center">누가 투표했나요? (운영진 전용 · {p.voters}명)</summary>
          <ul className="grid gap-2 pb-1">
            {p.options.map((o, i) => (
              <li key={i} className="text-sm">
                <span className="font-bold">{o}</span> <span className="num text-muted">{p.voterNames![i].length}명</span>
                <p className="text-muted break-words">{p.voterNames![i].length ? p.voterNames![i].join(", ") : "아직 없어요"}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {p.counts || !p.open ? `${p.voters}명 참여` : "결과는 마감 후 공개돼요"}
        </span>
        {p.open && canVote && !done && <Submit className="btn btn-primary text-sm">{p.mine ? "투표 바꾸기" : "투표하기"}</Submit>}
        {p.open && done && <span className="chip">투표 완료</span>}
      </div>
      {zoom && <PhotoZoom {...zoom} onClose={() => setZoom(null)} />}
    </ActionForm>
  );
}

/** 사진 크게 보기: 화면 안 팝업. 닫기 버튼·바깥 터치·Esc·휴대폰 뒤로가기로 닫힌다 */
function PhotoZoom({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    // 뒤로가기가 페이지를 떠나지 않고 팝업만 닫도록 기록을 하나 쌓아 둔다
    history.pushState({ gbZoom: true }, "");
    const onPop = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") history.back(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 닫기 버튼·바깥 터치는 쌓아 둔 기록을 되돌려서 닫는다 (popstate에서 onClose 호출)
  const close = () => history.back();

  return (
    <div role="dialog" aria-modal="true" aria-label={`${alt} 사진 크게 보기`} onClick={close} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <button type="button" onClick={close} aria-label="닫기" className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/60 text-white text-xl" autoFocus>✕</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-lg" />
    </div>
  );
}
