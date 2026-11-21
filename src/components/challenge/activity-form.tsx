"use client";
import { ActionForm, Submit } from "@/components/action-form";
import PhotoField from "@/components/challenge/photo-field";
import KakaoPlaceField from "@/components/kakao-place-field";
import { submitActivityAction } from "@/app/challenge-actions";
import type { Activity } from "@/lib/challenge/rules";

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
      </div>
      <input type="hidden" name="surface" value={initial?.surface ?? "road"} />
      <div className="field">
        <div className="grid grid-cols-2 gap-2">
          <label className="field"><span className="label">거리 (km)</span>
            <input name="distanceKm" inputMode="decimal" className="input min-w-0" required placeholder="예: 10.05" defaultValue={initial?.distanceKm ?? ""} /></label>
          <label className="field"><span className="label">달린 시간 (분)</span>
            <input name="durM" type="number" min={1} max={1440} inputMode="numeric" className="input min-w-0" required placeholder="예: 90" defaultValue={dur ? Math.round(dur / 60) : ""} /></label>
        </div>
        <span className="text-xs text-muted">시간은 분으로 한 번에 적어요. (1시간 30분 = 90) 평균 페이스는 거리와 시간으로 자동 계산돼요.</span>
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
          {/* 카카오 장소 검색으로 고르고, 검색이 안 되면 같은 칸에 직접 입력한다. 같은 장소는 이름이 같아야 한 곳으로 세어지므로 가능하면 검색 결과를 골라 주세요. */}
          <KakaoPlaceField label="장소 (검색해서 고르거나 직접 입력)" placeholder="예: 올림픽공원" place={initial?.place ?? ""} allowUndecided={false} />
          <p className="text-xs text-muted">같은 장소를 여러 번 올려도 한 곳으로만 세어요. 검색에서 고르면 이름이 똑같이 맞춰져요.</p>
          <PhotoField name="img_map" label="지도(경로) 캡처" hint="출발 지점이 보이는 지도 화면이에요." have={!!initial?.imgs.map} />
        </div>
      </details>

      <div><Submit pendingText="올리는 중…">{initial ? "수정 저장" : "기록 올리기"}</Submit></div>
    </ActionForm>
  );
}
