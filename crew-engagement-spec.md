# 러닝크루 참여 기능 명세서 (공동 목표 · 응원 피드 · 자동 뱃지 · 번개런 · 월말 어워즈)

> **이 문서를 받은 AI/개발자에게**
> 러닝크루 웹앱에 크루원 참여를 높이는 기능 5가지를 만든다. 정책과 규칙은 정해져 있으니 아래 명세대로 구현한다.
> 이 문서는 **「가민 CSV 업로드 명세서(garmin-csv-import-spec.md)」의 `runs`, `manual_runs` 테이블과 하루 합산 규칙을 전제**로 한다. 같이 받았다면 그 문서를 먼저 구현한다.
> 프로젝트 스택이 정해져 있지 않으면 **§10 Phase 0(가짜 크루원 데이터로 돌아가는 단일 HTML 프로토타입)**부터 만든다.

---

## 0. 설계 원칙 (모든 기능에 공통)

1. **누구나 이길 수 있게**: 거리만 겨루면 초보가 떠난다. 협력형(공동 목표)과 다양한 랭킹(꾸준함·성장·응원)을 함께 둔다.
2. **기록 공개는 본인 선택**: `users.share_records`가 꺼져 있으면 피드·랭킹·어워즈에 노출하지 않는다. 단, 공동 목표에는 **익명으로 합산**한다 ("비공개 크루원 3명이 함께했어요").
3. **검증 기록과 수동 기록 구분**:
   - **검증 기록** = `runs` (source가 `manual`이 아닌 것, `flagged = false`, `deleted_at IS NULL`)
   - **수동 기록** = `manual_runs` (status가 `active` 또는 `separate`)
   - 뱃지·거리왕·새벽왕처럼 경쟁이 걸린 곳은 **검증 기록만**, 공동 목표·꾸준왕처럼 협력/참여형은 **둘 다** 인정 (§각 기능에 명시).
4. **알림은 적게**: 즉시 알림은 꼭 필요한 것만, 나머지는 하루 1회 요약(21:00).
5. **과거 기록 일괄 업로드가 피드를 도배하지 않게**: 7일보다 오래된 기록으로 생긴 이벤트는 피드에 개별로 올리지 않는다(§2.3).
6. 시간대는 전부 **Asia/Seoul**. 주(week)는 **월요일 시작**.

### 0.1 전제 테이블 (없으면 만든다)
```sql
-- 이미 있다면 컬럼만 추가
CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  nickname       TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member',   -- member | admin(운영진)
  share_records  BOOLEAN NOT NULL DEFAULT FALSE,   -- 기록 공개 동의
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- runs, manual_runs 는 garmin-csv-import-spec.md §4.2 참고
```
- 이 앱은 **크루 1개**를 전제로 한다. 여러 크루로 확장할 계획이면 아래 모든 테이블에 `crew_id`를 추가한다.

### 0.2 공통 계산: 사용자의 "하루 기록"
garmin-csv-import-spec.md §5, §6 규칙을 그대로 쓴다.
- 하루 거리 = 그날 검증 러닝 합계 + 그날 수동 기록(active/separate) 합계
- 수동 기록이 `replaced_by_garmin`이면 제외 (이중 합산 금지)
- 아래에서 "러닝한 날" = 하루 거리 > 0 인 날

---

## 1. 🎯 크루 공동 목표

### 1.1 개념
운영진이 기간과 목표 거리를 정하면(예: "10월 크루 합산 1,000km"), 모든 크루원의 기록이 합쳐져 진행바가 찬다. 느린 크루원의 1km도 기여가 된다.

### 1.2 규칙
| 항목 | 규칙 |
|---|---|
| 생성 | 운영진만. 기간(시작일~종료일), 목표 km, 제목, 수동 기록 포함 여부(기본 **포함**) |
| 동시 진행 | 같은 기간에 겹치는 목표는 1개만 (겹치면 생성 거부) |
| 합산 대상 | 기간 내 **모든 크루원**의 하루 거리. `share_records = false`인 사람도 합산하되 이름은 숨김 |
| 진행률 | `합계 / 목표 × 100`, 소수 1자리. 100% 넘어도 계속 표시 (예: 112.4%) |
| 마일스톤 | 25 / 50 / 75 / 100%를 처음 넘을 때 피드에 1번씩 게시 + 전체 알림(100%만 즉시 알림) |
| 남은 계산 | `남은 km ÷ 남은 일수` → "하루에 크루 전체가 X km씩 더 뛰면 달성해요" |
| 기여자 목록 | 공개 크루원만 이름+거리 표시(거리순), 비공개는 "비공개 크루원 N명 · 합계 Y km"로 묶음 |
| 늦은 업로드 | 종료일 +3일(설정값 `GRACE_DAYS`)까지 올라온 기록은 반영, 그 후 결과 고정 (`status = 'closed'`) |

### 1.3 화면
```
┌─────────────────────────────────────┐
│ 🎯 10월 크루 목표                      │
│      ◯ (원형 진행 링)  612.4 / 1,000km │
│                        61.2%          │
│ 남은 17일 · 하루 22.8km씩이면 달성!     │
│ [기여자 보기]                          │
└─────────────────────────────────────┘
```
- 홈 탭 최상단에 배치. 진행 링은 Apple 피트니스 링 스타일.
- 목표가 없으면 운영진에게만 "목표 만들기" 카드 표시.

---

## 2. 👏 응원 피드 + 하이파이브

### 2.1 피드 항목 종류
| type | 생성 시점 | 문구 예 |
|---|---|---|
| `run_day` | 공개 크루원이 기록을 올리거나 수정해 **그날의 하루 기록이 생기거나 바뀔 때** (하루 1항목, 갱신 시 같은 항목 업데이트) | "민수님이 10.20km 달렸어요 · 6:47/km · 🔥 훈련효과 4.7" |
| `bulk_import` | CSV 업로드로 **7일보다 오래된** 기록이 들어온 경우, 업로드 1회당 1항목 | "민수님이 지난 기록 14일치(총 122.33km)를 올렸어요" |
| `badge` | 뱃지 획득 (최근 7일 이내 러닝으로 획득한 경우만 개별 항목) | "민수님이 🍕 맛집런 뱃지를 받았어요" |
| `badge_bulk` | 과거 기록으로 뱃지 여러 개를 한 번에 받은 경우 1항목 | "민수님이 뱃지 6개를 한 번에 받았어요!" |
| `bungae_created` | 번개런 생성 | "⚡ 내일 06:30 한강 10K 번개 · 3/8명" |
| `bungae_done` | 번개런 종료 후 출석 확정 | "⚡ 한강 10K 번개 완료! 6명이 함께 뛰었어요" |
| `goal_milestone` | 공동 목표 25/50/75/100% | "🎯 10월 목표 50% 돌파!" |
| `award` | 월말 어워즈 발표 | "🏆 9월 크루 어워즈 발표!" |

- 비공개 크루원(`share_records = false`)의 `run_day`, `bulk_import`, `badge*`는 만들지 않는다.
- 기록이 삭제되어 하루 기록이 0이 되면 해당 `run_day` 항목도 숨김.

### 2.2 하이파이브
- 피드 항목마다 [🙌 하이파이브] 버튼. **1인 1항목 1회**(다시 누르면 취소).
- **자기 글에는 불가** (버튼 비활성).
- 버튼 옆에 개수, 누르면 보낸 사람 목록.
- 하이파이브를 보낸 수는 **응원왕**(§5) 집계에 쓰인다. 취소하면 집계에서도 빠진다.
- 남용 방지: 1인당 하루 최대 100회 (설정값).

### 2.3 7일 규칙 (도배 방지)
- 업로드된 러닝 중 `started_at`이 **현재로부터 7일(설정값 `FEED_RECENT_DAYS`) 이내**인 날만 `run_day` 항목 생성.
- 그보다 오래된 날들은 모아서 `bulk_import` 1개로.
- 뱃지도 같은 기준: 획득 근거 러닝이 7일 이내면 `badge` 개별, 아니면 `badge_bulk`로 묶음.

### 2.4 알림
| 알림 | 방식 |
|---|---|
| 내 글에 하이파이브 | **하루 요약** 21:00 "오늘 하이파이브 7개를 받았어요" (0개면 안 보냄) |
| 공동 목표 100% 달성 | 즉시, 전체 |
| 월말 어워즈 발표 | 즉시, 전체 |
| 번개런 관련 | §4.5 |
- 웹앱이므로 이번 범위는 **앱 내 알림함(종 아이콘)**. 웹 푸시/앱 푸시는 이후 단계.
- 사용자 설정에서 "하이파이브 요약 알림 끄기" 가능.

---

## 3. 🏅 자동 뱃지

### 3.1 원칙
- **검증 기록(`runs`)만** 대상. 수동 기록으로는 뱃지를 받지 않는다.
- 뱃지는 사용자 기록이 바뀔 때마다(업로드·삭제) **그 사용자의 전체 검증 기록으로 다시 평가**한다 (멱등).
  - 새로 충족 → 지급, 더 이상 충족 안 됨(기록 삭제 등) → 회수.
- `earned_at` = 조건을 **처음 충족시킨 러닝의 날짜** (업로드한 날이 아님).
- 뱃지 정의는 코드 상수(또는 테이블)로 관리해서 쉽게 추가/수정.

### 3.2 뱃지 목록 (초기값)
"러닝"은 하나의 검증 러닝(`runs` 1행)을 뜻한다. 시각은 `started_at` 현지 시각.

| code | 이름 | 조건 | 진행도 표시 |
|---|---|---|---|
| `dawn_runner` | 🌅 새벽 러너 | 시작 시각 **06:00 이전** 러닝 **5회** | n/5 |
| `night_runner` | 🌙 나이트 러너 | 시작 시각 **20:00 이후** 러닝 **5회** | n/5 |
| `foodie_run` | 🍕 맛집런 | 제목에 음식 키워드 포함 러닝 **1회** | – |
| `double_header` | ⚡ 더블헤더 | **같은 날 러닝 2회 이상**인 날 **1일** | – |
| `full_power` | 🔥 풀파워 | 유산소 훈련 효과 **5.0** 러닝 **1회** | – |
| `cadence_180` | 🦶 케이던스 180 클럽 | 평균 케이던스 **180 이상** 러닝 **1회** | – |
| `first_10k` | 🏃 첫 10K | 한 번에 **10.00km 이상** 러닝 1회 | 최장 거리/10 |
| `first_half` | 🥈 첫 하프 | 한 번에 **21.0975km 이상** 러닝 1회 (**하루 합산 아님**) | 최장 거리/21.1 |
| `first_full` | 🥇 첫 풀코스 | 한 번에 **42.195km 이상** 러닝 1회 | 최장 거리/42.2 |
| `streak_4w` | 📅 4주 연속 | **연속 4주**(월요일 시작) 매주 러닝 1회 이상 | 최장 연속 주/4 |
| `treadmill_10` | 🏠 트레드밀 장인 | 활동 종류 `트레드밀 러닝`(또는 `Treadmill Running`) **10회** | n/10 |

- 음식 키워드(초기값): `피자, 케밥, 국밥, 치킨, 맥주, 라면, 떡볶이, 커피, 빵, 냉면, 막걸리, 삼겹살, 순대, 짜장, 짬뽕, 도넛, 버거, 햄버거, 빙수, 아이스크림`
- 경계값: 새벽은 `시 < 6`, 나이트는 `시 >= 20`, 거리·케이던스·훈련효과는 `>=`.

### 3.3 화면
- 기록 탭 → 뱃지 섹션: 획득 뱃지(컬러) + 미획득 뱃지(흑백 + 진행도 바 "3/5").
- 뱃지 탭하면: 조건, 획득일, 근거가 된 러닝(날짜·제목·거리).
- CSV 업로드 완료 화면에 "🎉 새 뱃지 6개!" 애니메이션 → 뱃지 화면으로 이동 버튼.

---

## 4. ⚡ 번개런 모집

### 4.1 번개 만들기 (크루원 누구나)
| 필드 | 필수 | 비고 |
|---|---|---|
| 제목 | ✅ | 예: "한강 반포 10K" |
| 시작 일시 | ✅ | 현재 이후만 |
| 모이는 곳 | ✅ | **텍스트만** (지도·GPS 수집 안 함). 예: "반포한강공원 달빛광장 앞" |
| 계획 거리 | ✅ | km |
| 페이스 그룹 | ✅ | `5분대`, `6분대`, `7분대`, `8분대 이상`, `자유` |
| 최대 인원 | 선택 | 비우면 무제한. 2~50 |
| 설명 | 선택 | 500자 |
- 만든 사람(호스트)은 자동 참가.

### 4.2 상태
```
open(모집중) ──시작시각──▶ started(진행중) ──호스트 출석확정──▶ done(완료)
   │                                        └─시작 +24h 미확정─▶ done (참가자 전원 출석 처리)
   └─호스트 취소─▶ canceled
```

### 4.3 참가 규칙
- `open` 상태에서만 참가/취소 가능. 시작 시각 이후 참가 불가.
- 최대 인원이 차면 **대기 명단**. 참가자가 취소하면 대기 1번이 자동 참가 + 즉시 알림.
- 호스트는 참가 취소 불가 → 번개 자체를 **취소**해야 함 (참가자 전원에게 즉시 알림).
- 같은 시간대(±1시간) 다른 번개에 이미 참가 중이면 경고만 표시(막지는 않음).

### 4.4 출석 확정
- 시작 시각 이후 호스트 화면에 "출석 확정하기": 참가자 목록이 모두 체크된 상태로 나오고, 안 온 사람만 체크 해제 → 확정.
- 확정되면 `bungae_done` 피드 게시, 출석한 사람의 **출석 수**(출석왕 집계)에 반영.
- 호스트가 24시간 내 확정하지 않으면 참가자 전원 출석으로 자동 확정.

### 4.5 번개 알림
| 이벤트 | 대상 | 방식 |
|---|---|---|
| 새 번개 생성 | 전체 | 하루 요약에 포함 ("내일 번개 2개") |
| 대기 → 참가 확정 | 해당자 | 즉시 |
| 번개 취소 | 참가자·대기자 | 즉시 |
| 시작 2시간 전 | 참가자 | 즉시 리마인드 |

### 4.6 화면
- 크루 탭 → "번개런" 목록: 다가오는 순, 카드에 `날짜·시간 / 제목 / 거리·페이스 / 모이는 곳 / 3/8명 / [참가]`
- 홈 탭: "다가오는 번개" 최대 2개.
- 상세: 참가자 아바타 목록, 대기 명단, 댓글(문의용), 호스트 메뉴(수정·취소·출석 확정).

---

## 5. 🏆 월말 크루 어워즈 (다양한 랭킹)

### 5.1 부문 (초기값)
| code | 부문 | 기준 | 대상 기록 | 최소 조건 |
|---|---|---|---|---|
| `distance` | 🏃 거리왕 | 월 총 거리 | **검증 기록만** | – |
| `consistency` | 📅 꾸준왕 | 러닝한 날 수 | 검증 + 수동 | – |
| `growth` | 📈 성장왕 | (이번 달 거리 − 지난달 거리) ÷ 지난달 거리 | 검증 + 수동 | **지난달 10km 이상**, 이번 달 > 지난달 |
| `attendance` | 🙋 출석왕 | 번개런 출석 확정 수 | 번개 데이터 | 1회 이상 |
| `cheer` | 🙌 응원왕 | 보낸 하이파이브 수 (취소 제외, 자기 글 불가) | 하이파이브 | 1회 이상 |
| `dawn` | 🌅 새벽왕 | 시작 **07:00 이전** 러닝 횟수 | **검증 기록만** | 1회 이상 |

- **공개 크루원만** 수상 대상.
- **동점이면 공동 수상** (부문당 최대 3명까지 표시, 그 이상 동점이면 "외 N명").
- 부문 1등 + 각 부문 TOP 3를 저장.
- 참가자가 0명인 부문은 "이번 달은 주인공이 없어요"로 표시.

### 5.2 확정 시점
- 늦은 업로드를 반영하기 위해 **다음 달 4일 00:10**(= 월말 + `GRACE_DAYS` 3일 후)에 집계·확정·발표.
- 확정된 결과는 `monthly_awards`에 저장하고 이후 기록이 바뀌어도 **다시 계산하지 않는다**.
- 확정 전에는 크루 탭 "이번 달 랭킹"에서 **실시간 순위**(같은 기준)를 볼 수 있다. 실시간 순위 화면 상단에 "다음 달 4일에 확정돼요" 안내.

### 5.3 어워즈 카드
- 발표 시 `award` 피드 항목 + 전체 즉시 알림.
- 어워즈 화면: 부문별 카드(아이콘, 부문명, 수상자 닉네임, 기록값, 2·3위).
- **[이미지로 저장] 버튼**: 1080×1920(인스타 스토리) PNG를 브라우저에서 생성 (`html-to-image` 등). 서버 저장 없음.
- 개인 카드: 수상자는 자기 부문 카드만 따로 저장 가능 ("9월 거리왕 민수 · 182.4km").

---

## 6. 데이터 모델 (PostgreSQL 기준)

```sql
CREATE TABLE crew_goals (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  target_km       NUMERIC(8,2) NOT NULL CHECK (target_km > 0),
  include_manual  BOOLEAN NOT NULL DEFAULT TRUE,
  status          TEXT NOT NULL DEFAULT 'active',   -- active | closed
  final_km        NUMERIC(9,2),                     -- closed 시 고정값
  milestones_hit  INT[] NOT NULL DEFAULT '{}',      -- {25,50}
  created_by      BIGINT NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE feed_items (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,          -- run_day | bulk_import | badge | badge_bulk | bungae_created | bungae_done | goal_milestone | award
  actor_id    BIGINT REFERENCES users(id),   -- 시스템 항목은 NULL
  ref_date    DATE,                   -- run_day의 날짜
  payload     JSONB NOT NULL,         -- 표시용 값 (거리, 페이스, 뱃지 코드 등)
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  highfive_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX feed_run_day_uniq ON feed_items (actor_id, ref_date) WHERE type = 'run_day';
CREATE INDEX ON feed_items (created_at DESC) WHERE hidden = FALSE;

CREATE TABLE highfives (
  feed_item_id BIGINT NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_item_id, user_id)
);

CREATE TABLE user_badges (
  user_id      BIGINT NOT NULL REFERENCES users(id),
  badge_code   TEXT NOT NULL,
  earned_at    DATE NOT NULL,               -- 조건을 처음 충족한 러닝 날짜
  evidence_run_id BIGINT REFERENCES runs(id),
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_code)
);

CREATE TABLE bungae_runs (
  id            BIGSERIAL PRIMARY KEY,
  host_id       BIGINT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  meeting_place TEXT NOT NULL,
  distance_km   NUMERIC(5,2) NOT NULL,
  pace_group    TEXT NOT NULL,              -- 5min | 6min | 7min | 8min_plus | free
  max_people    INT CHECK (max_people BETWEEN 2 AND 50),
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'open',   -- open | started | done | canceled
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bungae_participants (
  bungae_id   BIGINT NOT NULL REFERENCES bungae_runs(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  state       TEXT NOT NULL,                -- joined | waitlist | attended | absent
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bungae_id, user_id)
);

CREATE TABLE bungae_comments (
  id         BIGSERIAL PRIMARY KEY,
  bungae_id  BIGINT NOT NULL REFERENCES bungae_runs(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE monthly_awards (
  month       DATE NOT NULL,                -- 해당 월 1일
  category    TEXT NOT NULL,                -- distance | consistency | growth | attendance | cheer | dawn
  rank        INT  NOT NULL,                -- 1, 2, 3 (동점은 같은 rank)
  user_id     BIGINT NOT NULL REFERENCES users(id),
  value       NUMERIC(10,2) NOT NULL,       -- 거리 km, 일수, 성장률(%), 횟수
  PRIMARY KEY (month, category, user_id)
);

CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_settings (
  user_id               BIGINT PRIMARY KEY REFERENCES users(id),
  highfive_digest       BOOLEAN NOT NULL DEFAULT TRUE
);
```

---

## 7. 이벤트 처리 흐름

### 7.1 러닝 기록이 바뀔 때 (CSV 업로드 완료, 수동 입력, 삭제)
같은 트랜잭션(또는 직후 작업)에서:
1. 영향받은 날짜 목록 계산
2. **피드**: 7일 이내 날짜 → `run_day` upsert(하루 합산값으로), 7일 초과 → 업로드 1회당 `bulk_import` 1개
3. **뱃지**: 해당 사용자 뱃지 전체 재평가 → 지급/회수 → 신규 지급분으로 `badge` 또는 `badge_bulk` 피드
4. **공동 목표**: 활성 목표의 합계 재계산 → 새로 넘은 마일스톤 있으면 `goal_milestone` 피드 (+100%면 전체 알림)

### 7.2 예약 작업 (크론)
| 시각 (KST) | 작업 |
|---|---|
| 매일 21:00 | 하이파이브 하루 요약 알림, 새 번개 요약 알림 |
| 10분마다 | 번개 상태 전환(open→started), 시작 2시간 전 리마인드, 24시간 미확정 자동 확정 |
| 매월 4일 00:10 | 지난달 어워즈 집계·확정·발표, 종료 +3일 지난 공동 목표 `closed` 처리 |
- 예약 실행 방법은 running-news-board-spec.md §6과 동일(GitHub Actions → 보호된 엔드포인트 호출).

---

## 8. API (요약)

| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | `/api/goals/current` | 크루원 — 진행률, 남은 계산, 기여자(공개/비공개 묶음) |
| POST / PATCH | `/api/admin/goals` | 운영진 |
| GET | `/api/feed?cursor=` | 크루원 |
| POST / DELETE | `/api/feed/:id/highfive` | 크루원 (자기 글 403, 하루 한도 429) |
| GET | `/api/feed/:id/highfives` | 크루원 — 보낸 사람 목록 |
| GET | `/api/badges/me` , `/api/users/:id/badges` | 크루원 (타인은 공개 사용자만) |
| GET / POST | `/api/bungae` | 크루원 |
| GET / PATCH / DELETE | `/api/bungae/:id` | 조회 크루원, 수정·취소 호스트 |
| POST / DELETE | `/api/bungae/:id/join` | 크루원 |
| POST | `/api/bungae/:id/attendance` `{ absentUserIds: [] }` | 호스트 |
| GET / POST | `/api/bungae/:id/comments` | 크루원 |
| GET | `/api/rankings/current-month` | 크루원 — 실시간 순위 |
| GET | `/api/awards/:yyyy-mm` | 크루원 — 확정 어워즈 |
| GET / PATCH | `/api/notifications` | 본인 |
| PATCH | `/api/me/settings` `{ share_records, highfive_digest }` | 본인 |
| POST | `/api/cron/*` | CRON_SECRET |

- 사용자 ID는 항상 세션에서. 권한 검사는 서버에서.

---

## 9. 화면 배치 (하단 탭 5개 기준)

| 탭 | 이 명세의 구성요소 |
|---|---|
| 🏠 홈 | ① 공동 목표 링 ② 이번 주 내 기록 요약 ③ 다가오는 번개 2개 ④ (뉴스 3건 — 뉴스 명세서) |
| 🏃 기록 | 내 기록 목록, CSV 올리기, 수동 입력, **뱃지 섹션** |
| 👥 크루 | 세그먼트 탭 `[피드] [번개런] [랭킹·어워즈]` |
| 📰 뉴스 | (뉴스 명세서) |
| 👤 내 정보 | 프로필, **기록 공개 설정**, 알림 설정, 연동 관리 |

UI 원칙: 여백 8의 배수, 좌우 16px, 포인트 색 1개 + 회색 계열, 글자 크기 4단계(32/20/16/13), 모든 정보는 같은 카드 컴포넌트, 화면당 강조 버튼 1개. 숫자는 "큰 숫자 + 작은 라벨". 모바일 375px 우선.

---

## 10. 구현 단계

### Phase 0 — 단일 HTML 프로토타입 (멀티 사용자 흉내)
- 파일 하나, 서버 없음, 저장은 IndexedDB. 상단에 **"현재 사용자 전환" 드롭다운**으로 여러 크루원 흉내.
- 시드 데이터:
  - 사용자 `운영자(admin, 공개)` = 운영자의 실제 `Activities.csv` 러닝 15건 (garmin-csv-import-spec.md §11.1)
  - 가짜 크루원 4명 (`지수 공개`, `현우 공개`, `서연 공개`, `도윤 비공개`): 2026-03~06월에 무작위지만 **고정 시드**(재실행해도 같은 값)로 월 3~12회, 3~15km 러닝 생성
- 구현: 공동 목표 링, 피드 + 하이파이브, 뱃지 화면, 번개 생성·참가·대기·출석 확정, 실시간 랭킹, 어워즈 확정 버튼(크론 대신 수동), 어워즈 카드 이미지 저장.
- "오늘 날짜" 를 바꿀 수 있는 디버그 입력(7일 규칙·마감 테스트용).

### Phase 1 — 실제 웹앱 통합
- 현재 스택에 맞춰 §6 테이블, §8 API, §7 이벤트·크론 구현.
- 뱃지 평가·랭킹 계산은 프레임워크 독립 순수 함수로 분리하고 §11 단위 테스트 작성.

---

## 11. 테스트 케이스

### 11.1 뱃지 — 운영자 실제 데이터(검증 러닝 15건) 기준 기대값
| 뱃지 | 결과 | 근거 |
|---|---|---|
| 🌅 새벽 러너 | ❌ 진행도 **0/5** | 06:00 이전 시작 없음 (가장 이른 것 06-06 06:13) |
| 🌙 나이트 러너 | ✅ earned_at **2026-06-30** | 20시 이후: 3/26 20:13, 3/31 20:11, 5/26 20:34, 6/9 20:57, **6/30 20:54**(5번째), 9/9 21:16 → 6회 |
| 🍕 맛집런 | ✅ earned_at **2026-05-05** | "동두천 케밥런-하스케밥"(5/5), 이후 "동두천 핫피자런"·"핫피자복귀런"(5/9) |
| ⚡ 더블헤더 | ✅ earned_at **2026-05-09** | 5/9 09:45 + 14:36 |
| 🔥 풀파워 | ✅ earned_at **2026-03-26** | TE 5.0: 3/26, 4/4, 4/26, 5/5, 5/9 09:45 |
| 🦶 케이던스 180 | ✅ earned_at **2026-03-26** | 3/26 평균 188 |
| 🏃 첫 10K | ✅ earned_at **2026-03-26** | 3/26 15.01km |
| 🥈 첫 하프 | ❌ 진행도 **15.01/21.1** | 단일 최장 15.01km. **5/9 하루 합산 21.25km로 지급되면 버그** |
| 🥇 첫 풀코스 | ❌ | |
| 📅 4주 연속 | ❌ 진행도 **3/4** | 연속 주: 3/23·3/30·4/6 주 (4/13 주 공백), 5/25·6/1·6/8 주 → 최장 3 |
| 🏠 트레드밀 장인 | ❌ 진행도 **5/10** | 트레드밀 5회 |
- **획득 6개**: 나이트 러너, 맛집런, 더블헤더, 풀파워, 케이던스 180, 첫 10K
- 최초 CSV 업로드 시점(오늘 2026-10-14 가정) 기준, 근거 러닝이 모두 7일보다 오래됐으므로 피드에는 **`badge_bulk` 1개**("뱃지 6개를 한 번에 받았어요")만 생겨야 한다.
- 9/9 러닝을 삭제하면 나이트 러너는 여전히 유지(5회 남음), 추가로 6/30도 삭제하면 **회수**.

### 11.2 공동 목표
| # | 상황 | 기대 |
|---|---|---|
| G1 | 목표 "2026-05 크루 50km", 운영자 데이터만 | 합계 **38.30km**, **76.6%**, 마일스톤 25·50·75 기록 |
| G2 | G1 + 운영자 수동 기록 5/20 12km(active) 추가 | 50.30km, **100.6%**, 100% 마일스톤 + 전체 알림 1회 |
| G3 | G2에서 수동 기록을 다시 저장해도 | 100% 알림 **중복 발송 없음** |
| G4 | 비공개 크루원 도윤이 5월에 20km | 합계에 포함, 기여자 목록에 이름 없이 "비공개 크루원 1명 · 20km" |
| G5 | 5/9 수동 기록 21km가 `replaced_by_garmin` | 합계에 21km **추가되지 않음** |
| G6 | 같은 기간 겹치는 목표 생성 | 거부 |

### 11.3 피드·하이파이브
| # | 상황 | 기대 |
|---|---|---|
| F1 | 운영자가 CSV(15건, 모두 7일 초과) 업로드 | `run_day` 0개, `bulk_import` 1개 ("지난 기록 14일치 · 총 122.33km"), `badge_bulk` 1개 |
| F2 | CSV 사본에서 2026-06-07 이후 행(6/9, 6/30, 9/9)을 지우고, 오늘 = 2026-06-08 12:00으로 두고 업로드 | 6/5, 6/6은 7일 이내 → `run_day` 2개, 나머지 9일치는 `bulk_import` 1개 ("지난 기록 9일치 · 총 93.48km") |
| F3 | 같은 날 러닝이 추가로 올라옴 | 그날 `run_day` **새로 만들지 않고 값 갱신** |
| F4 | 자기 글에 하이파이브 | 403 |
| F5 | 하이파이브 → 취소 → 다시 | 최종 1개, 응원왕 집계 1 |
| F6 | `share_records=false` 사용자 업로드 | 피드 항목 생성 안 됨 |

### 11.4 번개런
| # | 상황 | 기대 |
|---|---|---|
| B1 | 최대 3명 번개(호스트 포함)에 3명째 참가 → 4명째 참가 | 4명째는 `waitlist` |
| B2 | 참가자 1명 취소 | 대기 1번이 `joined`로 + 즉시 알림 |
| B3 | 호스트가 참가 취소 시도 | 거부, "번개를 취소하세요" |
| B4 | 시작 시각 이후 참가 | 거부 |
| B5 | 호스트가 1명 결석 처리 후 확정 | 나머지 `attended`, `bungae_done` 피드, 출석 수 반영 |
| B6 | 24시간 미확정 | 참가자 전원 `attended`로 자동 확정 |

### 11.5 월말 어워즈 (운영자 실제 데이터, 4월)
| 부문 | 운영자 값 | 비고 |
|---|---|---|
| 거리왕 | **30.16km** | 4/4 9.98 + 4/12 5.01 + 4/21 5.09 + 4/26 10.08 |
| 꾸준왕 | **4일** | |
| 성장왕 | **+20.5%** | 3월 25.02km(≥10km) → 4월 30.16km |
| 새벽왕 | **0회** → 대상 아님 | 4월 러닝 시작 모두 07:00 이후 (07:33, 08:15, 08:31, 19:50) |
- 6월 새벽왕: 06-06 06:13 → **1회**
- 3월 성장왕: 2월 기록 없음 → **대상 아님**
- 동점 2명이면 둘 다 rank 1 (공동 수상)
- 5월 4일 00:10 확정 후 4월 기록을 추가 업로드해도 `monthly_awards` 4월 값 **변하지 않음**

### 11.6 공개 설정
- `share_records=false` 사용자: 랭킹·어워즈·피드 없음, 공동 목표에는 합산, 본인 화면에서는 자기 뱃지·기록 정상 표시.

---

## 12. 설정값 모음
| 이름 | 기본값 |
|---|---|
| FEED_RECENT_DAYS | 7 |
| GRACE_DAYS (목표·어워즈 마감 유예) | 3 |
| HIGHFIVE_DAILY_LIMIT | 100 |
| DIGEST_TIME | 21:00 |
| BUNGAE_REMIND_BEFORE | 2시간 |
| BUNGAE_AUTO_CONFIRM_AFTER | 24시간 |
| GROWTH_MIN_PREV_KM | 10 |
| AWARD_TOP_N | 3 |
| DAWN_BADGE_HOUR / DAWN_AWARD_HOUR | 6 / 7 |
| NIGHT_BADGE_HOUR | 20 |
| FOOD_KEYWORDS | §3.2 목록 |
