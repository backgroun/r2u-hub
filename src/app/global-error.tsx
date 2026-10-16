"use client";

/** 화면 전체를 그리지 못했을 때의 마지막 안내 (스타일 파일 없이도 보이게 직접 꾸민다) */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#0b0b0c", color: "#f2f2f3", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", textAlign: "center", padding: 24 }}>
        <div style={{ maxWidth: 340 }}>
          <div style={{ fontSize: 34 }} aria-hidden>🛠️</div>
          <h1 style={{ fontSize: 18, margin: "12px 0 8px" }}>잠시 데이터를 불러오지 못했어요</h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 16px" }}>접속이 몰리거나 서비스를 점검하고 있을 수 있어요. 잠시 뒤에 다시 시도해 주세요.</p>
          <button type="button" onClick={() => reset()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#ff8a3d", color: "#1b1008", fontWeight: 700 }}>다시 시도</button>
        </div>
      </body>
    </html>
  );
}
