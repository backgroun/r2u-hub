"use client";
import { GEARS, GearArt } from "@/components/gear-art";

/* 로컬 전용: 러닝 용품 일러스트 전체를 한눈에 본다 (진짜 러너는 layout에서 차례대로 튕긴다) */
export default function Demo() {
  return (
    <main style={{ minHeight: "100vh", padding: 16 }}>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>러닝 용품 {GEARS.length}종 미리보기</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 8 }}>
        {GEARS.map((g, i) => (
          <div key={g.name + i} style={{ display: "grid", justifyItems: "center", gap: 2, padding: 6, borderRadius: 10, background: "var(--card)" }}>
            <GearArt i={i} size={56} />
            <span style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", lineHeight: 1.2 }}>{i + 1}. {g.name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
