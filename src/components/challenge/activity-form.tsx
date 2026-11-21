"use client";
import { ActionForm, Submit } from "@/components/action-form";
import PhotoField from "@/components/challenge/photo-field";
import KakaoPlaceField from "@/components/kakao-place-field";
import { submitActivityAction } from "@/app/challenge-actions";
import { SURFACE_LABEL, durationInput, type Activity, type Surface } from "@/lib/challenge/rules";

const SECTION = "rounded-lg border border-[var(--line)] p-3";

/** 기록 올리기·수정 폼. 활동 요약 캡처는 필수, 케이던스·Zone 2·장소는 해당할 때만 값과 캡처를 함께 채운다. */
export default function ActivityForm({ blockId, start, end, now, initial }: { blockId: string; start: string; end: string; now: string; initial?: Activity }) {
  const max = now < end ? now : end; // 기록은 지금보다 미래일 수 없고 종료 시각을 넘을 수 없다
  const dur = initial?.durationSec ?? 0;
  return (
    <ActionForm action={submitActivityAction} keep={!!initial} restoreOnError className="grid gap-3">
      <input type="hidden" name="id" value={blockId} />
      {initial && <input type="hidden" name="actId" value={initial.id} />}
      <div className="flex items-center gap-2">
        <label htmlFor="run-date" className="label shrink-0 whitespace-nowrap">러닝 일자</label>
        <input id="run-date" name="runDate" type="date" className="input grow min-w-0" required min={start.slice(0, 10)} max={max.slice(0, 10)} defaultValue={initial?.date ?? max.slice(0, 10)} />
        <select name="surface" aria-label="종류" className="input shrink-0 min-w-0" style={{ width: "auto" }} defaultValue={initial?.surface ?? "road"}>
          {(Object.keys(SURFACE_LABEL) as Surface[]).map((k) => <option key={k} value={k}>{SURFACE_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="field">
        <div className="grid grid-cols-2 gap-2">
          <label className="field"><span className="label">거리 (km)</span>
            <input name="distanceKm" inputMode="decimal" className="input min-w-0" required placeholder="예: 10.05" defaultValue={initial?.distanceKm ?? ""} /></label>
          <label className="field"><span className="label">달린 시간 (시:분)</span>
            <input name="dur" inputMode="text" autoComplete="off" className="input min-w-0" required placeholder="예: 1:30" defaultValue={dur ? durationInput(dur) : ""} /></label>
        </div>
        <span className="text-xs text-muted">시간은 한 칸에 적어요. (1:30 · 1시간 30분 · 90분이면 90) 평균 페이스는 거리와 시간으로 자동 계산돼요.</span>
      </div>
      <PhotoField name="img_summary" label="활동 요약 캡처" required hint="날짜·거리·시간이 보이는 화면이에요. 편집한 캡처는 실격이에요." have={!!initial?.imgs.summary} />

      <details className={SECTION} open={initial?.cadence != null}>
        <summary className="font-bold cursor-pointer text-sm">케이던스 부문 (10km 이상 활동)</summary>
        <div className="grid gap-2 pt-2">
          <div className="grid grid-cols-2 items-start gap-3">
            <label className="field"><span className="label">평균 케이던스 (spm)</span>
              <input name="cadence" inputMode="numeric" className="input min-w-0" placeholder="예: 178" defaultValue={initial?.cadence ?? ""} /></label>
            <PhotoField name="img_cadence" label="케이던스 캡처" have={!!initial?.imgs.cadence} />
          </div>
          <p className="text-xs text-muted">10km 이상 활동만 인정 · 케이던스가 보이는 캡처</p>
        </div>
      </details>

      <details className={SECTION} open={initial?.zone2Pct != null}>
        <summary className="font-bold cursor-pointer text-sm">Zone 2 부문 (80% 이상)</summary>
        <div className="grid gap-2 pt-2">
          <div className="grid grid-cols-2 items-start gap-3">
            <label className="field"><span className="label">Zone 2 체류 비율 (%)</span>
              <input name="zone2Pct" inputMode="numeric" className="input min-w-0" placeholder="예: 85" defaultValue={initial?.zone2Pct ?? ""} /></label>
            <label className="field"><span className="label">평균 심박</span>
              <input name="avgHr" inputMode="numeric" className="input min-w-0" placeholder="예: 140" defaultValue={initial?.avgHr ?? ""} /></label>
          </div>
          <PhotoField name="img_zone" label="심박 구간 캡처" have={!!initial?.imgs.zone} />
          <p className="text-xs text-muted">존 번호·비율이 보이는 캡처 · 본인 기기의 5존 기준</p>
        </div>
      </details>

      <details className={SECTION} open={!!initial?.place}>
        <summary className="font-bold cursor-pointer text-sm">다양한 장소 부문 (40분 이상 · 트레드밀 제외)</summary>
        <div className="grid gap-2 pt-2">
          {/* 카카오 장소 검색으로 고르고, 검색이 안 되면 같은 칸에 직접 입력한다. 같은 장소는 이름이 같아야 한 곳으로 세어지므로 가능하면 검색 결과를 골라 주세요. */}
          <div className="grid grid-cols-2 items-start gap-3">
            <KakaoPlaceField label="장소 (검색·직접 입력)" placeholder="예: 올림픽공원" place={initial?.place ?? ""} allowUndecided={false} />
            <PhotoField name="img_map" label="지도 캡처" have={!!initial?.imgs.map} />
          </div>
          <p className="text-xs text-muted">같은 장소는 한 곳으로만 세요 · 출발 지점이 보이는 지도 캡처</p>
        </div>
      </details>

      <div><Submit pendingText="올리는 중…">{initial ? "수정 저장" : "기록 올리기"}</Submit></div>
    </ActionForm>
  );
}
