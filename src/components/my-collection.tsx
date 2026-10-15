"use client";

import { GEARS, GearArt } from "@/components/gear-art";

/* 내 스팟게임 컬렉션: 잡은 용품은 그림이 보이고(누르면 카드), 아직 못 잡은 용품은 어두운 실루엣으로만 보인다(이름은 숨김). */
export default function MyCollection({ caught }: { caught: number[] }) {
  const got = new Set(caught);
  return (
    <details className="panel p-4 my-collection">
      <summary className="flex items-center gap-2 cursor-pointer">
        <b>내 스팟게임 컬렉션</b>
        <span className="num text-sm ml-auto">{got.size}<small className="text-muted">/{GEARS.length}</small></span>
      </summary>
      <div className="gear-bar mt-3" aria-hidden><i style={{ width: `${Math.round((got.size / GEARS.length) * 100)}%` }} /></div>
      <p className="text-xs text-muted mt-2">{got.size === 0 ? "아직 잡은 용품이 없어요. 앱을 열면 가끔 튕겨 나오는 용품을 잡아 보세요!" : "잡은 용품을 누르면 카드를 볼 수 있어요. 회색 칸은 아직 못 잡은 용품이에요."}</p>
      <div className="collection-grid mt-3">
        {GEARS.map((g, i) => got.has(i) ? (
          <button key={i} type="button" className="collection-cell is-got" aria-label={`${g.name} 카드 보기`}
            onClick={() => window.dispatchEvent(new CustomEvent("r2u:spot-card", { detail: { g: i } }))}>
            <GearArt i={i} size={44} />
          </button>
        ) : (
          <span key={i} className="collection-cell" aria-label="아직 못 잡은 용품"><GearArt i={i} size={44} /></span>
        ))}
      </div>
    </details>
  );
}
