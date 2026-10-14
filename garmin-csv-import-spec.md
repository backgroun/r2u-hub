# 가민 CSV 업로드 → 러닝 기록 분석·누적 기능 개발 명세서

> **이 문서를 받은 AI/개발자에게**
> 러닝크루 웹앱에 "가민 커넥트에서 내려받은 활동 CSV를 그대로 올리면, 러닝만 골라 분석하고 사용자 기록으로 누적하는 기능"을 만든다.
> 아래 명세(파싱 규칙, 합산 규칙, 중복 처리, 테스트 기대값)를 **그대로** 따르면 된다. 정책 결정은 이미 끝났으니 다시 논의하지 말고 구현한다.
> 프로젝트 스택이 정해져 있지 않으면 **§10의 Phase 0(단일 HTML 프로토타입)**부터 만든다.

---

## 1. 배경 및 확정된 결정

### 1.1 목표
- 크루원이 **PC에서 가민 커넥트 → 활동 목록 → "CSV 내보내기"**로 받은 파일을 **수정 없이 그대로** 크루 앱에 업로드한다.
- 앱은 러닝만 골라 저장하고, **하루 단위로 합산**해서 보여주며, 여러 번 올려도 **중복 없이 누적**된다.
- 수동으로 입력한 기록이 있는 날은 가민 데이터로 대체(심박·케이던스·훈련효과 등 보강)한다.

### 1.2 검토 후 제외한 방법 (다시 제안하지 말 것)
| 방법 | 제외 이유 |
|---|---|
| Garmin Connect Developer API | 2026년 현재 신규 신청 중단 상태 + 사업자 필요(운영자는 사업자 없음) |
| Strava API | API 약관상 사용자 데이터를 **본인에게만** 표시 가능 → 크루 랭킹/피드 불가 |
| 모바일 브라우저에서 CSV 받기 | 실제 테스트 결과 모바일에서 동작 안 함 |
| 스크린샷 + OCR/AI 판독 | 사용자 부담이 큼(매번 캡처·업로드·확인) |
| 가민 웹 자동 조작/ID·PW 대리 로그인 | 약관 위반 위험, 보안 책임, 쉽게 고장남 |
| Terra/ROOK 등 통합 API | 월 $300~500, MVP 단계에 과함 |

### 1.3 향후 로드맵 (이번 범위 아님)
- 웹앱을 Capacitor로 감싼 안드로이드 앱($25) → Health Connect 연동으로 NRC·삼성헬스·가민 자동 수집 → 이후 iOS(HealthKit, 연 $99).
- 따라서 DB의 `source` 필드는 확장 가능하게 둔다 (`garmin_csv`, `manual`, 추후 `health_connect`, `healthkit`).

### 1.4 PC를 못 쓰는 크루원
- 이번 범위에서는 **간단한 수동 입력 폼**(날짜·거리·시간)으로 대응. 날짜 기본값 = 오늘, 숫자 키패드(`inputmode="decimal"`).

---

## 2. 입력 파일 사양 (실제 파일로 확인됨)

- 파일명: `Activities.csv` (가민 커넥트 웹 → 활동 목록 → 우측 상단 "CSV 내보내기")
- 인코딩: **UTF-8, BOM 없음** → 엑셀(한국어 윈도우)에서 열면 한글이 깨지지만 파일은 정상.
- 구분자: 쉼표. 첫 행은 헤더. `날짜` 컬럼만 따옴표 없음, 나머지 값은 대부분 `"..."`로 감싸짐.
- **화면에 로드된(스크롤한) 활동까지만 내보내질 수 있음** → 사용자 안내 필요.
- 사용자의 가민 언어 설정에 따라 **헤더와 활동 종류명이 한글/영문**으로 달라짐.
- 사용자의 단위 설정이 마일이면 거리/페이스가 mi 기준 → §3.4 참고.

### 2.1 헤더 (한글, 38개, 순서 그대로)
```
활동 종류,날짜,즐겨찾기,제목,거리,칼로리,시간,평균 심박,최대심박,유산소 훈련 효과,평균 달리기 케이던스,최고 달리기 케이던스,평균 페이스,최대 페이스,총 상승,총 하강,평균 보폭,평균 수직 비율,평균 수직 진동,평균 지면 접촉 시간,평균 GAP,Normalized Power® (NP®),Training Stress Score®,평균 파워,최대 파워,걸음,바디 배터리 방전,최저 온도,감압,최고 랩 기록,랩 수,최고 온도,평균 스트레스,최대 스트레스,이동 시간,경과 시간,최저 해발,최고 해발
```

### 2.2 샘플 행 (실제 데이터)
```
러닝,2026-05-09 09:45:20,false,"동두천 핫피자런","13.07","731","01:24:13","156","170","5.0","185","198","6:27","4:33","5","35","0.83","8.8","7.3","243","6:30","206","0.0","205","320","15,608","'-24","22.0","아니오","00:00:22.9","14","29.0","--","--","01:23:56","01:45:49","58","88"
스텝퍼,2026-08-04 06:46:33,false,"스텝퍼","0.00","109","00:30:05","102","117","0.7","116","158","--","--","--","--","0.00","--","--","--","--","--","0.0","--","--","3,606","--","--","아니오","00:30:05","1","--","--","--","00:00:00","00:30:05","--","--"
러닝,2026-03-24 23:40:14,false,"러닝","0.00","--","00:00:00","--","--","--","--","--","--","--","--","--","--","--","--","--","--","--","0.0","--","--","--","--","--","아니오","00:00:00","1","--","0","0","--:--:--","00:00:00","--","--"
```

### 2.3 값 형식과 처리 규칙
| 형식 | 예시 | 처리 |
|---|---|---|
| 값 없음 | `--`, `--:--:--`, 빈 문자열 | `null` |
| 천 단위 쉼표 | `15,608` | 쉼표 제거 후 숫자 |
| 앞 작은따옴표 | `'-24` (엑셀 수식 방지용) | `'` 제거 후 숫자 |
| 시간 | `01:24:13`, `00:00:22.9` | 초(sec, 소수 허용) |
| 페이스 | `6:27` (분:초/km) | 초/km (387) |
| 불리언 | `false`, `아니오` | 사용 안 함 |
| 날짜 | `2026-05-09 09:45:20` | 가민 표시 시간대 기준 **현지 시각, 초 단위 포함** |

---

## 3. 파싱 규칙

### 3.1 파일 읽기 (브라우저에서 처리)
1. **파싱은 브라우저에서** 한다. 서버에는 요약 JSON만 보낸다. (용량·서버비용 절감, 원본 파일 미보관)
2. `ArrayBuffer`로 읽어서 `TextDecoder('utf-8')`로 디코딩. 맨 앞 BOM(`﻿`)이 있으면 제거.
3. 헤더에서 `활동 종류`/`Activity Type`과 `날짜`/`Date`를 찾지 못하면 → `TextDecoder('euc-kr')`로 재시도 (사용자가 엑셀로 열고 저장해서 CP949가 된 경우).
4. 그래도 못 찾으면 에러: **"가민 활동 목록 CSV 파일이 아닙니다. 가민 커넥트 → 활동 → CSV 내보내기로 받은 파일을 그대로 올려주세요."**
5. CSV 파싱은 PapaParse(`header: true, skipEmptyLines: true`) 사용. 따옴표 안의 쉼표 처리를 위해 직접 split 금지.

### 3.2 컬럼 매핑
**헤더 이름으로 찾는다(위치 인덱스 사용 금지).** 영문 헤더는 추정값이니 실제 영문 CSV로 검증할 것.

| 필드 (코드) | 한글 헤더 | 영문 헤더 (추정) | 파서 | 저장 |
|---|---|---|---|---|
| activityType | 활동 종류 | Activity Type | 문자열 | ✅ |
| startedAt | 날짜 | Date | 문자열 그대로 | ✅ (고유키) |
| title | 제목 | Title | 문자열 | ✅ |
| distanceKm | 거리 | Distance | num | ✅ |
| calories | 칼로리 | Calories | num | ✅ |
| durationSec | 시간 | Time | sec | ✅ |
| avgHr | 평균 심박 | Avg HR | num | ✅ |
| maxHr | 최대심박 | Max HR | num | ✅ |
| aerobicTE | 유산소 훈련 효과 | Aerobic TE | num | ✅ |
| avgCadence | 평균 달리기 케이던스 | Avg Run Cadence | num | ✅ |
| maxCadence | 최고 달리기 케이던스 | Max Run Cadence | num | ✅ |
| avgPaceSec | 평균 페이스 | Avg Pace | sec | ✅ |
| bestPaceSec | 최대 페이스 | Best Pace | sec | ✅ |
| elevGainM | 총 상승 | Total Ascent | num | ✅ |
| elevLossM | 총 하강 | Total Descent | num | ✅ |
| avgStrideM | 평균 보폭 | Avg Stride Length | num | ✅ |
| avgVerticalRatio | 평균 수직 비율 | Avg Vertical Ratio | num | ✅ |
| avgVerticalOscCm | 평균 수직 진동 | Avg Vertical Oscillation | num | ✅ |
| avgGctMs | 평균 지면 접촉 시간 | Avg Ground Contact Time | num | ✅ |
| avgGapSec | 평균 GAP | Avg GAP | sec | ✅ |
| npW | Normalized Power® (NP®) | Normalized Power® (NP®) | num | ✅ |
| avgPowerW | 평균 파워 | Avg Power | num | ✅ |
| maxPowerW | 최대 파워 | Max Power | num | ✅ |
| steps | 걸음 | Steps | num | ✅ |
| laps | 랩 수 | Number of Laps | num | ✅ |
| minTempC | 최저 온도 | Min Temp | num | ✅ |
| maxTempC | 최고 온도 | Max Temp | num | ✅ |
| movingSec | 이동 시간 | Moving Time | sec | ✅ |
| elapsedSec | 경과 시간 | Elapsed Time | sec | ✅ |
| (무시) | 즐겨찾기, Training Stress Score®, 바디 배터리 방전, 감압, 최고 랩 기록, 평균/최대 스트레스, 최저/최고 해발 | | | 원본 JSON에만 |

- 원본 행 전체는 `raw` JSON으로 함께 저장한다 (나중에 필드 추가 시 재처리용).
- CSV에 **없는** 데이터: 무산소 훈련 효과, 훈련 부하, VO2max, 심박 구간, GPS 경로. 만들지 말 것.

### 3.3 필터링 (저장 대상 = 러닝만)
- 러닝 종류: `러닝`, `트레드밀 러닝`, `트레일 러닝`, `Running`, `Treadmill Running`, `Trail Running` (상수 배열로 관리, 쉽게 수정 가능하게)
- 제외 사유를 집계해서 미리보기에 표시:
  - `러닝 아님` (스텝퍼, 하이킹 등)
  - `빈 기록` (거리 ≤ 0 또는 시간 ≤ 0)
  - `의심 기록` (시간÷거리 < 150초/km = 2:30/km보다 빠름. CSV의 평균 페이스 컬럼은 편집돼도 안 맞을 수 있으니 직접 계산) → 저장은 하되 `flagged=true`, 랭킹 제외 (운영진 확인용)

### 3.4 단위
- 기본은 km로 간주.
- 업로드 화면에 "가민 단위: km / mi" 선택(기본 km). mi이면 거리 × 1.609344, 페이스 ÷ 1.609344로 변환.
- 저장은 항상 km, 초/km.

### 3.5 참고 코드 (브라우저)
```js
import Papa from 'papaparse';

export const RUN_TYPES = ['러닝', '트레드밀 러닝', '트레일 러닝', 'Running', 'Treadmill Running', 'Trail Running'];

const num = v => {
  if (v == null) return null;
  const s = String(v).trim().replace(/[,']/g, '');
  if (s === '' || s.startsWith('--')) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const sec = v => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s.includes('--')) return null;
  const n = s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  return Number.isFinite(n) ? n : null;
};

const HEADERS = {
  activityType: ['활동 종류', 'Activity Type'],
  startedAt:    ['날짜', 'Date'],
  title:        ['제목', 'Title'],
  distanceKm:   ['거리', 'Distance'],
  calories:     ['칼로리', 'Calories'],
  durationSec:  ['시간', 'Time'],
  avgHr:        ['평균 심박', 'Avg HR'],
  maxHr:        ['최대심박', 'Max HR'],
  aerobicTE:    ['유산소 훈련 효과', 'Aerobic TE'],
  avgCadence:   ['평균 달리기 케이던스', 'Avg Run Cadence'],
  maxCadence:   ['최고 달리기 케이던스', 'Max Run Cadence'],
  avgPaceSec:   ['평균 페이스', 'Avg Pace'],
  bestPaceSec:  ['최대 페이스', 'Best Pace'],
  elevGainM:    ['총 상승', 'Total Ascent'],
  elevLossM:    ['총 하강', 'Total Descent'],
  avgStrideM:   ['평균 보폭', 'Avg Stride Length'],
  avgVerticalRatio: ['평균 수직 비율', 'Avg Vertical Ratio'],
  avgVerticalOscCm: ['평균 수직 진동', 'Avg Vertical Oscillation'],
  avgGctMs:     ['평균 지면 접촉 시간', 'Avg Ground Contact Time'],
  avgGapSec:    ['평균 GAP', 'Avg GAP'],
  npW:          ['Normalized Power® (NP®)'],
  avgPowerW:    ['평균 파워', 'Avg Power'],
  maxPowerW:    ['최대 파워', 'Max Power'],
  steps:        ['걸음', 'Steps'],
  laps:         ['랩 수', 'Number of Laps'],
  minTempC:     ['최저 온도', 'Min Temp'],
  maxTempC:     ['최고 온도', 'Max Temp'],
  movingSec:    ['이동 시간', 'Moving Time'],
  elapsedSec:   ['경과 시간', 'Elapsed Time'],
};
const SEC_FIELDS = new Set(['durationSec', 'avgPaceSec', 'bestPaceSec', 'avgGapSec', 'movingSec', 'elapsedSec']);
const STR_FIELDS = new Set(['activityType', 'startedAt', 'title']);

function decode(buffer) {
  const tryDecode = enc => new TextDecoder(enc).decode(buffer).replace(/^﻿/, '');
  const looksGarmin = t => /활동 종류|Activity Type/.test(t.split('\n')[0]);
  let text = tryDecode('utf-8');
  if (!looksGarmin(text)) text = tryDecode('euc-kr');
  if (!looksGarmin(text)) throw new Error('NOT_GARMIN_CSV');
  return text;
}

export async function parseGarminCsv(file) {
  const text = decode(await file.arrayBuffer());
  const { data, meta } = Papa.parse(text, { header: true, skipEmptyLines: true });
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([k, names]) => [k, names.find(n => meta.fields.includes(n))])
  );

  const runs = [], excluded = { notRun: 0, empty: 0 };
  for (const row of data) {
    const r = { raw: row };
    for (const [k, h] of Object.entries(col)) {
      const v = h ? row[h] : null;
      r[k] = STR_FIELDS.has(k) ? (v ?? '').trim() : SEC_FIELDS.has(k) ? sec(v) : num(v);
    }
    if (!RUN_TYPES.includes(r.activityType)) { excluded.notRun++; continue; }
    if (!(r.distanceKm > 0) || !(r.durationSec > 0)) { excluded.empty++; continue; }
    r.flagged = r.durationSec / r.distanceKm < 150;   // CSV 페이스 컬럼이 아니라 시간÷거리로 판정
    r.date = r.startedAt.slice(0, 10);
    runs.push(r);
  }
  return { runs, excluded, totalRows: data.length };
}
```

---

## 4. 저장 모델과 중복 처리

### 4.1 원칙
1. **러닝 1건 = 1행**으로 저장한다. **하루 합계는 저장하지 않고 조회 시 계산**한다. (같은 날짜에 몇 번 새로 올려도 항상 정확)
2. **고유키 = (user_id, started_at)**. 가민 날짜는 초 단위 시작 시각이라 같은 날 여러 건도 구분된다.
3. 업로드 시 각 러닝을 기존 데이터와 비교해 분류한다:
   - `new`: 고유키 없음 → 추가
   - `updated`: 고유키 있음 + 값이 다름(제목·거리·심박 등 수정됨) → 덮어쓰기
   - `unchanged`: 고유키 있음 + 값 동일 → 건너뜀
4. 기간 겹침은 신경 쓰지 않는다. 1~9월을 올리고 다음에 1~10월을 올려도 10월분만 추가된다.
5. 가민에서 **삭제한** 활동은 CSV로 알 수 없다 → 크루 앱에서 사용자가 직접 삭제(soft delete) 가능하게.

### 4.2 테이블 (PostgreSQL 기준, 다른 DB면 동등하게)
```sql
CREATE TABLE runs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  source          TEXT   NOT NULL DEFAULT 'garmin_csv',   -- 추후 health_connect, healthkit
  activity_type   TEXT   NOT NULL,
  started_at      TIMESTAMP NOT NULL,                     -- 현지 시각(Asia/Seoul), 시간대 없이 저장
  run_date        DATE   NOT NULL,                        -- started_at의 날짜 (시작 기준, 자정 넘겨도 시작일)
  title           TEXT,
  distance_km     NUMERIC(7,2) NOT NULL,
  duration_sec    NUMERIC(9,1) NOT NULL,
  moving_sec      NUMERIC(9,1),
  elapsed_sec     NUMERIC(9,1),
  calories        INT,
  avg_hr          INT,  max_hr INT,
  aerobic_te      NUMERIC(2,1),
  avg_cadence     INT,  max_cadence INT,
  avg_pace_sec    INT,  best_pace_sec INT, avg_gap_sec INT,
  elev_gain_m     INT,  elev_loss_m INT,
  avg_stride_m    NUMERIC(4,2),
  avg_vertical_ratio NUMERIC(4,1),
  avg_vertical_osc_cm NUMERIC(4,1),
  avg_gct_ms      INT,
  avg_power_w     INT,  max_power_w INT, np_w INT,
  steps           INT,  laps INT,
  min_temp_c      NUMERIC(4,1), max_temp_c NUMERIC(4,1),
  flagged         BOOLEAN NOT NULL DEFAULT FALSE,         -- 의심 기록 (랭킹 제외)
  deleted_at      TIMESTAMP,                              -- 사용자 삭제
  raw             JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (user_id, started_at)
);

CREATE TABLE manual_runs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  run_date     DATE   NOT NULL,
  distance_km  NUMERIC(7,2) NOT NULL,
  duration_sec INT,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'active',  -- active | replaced_by_garmin | separate
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);
```

### 4.3 업서트
```sql
INSERT INTO runs (user_id, started_at, run_date, activity_type, title, distance_km, duration_sec, ... , raw)
VALUES (...)
ON CONFLICT (user_id, started_at) DO UPDATE SET
  activity_type = EXCLUDED.activity_type,
  title         = EXCLUDED.title,
  distance_km   = EXCLUDED.distance_km,
  duration_sec  = EXCLUDED.duration_sec,
  -- … 나머지 측정값 전부 동일하게 …
  raw           = EXCLUDED.raw,
  updated_at    = now()
WHERE runs.deleted_at IS NULL;   -- 사용자가 지운 기록은 되살리지 않음
```
- 한 번의 업로드는 **하나의 트랜잭션**으로 처리.

---

## 5. 하루 합산 규칙 (핵심)

같은 `run_date`의 러닝(삭제·의심 제외 옵션 적용)을 묶어 **하루 기록 1건**으로 보여준다.

| 방식 | 필드 | 비고 |
|---|---|---|
| **합계** | distance_km, duration_sec, moving_sec, elapsed_sec, calories, steps, elev_gain_m, elev_loss_m, laps | 값이 있는 것만 더함. 전부 null이면 null |
| **최댓값** | max_hr, max_cadence, max_power_w, aerobic_te | 훈련효과는 0~5 점수라 더하지 않고 그날 최고값 |
| **최솟값** | best_pace_sec (가장 빠른 페이스) | |
| **재계산** | avg_pace_sec = **총 duration_sec ÷ 총 distance_km** | ⚠️ 페이스끼리 평균 내기 금지 |
| **시간 가중 평균** | avg_hr, avg_cadence, avg_stride_m, avg_vertical_ratio, avg_vertical_osc_cm, avg_gct_ms, avg_power_w, np_w, avg_gap_sec | 가중치 = duration_sec. **그 필드 값이 있는 러닝만** 분자·분모에 포함 (예: 트레드밀은 GAP 없음) |
| **목록** | run_count, titles[] | 하루 상세 펼치기용 |

반올림: 심박·케이던스·GCT·파워·페이스(초) = 정수 / 보폭 = 소수 2자리 / 수직비율·수직진동 = 소수 1자리 / 거리 = 소수 2자리.

### 5.1 참고 코드
```js
const round = (v, d = 0) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
const vals = (list, k) => list.map(r => r[k]).filter(v => v != null);
const sum  = (list, k) => { const a = vals(list, k); return a.length ? a.reduce((x, y) => x + y, 0) : null; };
const max  = (list, k) => { const a = vals(list, k); return a.length ? Math.max(...a) : null; };
const min  = (list, k) => { const a = vals(list, k); return a.length ? Math.min(...a) : null; };
const wavg = (list, k, d = 0) => {
  const v = list.filter(r => r[k] != null && r.durationSec > 0);
  const w = v.reduce((s, r) => s + r.durationSec, 0);
  return w ? round(v.reduce((s, r) => s + r[k] * r.durationSec, 0) / w, d) : null;
};

export function aggregateByDay(runs) {
  const byDay = {};
  for (const r of runs) (byDay[r.date] ??= []).push(r);
  return Object.entries(byDay)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => {
      const distanceKm = round(sum(list, 'distanceKm'), 2);
      const durationSec = sum(list, 'durationSec');
      return {
        date, runCount: list.length, titles: list.map(r => r.title),
        distanceKm, durationSec,
        avgPaceSec: distanceKm ? Math.round(durationSec / distanceKm) : null,
        bestPaceSec: min(list, 'bestPaceSec'),
        movingSec: sum(list, 'movingSec'), elapsedSec: sum(list, 'elapsedSec'),
        calories: sum(list, 'calories'), steps: sum(list, 'steps'), laps: sum(list, 'laps'),
        elevGainM: sum(list, 'elevGainM'), elevLossM: sum(list, 'elevLossM'),
        avgHr: wavg(list, 'avgHr'), maxHr: max(list, 'maxHr'),
        aerobicTE: max(list, 'aerobicTE'),
        avgCadence: wavg(list, 'avgCadence'), maxCadence: max(list, 'maxCadence'),
        avgStrideM: wavg(list, 'avgStrideM', 2),
        avgVerticalRatio: wavg(list, 'avgVerticalRatio', 1),
        avgVerticalOscCm: wavg(list, 'avgVerticalOscCm', 1),
        avgGctMs: wavg(list, 'avgGctMs'),
        avgPowerW: wavg(list, 'avgPowerW'), maxPowerW: max(list, 'maxPowerW'), npW: wavg(list, 'npW'),
        avgGapSec: wavg(list, 'avgGapSec'),
      };
    });
}
```

### 5.2 SQL 버전 (서버에서 집계할 때)
```sql
SELECT user_id, run_date,
       COUNT(*)                                   AS run_count,
       SUM(distance_km)                           AS distance_km,
       SUM(duration_sec)                          AS duration_sec,
       ROUND(SUM(duration_sec) / NULLIF(SUM(distance_km), 0)) AS avg_pace_sec,
       ROUND(SUM(avg_hr * duration_sec) FILTER (WHERE avg_hr IS NOT NULL)
             / NULLIF(SUM(duration_sec) FILTER (WHERE avg_hr IS NOT NULL), 0)) AS avg_hr,
       MAX(max_hr)                                AS max_hr,
       MAX(aerobic_te)                            AS aerobic_te,
       ROUND(SUM(avg_cadence * duration_sec) FILTER (WHERE avg_cadence IS NOT NULL)
             / NULLIF(SUM(duration_sec) FILTER (WHERE avg_cadence IS NOT NULL), 0)) AS avg_cadence,
       SUM(calories) AS calories, SUM(steps) AS steps,
       SUM(elev_gain_m) AS elev_gain_m, SUM(elev_loss_m) AS elev_loss_m
       -- 나머지 가중평균 필드도 avg_hr과 같은 패턴
FROM runs
WHERE deleted_at IS NULL AND flagged = FALSE
GROUP BY user_id, run_date;
```

---

## 6. 수동 입력 기록과의 병합

- `manual_runs`는 하루 단위 기록(날짜·거리·시간).
- **어떤 날짜에 가민 러닝이 들어오면, 그 날짜의 수동 기록(status=active)은 가민으로 대체한다.**
  - 수동 기록은 지우지 않고 `status = 'replaced_by_garmin'`으로 바꾸고 합계에서 제외.
  - 미리보기에서 날짜별로 확인받는다:
    ```
    5/9  수동 입력 21km  ↔  가민 21.25km (2건)
         ● 가민 기록으로 대체 (기본)
         ○ 따로 뛴 기록이에요 (둘 다 합산)   → status = 'separate'
    ```
- **절대 이중 합산하지 말 것** (수동 21 + 가민 21.25 = 42.25 ❌).
- 가민 기록이 없는 날의 수동 기록은 그대로 유지(active).
- 하루 화면 표시값 = 그날 가민 합산 + (status가 `active`/`separate`인 수동 기록). 수동 기록에는 심박 등이 없으므로 가중평균 계산에서 자동 제외됨.

---

## 7. 업로드 처리 흐름 / API

### 7.1 흐름
```
[가민 CSV 올리기] 버튼 + 단위 선택(km/mi)
  → (브라우저) 디코딩 → 파싱 → 러닝 필터 → 요약 JSON 생성
  → POST /api/runs/import  { dryRun: true, runs: [...] }
  ← 서버: 분류 결과 반환 (new / updated / unchanged / manualConflicts)
  → [미리보기 화면] 사용자 확인, 수동 기록 충돌 선택
  → POST /api/runs/import  { dryRun: false, runs: [...], conflictDecisions: { "2026-05-09": "replace" } }
  ← 저장 결과 → 대시보드로 이동
```

### 7.2 API 스펙
`POST /api/runs/import` (로그인 필수, user_id는 세션에서. 바디로 받지 말 것)
```jsonc
// request
{
  "dryRun": true,
  "runs": [
    { "startedAt": "2026-05-09 09:45:20", "activityType": "러닝", "title": "동두천 핫피자런",
      "distanceKm": 13.07, "durationSec": 5053, "avgHr": 156, "maxHr": 170, "aerobicTE": 5.0,
      "avgCadence": 185, "maxCadence": 198, "avgPaceSec": 387, "...": "...", "raw": { } }
  ],
  "conflictDecisions": { }
}
// response
{
  "summary": { "new": 15, "updated": 0, "unchanged": 0 },
  "byDate":  [ { "date": "2026-05-09", "status": ["new","new"] } ],
  "manualConflicts": [ { "date": "2026-05-09", "manualKm": 21, "garminKm": 21.25, "garminRuns": 2 } ]
}
```
- 서버 검증: started_at 형식(`YYYY-MM-DD HH:MM:SS`), 거리 0~300km, 시간 0~24h, 심박 30~250, 한 번에 최대 2,000건.
- 브라우저에서 계산한 값을 신뢰하지 말고 서버에서도 타입·범위 검증.

### 7.3 미리보기 화면 문구
```
가민 기록 20건을 읽었어요
 ✅ 러닝 15건  (새 기록 15 · 변경 0 · 이미 있음 0)
 ➖ 제외 5건   (러닝 아님 4 · 빈 기록 1)
 ⚠️ 의심 기록 0건
 🔁 수동 기록과 겹치는 날 1일 → 선택해 주세요
[날짜별 목록: 날짜 · 건수 · 거리 · 시간 · 페이스 · 심박 · 케이던스 · 훈련효과 · 상태]
            [취소]  [저장하기]
```

### 7.4 대시보드
- 월별 합계 카드(거리·러닝 일수·러닝 횟수·평균 페이스).
- 날짜별 목록(하루 합산 1행) → 탭하면 그날 개별 러닝 펼침(제목·시작 시각·개별 값).
- 개별 러닝 삭제 버튼(soft delete).

---

## 8. 업로드 안내 문구 (사용자용 도움말)
1. PC에서 connect.garmin.com 로그인 → 왼쪽 메뉴 **활동 목록 → 모든 활동**
2. 원하는 기간까지 **아래로 스크롤** (화면에 보이는 만큼만 내보내질 수 있어요)
3. 오른쪽 위 **CSV 내보내기** 클릭 → `Activities.csv` 저장
4. **파일을 엑셀로 열어서 저장하지 마세요** (날짜 형식·인코딩이 바뀔 수 있어요). 그대로 올리면 됩니다.
5. 크루 앱 → **가민 CSV 올리기** → 파일 선택 → 미리보기 확인 → 저장
6. 한 달에 한 번, 또는 챌린지 마감 전에 올려주세요. 예전 기록이 겹쳐도 새 기록만 추가돼요.

---

## 9. 정책·법적 메모
- 심박 등 건강정보는 개인정보보호법상 **민감정보** → 첫 업로드 전 **별도 동의** 화면(약관 동의와 분리).
- GPS 경로는 수집하지 않음(CSV에도 없음). 위치정보법 이슈 회피.
- 크루원에게 내 기록 공개는 **사용자 설정(기본 OFF 또는 명시적 동의)**.
- "가민 연동 기록 전체 삭제" 기능 제공.
- 챌린지 랭킹: **마감 후 N일까지 업로드된 기록만 인정**, 이후 결과 고정 (나중에 지난 기록이 추가돼도 순위가 바뀌지 않게).
- 가민 데이터를 표시하는 화면에 출처 표시("Garmin" 배지)를 권장.

---

## 10. 구현 단계

### Phase 0 — 단일 HTML 프로토타입 (스택 무관, 바로 테스트용)
- 파일 하나(`garmin-import.html`), 서버 없음. PapaParse는 CDN(`https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js`).
- 저장소는 **IndexedDB**(`runs` 스토어, 키 = `startedAt`)로 서버 DB 역할 대체. new/updated/unchanged 분류도 브라우저에서 수행.
- 화면: 업로드 → 미리보기 → 저장 → 월별/일별 대시보드 → 하루 펼치기 → 개별 삭제 → "전체 초기화" 버튼(테스트용).
- 수동 기록 입력 폼(날짜·거리·시간)도 넣어서 §6 병합 규칙까지 테스트.
- 모바일 화면 폭에서도 깨지지 않게.

### Phase 1 — 실제 웹앱 통합
- 현재 웹앱의 프레임워크·DB를 먼저 확인하고 그에 맞춰 이식.
- 파싱/합산 모듈(`garminCsv.js`, `aggregate.js`)은 프레임워크 독립 순수 함수로 분리하고 단위 테스트 작성.
- 서버 API(§7), 테이블(§4), 동의 화면(§9) 추가.

---

## 11. 테스트 케이스 (운영자 실제 데이터 `Activities.csv` 기준 기대값)

### 11.1 원본 데이터 요약 (20행)
| # | 활동 종류 | 날짜 | 제목 | 거리 | 시간 | 평균심박 | 훈련효과 | 케이던스 | 처리 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 트레드밀 러닝 | 2026-09-09 21:16:06 | 트레드밀 러닝 | 3.51 | 00:20:12 | 165 | 3.8 | 176 | 저장 |
| 2 | 스텝퍼 | 2026-08-04 06:46:33 | 스텝퍼 | 0.00 | 00:30:05 | 102 | 0.7 | 116 | 제외(러닝 아님) |
| 3 | 스텝퍼 | 2026-07-29 20:52:26 | 스텝퍼 | 0.00 | 01:00:55 | 121 | 2.2 | 93 | 제외(러닝 아님) |
| 4 | 스텝퍼 | 2026-07-28 21:06:20 | 스텝퍼 | 0.00 | 01:13:32 | 125 | 2.5 | 95 | 제외(러닝 아님) |
| 5 | 트레드밀 러닝 | 2026-06-30 20:54:41 | 트레드밀 러닝 | 5.11 | 00:32:15 | 158 | 3.9 | 165 | 저장 |
| 6 | 트레드밀 러닝 | 2026-06-09 20:57:50 | 트레드밀 러닝 | 5.02 | 01:00:40 | 137 | 3.3 | 107 | 저장 (페이스 12:06, 걷기 섞임) |
| 7 | 러닝 | 2026-06-06 06:13:28 | 러닝 | 10.20 | 01:09:10 | 156 | 4.7 | 188 | 저장 |
| 8 | 러닝 | 2026-06-05 18:45:37 | 러닝 | 5.01 | 00:35:27 | 156 | 3.8 | 179 | 저장 |
| 9 | 트레드밀 러닝 | 2026-05-26 20:34:14 | 트레드밀 러닝 | 3.04 | 00:17:17 | 162 | 3.4 | 173 | 저장 |
| 10 | 하이킹 | 2026-05-24 11:05:10 | 하이킹 | 1.81 | 00:46:42 | 116 | 2.5 | 59 | 제외(러닝 아님) |
| 11 | 러닝 | 2026-05-09 14:36:51 | 핫피자복귀런 | 8.18 | 00:56:53 | 162 | 4.4 | 185 | 저장 (같은 날 2건) |
| 12 | 러닝 | 2026-05-09 09:45:20 | 동두천 핫피자런 | 13.07 | 01:24:13 | 156 | 5.0 | 185 | 저장 (같은 날 2건) |
| 13 | 러닝 | 2026-05-05 12:22:53 | 동두천 케밥런-하스케밥 | 14.01 | 01:30:06 | 162 | 5.0 | 186 | 저장 |
| 14 | 러닝 | 2026-04-26 08:31:31 | 러닝 | 10.08 | 01:03:49 | 170 | 5.0 | 185 | 저장 |
| 15 | 트레드밀 러닝 | 2026-04-21 19:50:39 | 트레드밀 러닝 | 5.09 | 00:26:26 | 160 | 4.4 | 183 | 저장 |
| 16 | 러닝 | 2026-04-12 07:33:28 | 러닝 | 5.01 | 00:33:33 | 150 | 3.7 | 189 | 저장 |
| 17 | 러닝 | 2026-04-04 08:15:24 | 러닝 | 9.98 | 01:01:55 | 164 | 5.0 | 191 | 저장 |
| 18 | 러닝 | 2026-03-31 20:11:31 | 러닝 | 10.01 | 01:11:29 | 145 | 3.9 | 186 | 저장 |
| 19 | 러닝 | 2026-03-26 20:13:43 | 러닝 | 15.01 | 01:42:00 | 155 | 5.0 | 188 | 저장 |
| 20 | 러닝 | 2026-03-24 23:40:14 | 러닝 | 0.00 | 00:00:00 | -- | -- | -- | 제외(빈 기록) |

### TC1. 최초 업로드
- 읽은 행 **20**, 저장 러닝 **15**, 제외 **5** (러닝 아님 4 = 스텝퍼 3 + 하이킹 1, 빈 기록 1), 의심 0
- 러닝한 날짜 **14일** (5/9에 2건)
- 총 거리 **122.33 km**
- 월별 합계:

| 월 | 러닝 수 | 러닝 일수 | 거리 |
|---|---|---|---|
| 2026-03 | 2 | 2 | 25.02 km |
| 2026-04 | 4 | 4 | 30.16 km |
| 2026-05 | 4 | 3 | 38.30 km |
| 2026-06 | 4 | 4 | 25.34 km |
| 2026-09 | 1 | 1 | 3.51 km |

### TC2. 파싱 단건 검증 (5/9 09:45 행)
- `distanceKm 13.07`, `durationSec 5053`, `avgPaceSec 387`, `bestPaceSec 273`, `avgGapSec 390`, `steps 15608`(쉼표 제거), `laps 14`, `movingSec 5036`, `elapsedSec 6349`, `avgStrideM 0.83`, `avgGctMs 243`, `avgPowerW 205`, `npW 206`
- 바디 배터리 `'-24`는 raw에만 존재, 파싱 에러 없어야 함
- 6/6 행: `durationSec 4150`, `avgPaceSec 407`(6:47)

### TC3. 같은 날 2건 합산 (2026-05-09)
| 항목 | 기대값 |
|---|---|
| runCount | 2 |
| distanceKm | **21.25** |
| durationSec | **8466** (2:21:06) |
| avgPaceSec | **398** (6:38/km) ← 페이스 단순평균 6:42가 나오면 버그 |
| avgHr | **158** (158.42) |
| maxHr | 181 |
| aerobicTE | 5.0 |
| avgCadence | 185 |
| maxCadence | 198 |
| calories | 1217 |
| steps | 26224 |
| elevGainM / elevLossM | 34 / 41 |
| avgPowerW | 200 (199.76) |
| avgStrideM | 0.81 |
| avgGctMs | 245 (244.61) |

### TC4. 같은 파일 재업로드
- new **0**, updated **0**, unchanged **15**. 데이터 변화 없음.

### TC5. 같은 날짜에 새 러닝이 나중에 추가되는 경우
1. CSV 사본에서 `2026-05-09 14:36:51` 행을 지우고 업로드 → 5/9 = 1건, **13.07 km, 1:24:13, 6:27/km**
2. 원본 전체 업로드 → new **1**, unchanged **14** → 5/9 = 2건, TC3 값으로 **자동 재계산**

### TC6. 가민에서 수정된 기록
- CSV 사본에서 6/6 행의 제목을 `"아침 10K"`로 바꿔 업로드 → updated **1**, 제목만 변경, 나머지 동일.

### TC7. 수동 기록 병합
- 수동 입력: 5/9 21.00 km, 6/7 5.00 km 를 먼저 저장 → CSV 업로드
- 미리보기에 5/9 충돌 1건 표시, 6/7은 충돌 없음
- "가민으로 대체" 선택 시: 5/9 표시 거리 **21.25 km** (42.25 ❌), 수동 5/9는 `replaced_by_garmin`
- "따로 뛴 기록" 선택 시: 5/9 표시 거리 **42.25 km**, 수동 5/9는 `separate`
- 6/7은 수동 5.00 km 그대로 유지
- 6월 합계(대체 선택 시): 25.34 + 5.00 = **30.34 km**

### TC8. 사용자 삭제 후 재업로드
- 9/9 러닝 삭제 → 같은 CSV 재업로드 → 되살아나지 않음 (unchanged 또는 별도 "삭제됨" 집계).

### TC9. 인코딩/형식 방어
- 메모장에서 "UTF-8(BOM)"으로 다시 저장한 파일 → 정상 파싱 (BOM 제거)
- 엑셀에서 열고 CSV로 저장한 파일(CP949) → euc-kr 재시도로 파싱되거나, 날짜에 초가 없으면 **경고 표시** ("엑셀로 저장한 파일 같아요. 원본 파일을 올려주세요")
- 가민 CSV가 아닌 아무 CSV → 에러 메시지(§3.1-4)

### TC10. 의심 기록
- 사본에서 6/5 행 `시간`을 `00:10:00`(5.01km → 약 2:00/km)으로만 수정(평균 페이스 컬럼은 7:05 그대로 둠) → `flagged=true`, 미리보기 "의심 기록 1건", 랭킹/월 합계(랭킹 기준)에서 제외 처리 확인.

---

## 12. 체크리스트 (완료 기준)
- [ ] 실제 `Activities.csv`로 TC1~TC10 전부 통과
- [ ] 파싱·합산 함수 단위 테스트 (TC2, TC3 수치 고정)
- [ ] 엑셀로 열지 않은 원본 파일로 한글 정상
- [ ] 모바일 폭(375px)에서 미리보기·대시보드 깨짐 없음
- [ ] 민감정보 별도 동의 화면
- [ ] 개별 삭제, 전체 삭제
- [ ] 러닝 종류 목록·의심 페이스 기준·랭킹 마감 N일을 설정값(상수)으로 분리
