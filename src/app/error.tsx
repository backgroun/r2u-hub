"use client";

/** 데이터 저장소가 잠깐 응답하지 않을 때(요청 한도 초과·점검 등) 흰 오류 화면 대신 보여 주는 안내 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="hub-wrap" style={{ display: "grid", placeItems: "center", minHeight: "70dvh", textAlign: "center" }}>
      <div className="panel p-6 grid gap-3" style={{ maxWidth: 360 }}>
        <span style={{ fontSize: 34 }} aria-hidden>🛠️</span>
        <h1 className="font-bold text-lg">잠시 데이터를 불러오지 못했어요</h1>
        <p className="text-sm text-muted">접속이 몰리거나 서비스를 점검하고 있을 수 있어요. 잠시 뒤에 다시 시도해 주세요. 입력하신 내용은 안전하게 저장돼 있어요.</p>
        <button type="button" className="btn btn-primary justify-center" onClick={() => reset()}>다시 시도</button>
      </div>
    </main>
  );
}
