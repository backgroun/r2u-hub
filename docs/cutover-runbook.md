# 전환 당일 실행서 (Upstash → Supabase) 와 Vercel 이전 체크리스트

계획서(`migration-plan.md`)의 6·7·9장을 그대로 따라 칠 수 있게 명령으로 풀어 쓴 것. 비밀값(접속 주소, 토큰)은 화면·채팅에 출력하지 않는다.
모든 명령은 프로젝트 폴더에서 실행. 팀 이름은 `--scope young83`.

## A. Supabase 전환 (대회 없는 평일 00:30~01:30)

### 전날
- [ ] 홈 공지: "내일 00:30~01:30 점검(보기만 가능)" 올리기
- [ ] `npm test && npm run test:pg` 통과, `git status` 깨끗, 최신 코드가 운영에 배포돼 있음
- [ ] `.env.local`에 `DATABASE_URL`(Transaction pooler, 6543) 있음, `node scripts/kv/verify.mjs`로 접속만 확인

### 당일
1. 점검 켜기 (쓰기 차단 + 배너)
   ```bash
   vercel env add MAINTENANCE production --scope young83   # 값: 1
   vercel deploy --prod --yes --scope young83
   ```
   확인: 쓰기 동작(예: 참석 체크)이 "점검 중" 안내로 막힘, 홈 위에 노란 배너
2. 백업(2곳에 보관)
   ```bash
   node scripts/kv/backup.mjs        # backups/r2u-날짜-시각.json
   ```
3. 복사 + 검증
   ```bash
   node --no-warnings scripts/kv/import.mjs backups/<파일>.json --truncate
   node --no-warnings scripts/kv/verify.mjs      # "✔ 모든 키가 같아요" 가 나와야 함
   ```
   (`r2u:lastSeen`처럼 접속 때마다 바뀌는 키는 점검 중이라 거의 안 바뀜. 불일치 0이 아니면 중단)
4. 운영 환경변수를 Supabase로 (값은 `vercel env add`가 물어볼 때 직접 입력)
   ```bash
   vercel env add DATABASE_URL production --scope young83
   vercel env add DATA_BACKEND production --scope young83     # 값: postgres
   vercel env rm MAINTENANCE production --scope young83 --yes # 점검 해제는 아래 6번 뒤에
   ```
   순서 주의: `MAINTENANCE`는 점검표 통과 뒤에 내린다. 바로 지우지 말고 5번까지 끝낸 뒤 6번에서 한다.
5. 재배포 + 점검표(8장)
   ```bash
   vercel deploy --prod --yes --scope young83
   ```
   홈, 대회 일정, 로그인, 단사·뒷풀이, 알림, `/bingo`, 공구 화면 응답 확인. 로그 오류 0건.
6. 통과하면 점검 해제: `vercel env rm MAINTENANCE production --scope young83 --yes` → 재배포 → 공지 내리기

### 롤백 (5분 안에 판단)
- **쓰기 차단 중(5번 직후)**: `DATA_BACKEND`를 `redis`로 바꾸거나 `vercel env rm DATA_BACKEND production` → 재배포. Upstash는 그대로라 즉시 원상.
- **쓰기가 생긴 뒤**: 먼저 점검을 다시 켜고(1번) 아래로 되돌린 다음 `DATA_BACKEND`를 되돌린다.
  ```bash
  node --no-warnings scripts/kv/reverse.mjs          # 무엇이 바뀔지 확인만
  node --no-warnings scripts/kv/reverse.mjs --yes    # Upstash 에 되돌려 쓰기
  ```
- Upstash 데이터는 전환 후 2주간 삭제하지 않는다.

## B. Vercel 회사 팀으로 이전

핵심: 주소 `crew-groupbuy.vercel.app`이 바뀌면 홈 화면 앱·푸시 구독이 끊긴다. 이 주소는 팀/프로젝트 이름으로 정해지므로 **이전 방식에 따라 유지 여부가 달라진다.** 그래서 순서는 "확인 → 이전".

사전
- [ ] A 전환 후 3~7일 안정
- [ ] 프로젝트에서 Upstash 연동(마켓플레이스) 분리 — Supabase 사용 중이라 이미 불필요
- [ ] 회사 팀에서 내 역할이 Owner/Member(프로젝트 이전 권한), 결제 수단 확인
- [ ] 환경변수 목록 기록(이름만): `vercel env ls production --scope young83`. 특히 `SESSION_SECRET`, `VAPID_*`는 값 그대로 이관(바뀌면 전원 로그아웃/푸시 끊김)

리허설 (운영 영향 없음)
1. 회사 팀에 **새 프로젝트**(이름 예: `crew-groupbuy-test`)를 만들고 같은 환경변수로 배포
2. 새 주소에서 로그인·참석 체크·푸시 구독이 되는지 확인 (주소가 달라서 운영 푸시와는 별개)
3. 회사 팀에서 `crew-groupbuy` 이름을 쓸 수 있는지 확인 (같은 이름은 전 세계 공유 도메인이라 현재 프로젝트를 먼저 이전해야 가능할 수 있음)

실행 (방식 1: Transfer)
- 대시보드: Project → Settings → General → Transfer Project → 회사 팀 선택. 이전 후 `*.vercel.app` 주소가 유지되는지 즉시 확인.
- 유지되지 않으면 이전 팀에서 되돌리기 어렵다 → 불안하면 내 도메인을 붙인 뒤(방식 2) 이전한다.

이전 후 해야 할 것
- [ ] GitHub 저장소 연결 다시 하기, 배포 보호(Vercel Authentication)가 production에 없는지 확인
- [ ] GitHub Actions 시크릿 `APP_URL`, `CRON_SECRET` 점검 (`.github/workflows/collect-news.yml`)
- [ ] 이 폴더 연결 갱신: `vercel link --scope <회사팀>`, 앞으로 배포 명령의 `--scope` 교체
- [ ] 함수 지역이 `icn1`인지(`vercel.json`), 분석·로그 이력은 안 넘어올 수 있음을 공지
