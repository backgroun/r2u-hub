import type { RaceFull } from "@/lib/hub";
import { saveRace } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import KakaoPlaceField from "@/components/kakao-place-field";

/** 대회 추가·수정 폼 (운영진 화면에서 쓴다) */
export default function RaceForm({ r }: { r?: RaceFull }) {
  return (
    <ActionForm action={saveRace} className="grid-2 mt-3" keep={!!r} collapse>
      {r && <input type="hidden" name="id" value={r.id} />}
      <label className="field full"><span className="label">대회명</span><input name="name" className="input" required defaultValue={r?.name} maxLength={60} /></label>
      <label className="field"><span className="label">대회 날짜</span><input name="date" type="date" className="input" required defaultValue={r?.date} /></label>
      <label className="field"><span className="label">출발 시간 (선택)</span><input name="time" type="time" className="input" defaultValue={r?.time} /></label>
      <div className="full"><KakaoPlaceField place={r?.place} address={r?.address} placeUrl={r?.placeUrl} /></div>
      <label className="field"><span className="label">접수 시작 (선택)</span><input name="regStart" type="datetime-local" className="input" defaultValue={r?.regStart} /></label>
      <label className="field"><span className="label">접수 마감 (선택)</span><input name="regEnd" type="datetime-local" className="input" defaultValue={r?.regEnd} /></label>
      <label className="field full"><span className="label">주최 측 접수 페이지 주소 (확인된 경우)</span><input name="regUrl" type="url" className="input" defaultValue={r?.regUrl} placeholder="https://" maxLength={500} /></label>
      {r?.reg && (
        <p className="full text-xs text-muted">
          예전 접수기간 표기: “{r.reg}” — 접수 시작·마감을 고르면 그 날짜로 바뀌어요.
          <input type="hidden" name="reg" value={r.reg} />
        </p>
      )}
      <label className="field full"><span className="label">메모</span><input name="note" className="input" defaultValue={r?.note} placeholder="집결 장소, 링크 등" maxLength={200} /></label>
      <div className="full"><Submit>{r ? "수정 저장" : "대회 추가"}</Submit></div>
    </ActionForm>
  );
}
