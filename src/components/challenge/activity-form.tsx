"use client";
import { ActionForm, Submit } from "@/components/action-form";
import PhotoField from "@/components/challenge/photo-field";
import { submitActivityAction } from "@/app/challenge-actions";
import { SURFACE_LABEL, type Activity, type Surface } from "@/lib/challenge/rules";

const SECTION = "rounded-lg border border-[var(--line)] p-3";

/** 기록 올리기·수정 폼. 활동 요약 캡처는 필수, 케이던스·Zone 2·장소는 해당할 때만 값과 캡처를 함께 채운다. */
export default function ActivityForm({ blockId, start, end, today, initial }: { blockId: string; start: string; end: string; today: string; initial?: Activity }) {
  const max = today < end ? today : end;
  const dur = initial?.durationSec ?? 0;
  return (
    <ActionForm action={submitActivityAction} keep={!!initial} restoreOnError className="grid gap-3">
      <input type="hidden" name="id" value={blockId} />
      {initial && <input type="hidden" name="actId" value={initial.id} />}
      <label className="field"><span className="label">시작 일시 (한국 시간)</span>
        <input name="startedAt" type="datetime-local" className="input" required min={`${start}T00:00`} max={`${max}T23:59`} defaultValue={initial?.startedAt ?? `${max}T06:00`} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field"><span className="label">거리 (km)</span>
          <input name="distanceKm" inputMode="decimal" className="input" required placeholder="예: 10.05" defaultValue={initial?.distanceKm ?? ""} /></label>
        <label className="field"><span className="label">종류</span>
          <select name="surface" className="input" defaultValue={initial?.surface ?? "road"}>
            {(Object.keys(SURFACE_LABEL) as Surface[]).map((s) => <option key={s} value={s}>{SURFACE_LABEL[s]}</option>)}
          </select></label>
      </div>
      <div className="field"><span className="label">시간</span>
        <div className="grid grid-cols-3 gap-2">
          <input name="durH" type="number" min={0} max={23} inputMode="numeric" className="input" placeholder="시" defaultValue={dur ? Math.floor(dur / 3600) : ""} aria-label="시" />
          <input name="durM" type="number" min={0} max={59} inputMode="numeric" className="input" placeholder="분" defaultValue={dur ? Math.floor((dur % 3600) / 60) : ""} aria-label="분" />
          <input name="durS" type="number" min={0} max={59} inputMode="numeric" className="input" placeholder="초" defaultValue={dur ? dur % 60 : ""} aria-label="초" />
        </div>
        <span className="text-xs text-muted">평균 페이스는 거리와 시간으로 자동 계산돼요.</span>
      </div>
      <PhotoField name="img_summary" label="활동 요약 캡처" required hint="날짜·거리·시간이 보이는 화면이에요. 편집한 캡처는 실격이에요." have={!!initial?.imgs.summary} />

      <details className={SECTION} open={initial?.cadence != null}>
        <summary className="font-bold cursor-pointer text-sm">케이던스 부문 (10km 이상 활동)</summary>
        <div className="grid gap-2 pt-2">
          <label className="field"><span className="label">평균 케이던스 (spm)</span>
            <input name="cadence" inputMode="numeric" className="input" placeholder="예: 178" defaultValue={initial?.cadence ?? ""} /></label>
          <PhotoField name="img_cadence" label="케이던스가 보이는 캡처" have={!!initial?.imgs.cadence} />
        </div>
      </details>

      <details className={SECTION} open={initial?.zone2Pct != null}>
        <summary className="font-bold cursor-pointer text-sm">Zone 2 부문 (80% 이상)</summary>
        <div className="grid gap-2 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="field"><span className="label">Zone 2 체류 비율 (%)</span>
              <input name="zone2Pct" inputMode="numeric" className="input" placeholder="예: 85" defaultValue={initial?.zone2Pct ?? ""} /></label>
            <label className="field"><span className="label">평균 심박</span>
              <input name="avgHr" inputMode="numeric" className="input" placeholder="예: 140" defaultValue={initial?.avgHr ?? ""} /></label>
          </div>
          <PhotoField name="img_zone" label="심박 구간 캡처" hint="존 번호와 비율이 보여야 해요. 본인 기기의 5존 기준이에요." have={!!initial?.imgs.zone} />
        </div>
      </details>

      <details className={SECTION} open={!!initial?.place}>
        <summary className="font-bold cursor-pointer text-sm">다양한 장소 부문 (40분 이상 · 트레드밀 제외)</summary>
        <div className="grid gap-2 pt-2">
          <label className="field"><span className="label">장소 (구 + 공원·코스명)</span>
            <input name="place" className="input" maxLength={40} placeholder="예: 송파구 올림픽공원" defaultValue={initial?.place ?? ""} /></label>
          <PhotoField name="img_map" label="지도(경로) 캡처" hint="출발 지점이 보이는 지도 화면이에요." have={!!initial?.imgs.map} />
        </div>
      </details>

      <div><Submit pendingText="올리는 중…">{initial ? "수정 저장" : "기록 올리기"}</Submit></div>
    </ActionForm>
  );
}
