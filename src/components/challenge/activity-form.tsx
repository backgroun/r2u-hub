"use client";
import { ActionForm, Submit } from "@/components/action-form";
import PhotoField from "@/components/challenge/photo-field";
import KakaoPlaceField from "@/components/kakao-place-field";
import { submitActivityAction } from "@/app/challenge-actions";
import { useState } from "react";
import { RULE, SURFACE_LABEL, fmtPace, paceSecOf, type Activity, type Surface } from "@/lib/challenge/rules";

const SECTION = "rounded-lg border border-[var(--line)] p-3";
/** 케이던스·Zone 2 는 가장 좋은 기록 한 번만 인증한다는 표시 */
const BEST = <span className="chip chip-open shrink-0" style={{ fontSize: 11 }}>최고기록 1회 인증</span>;
/** 섹션 제목: 뱃지를 제목 앞에 둔다 */
const Title = ({ children }: { children: React.ReactNode }) => <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{BEST}<span>{children}</span></span>;

const SLOW = 600, FAST = 180; // 게이지 범위: km당 10:00(느림) ~ 3:00(빠름)

/** 입력 중인 거리·시간으로 평균 페이스를 속도계처럼 보여 준다. 기준선(8:00/km) 안쪽이면 인정, 느리면 제외. */
function PaceGauge({ pace }: { pace: number | null }) {
  const ok = pace != null && pace <= RULE.maxPaceSec;
  const pos = (sec: number) => `${Math.max(0, Math.min(1, (SLOW - sec) / (SLOW - FAST))) * 100}%`;
  return (
    <div className="ch-gauge" data-state={pace == null ? "idle" : ok ? "ok" : "slow"} aria-live="polite">
      <div className="ch-gauge-bar" aria-hidden>
        <i style={{ width: pace == null ? "0%" : pos(pace) }} />
        <b style={{ left: pos(RULE.maxPaceSec) }} />
        {pace != null && <em style={{ left: pos(pace) }} />}
      </div>
      <p className="ch-gauge-t">
        {pace == null ? "거리와 시간을 적으면 평균 페이스가 여기 나와요" : <><b className="num">{fmtPace(pace)}</b>/km · {ok ? "인정 페이스!" : `${fmtPace(RULE.maxPaceSec)}보다 느려서 거리·시간 등에서 빠져요`}</>}
      </p>
    </div>
  );
}

/** 기준에 못 미쳐 입력할 수 없는 선택 부문: 흐리게 보이고 입력칸은 아예 없다(저장할 때도 값이 가지 않는다). */
function Locked({ title, reason }: { title: React.ReactNode; reason: string }) {
  return (
    <div className={SECTION} style={{ opacity: 0.55 }} aria-disabled="true">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"><b>{title}</b><span className="text-xs text-muted">{reason}</span></div>
    </div>
  );
}

/** 기록 올리기·수정 폼. 활동 요약 캡처는 필수, 케이던스·Zone 2·장소는 해당할 때만 값과 캡처를 함께 채운다. */
export default function ActivityForm({ blockId, start, end, now, initial }: { blockId: string; start: string; end: string; now: string; initial?: Activity }) {
  const max = now < end ? now : end; // 기록은 지금보다 미래일 수 없고 종료 시각을 넘을 수 없다
  const dur = initial?.durationSec ?? 0;
  // 입력 중인 거리·시간·종류·Zone 2 비율: 평균 페이스를 보여 주고, 기준에 못 미치는 선택 부문을 비활성으로 만든다
  const [run, setRun] = useState<{ km: number | null; sec: number; surface: string; z2: number | null }>({ km: initial?.distanceKm ?? null, sec: dur, surface: initial?.surface ?? "road", z2: initial?.zone2Pct ?? null });
  const onAny = (e: React.FormEvent<HTMLDivElement>) => {
    // 이벤트 대상(currentTarget)은 이 함수가 끝나면 사라지므로, 값은 여기서 바로 읽어 둔다(상태 갱신 함수 안에서 읽으면 null 이 된다)
    const root = e.currentTarget;
    const q = (n: string) => (root.querySelector(`[name="${n}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value;
    const km = parseFloat((q("distanceKm") ?? "").replace(",", "."));
    const sec = (Number(q("durH")) || 0) * 3600 + (Number(q("durM")) || 0) * 60;
    const surface = q("surface");
    const z2Raw = q("zone2Pct"), z2 = parseFloat(z2Raw ?? "");
    setRun((r) => ({ km: km > 0 ? km : null, sec, surface: surface ?? r.surface, z2: z2Raw !== undefined ? (Number.isFinite(z2) ? z2 : null) : r.z2 }));
  };
  const pace = run.km && run.sec >= 60 ? paceSecOf(run.km, run.sec) : null;
  const cadenceOff = run.km != null && run.km < RULE.cadenceMinKm; // 거리를 적었는데 10km보다 짧으면
  const placeOff = run.surface === "treadmill" || (run.sec > 0 && run.sec < RULE.placeMinSec); // 트레드밀이거나 40분보다 짧으면
  return (
    <ActionForm action={submitActivityAction} keep={!!initial} restoreOnError className="grid gap-3">
      <div className="contents" onInput={onAny}>
      <input type="hidden" name="id" value={blockId} />
      {initial && <input type="hidden" name="actId" value={initial.id} />}
      <div className="flex items-center gap-2">
        <label htmlFor="run-date" className="label shrink-0 whitespace-nowrap">러닝 일자</label>
        <input id="run-date" name="runDate" type="date" className="input min-w-0 flex-[3]" style={{ width: "auto" }} required min={start.slice(0, 10)} max={max.slice(0, 10)} defaultValue={initial?.date ?? max.slice(0, 10)} />
        <select name="surface" aria-label="종류" className="input min-w-0 flex-[2]" style={{ width: "auto" }} defaultValue={initial?.surface ?? "road"}>
          {(["road", "treadmill"] as Surface[]).map((k) => <option key={k} value={k}>{SURFACE_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="field">
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <label className="field min-w-0"><span className="label">거리 (km)</span>
            <input name="distanceKm" inputMode="decimal" className="input min-w-0" required placeholder="10.05" defaultValue={initial?.distanceKm ?? ""} /></label>
          <label className="field min-w-0"><span className="label">시간 (시)</span>
            <input name="durH" type="number" min={0} max={23} inputMode="numeric" className="input min-w-0" placeholder="1" defaultValue={dur ? Math.floor(dur / 3600) : ""} /></label>
          <label className="field min-w-0"><span className="label">시간 (분)</span>
            <input name="durM" type="number" min={0} max={59} inputMode="numeric" className="input min-w-0" placeholder="30" defaultValue={dur ? Math.floor((dur % 3600) / 60) : ""} /></label>
        </div>
        <PaceGauge pace={pace} />
      </div>
      <PhotoField name="img_summary" label="활동 요약 캡처" required inline have={!!initial?.imgs.summary} />

      {cadenceOff ? <Locked title={<Title>케이던스 부문</Title>} reason={`${RULE.cadenceMinKm}km 이상 달린 기록만 입력할 수 있어요`} /> : (
        <details className={SECTION} open={initial?.cadence != null}>
          <summary className="font-bold cursor-pointer text-sm"><Title>케이던스 부문 (10km 이상 활동)</Title></summary>
          <div className="grid gap-2 pt-2">
            <div className="grid grid-cols-2 items-start gap-3">
              <label className="field"><span className="label">평균 케이던스 (spm)</span>
                <input name="cadence" inputMode="numeric" className="input min-w-0" placeholder="예: 178" defaultValue={initial?.cadence ?? ""} /></label>
              <PhotoField name="img_cadence" label="케이던스 캡처" have={!!initial?.imgs.cadence} />
            </div>
            <p className="text-xs text-muted">{RULE.cadenceMinKm}km 이상 활동만 인정 · 더 높은 케이던스로 올리면 이전 케이던스 인증이 교체돼요</p>
          </div>
        </details>
      )}

      <details className={SECTION} open={initial?.zone2Pct != null}>
        <summary className="font-bold cursor-pointer text-sm"><Title>Zone 2 부문 (80% 이상)</Title></summary>
        <div className="grid gap-2 pt-2">
          <div className="grid grid-cols-2 items-start gap-3">
            <label className="field"><span className="label">Zone 2 체류 비율 (%)</span>
              <input name="zone2Pct" inputMode="numeric" className="input min-w-0" placeholder="예: 85" defaultValue={initial?.zone2Pct ?? ""} /></label>
            <label className="field"><span className="label">평균 심박</span>
              <input name="avgHr" inputMode="numeric" className="input min-w-0" placeholder="예: 140" defaultValue={initial?.avgHr ?? ""} /></label>
          </div>
          <PhotoField name="img_zone" label="심박 구간 캡처" have={!!initial?.imgs.zone} />
          <p className="text-xs" style={run.z2 != null && run.z2 < RULE.zone2MinPct ? { color: "var(--warn)", fontWeight: 700 } : { color: "var(--muted)" }}>{run.z2 != null && run.z2 < RULE.zone2MinPct ? `${RULE.zone2MinPct}% 미만은 인정되지 않아요` : "더 긴 거리의 기록으로 올리면 이전 Zone 2 인증이 교체돼요 · 존 번호·비율이 보이는 캡처"}</p>
        </div>
      </details>

      {placeOff ? <Locked title="다양한 장소 부문" reason={run.surface === "treadmill" ? "트레드밀은 입력할 수 없어요" : `${RULE.placeMinSec / 60}분 이상 달린 기록만 입력할 수 있어요`} /> : (
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
      )}

      </div>
      <div><Submit className="btn btn-primary ch-go w-full" pendingText="올리는 중…">{initial ? "수정 저장" : "기록 올리기 · 번호 받기"}</Submit></div>
    </ActionForm>
  );
}
