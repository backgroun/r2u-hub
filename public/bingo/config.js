// ===== 설정 (이벤트 기간 / Supabase 주소와 키는 여기만 고치면 돼요) =====
let START = '2026-11-01';   // 서버(운영진 화면)에서 바꾸면 자동으로 덮어써져요
let END = '2026-11-30';
const KEY = 'r2u-bingo-2026-11';
let MAX_PER_DAY = 3;     // 하루 최대 미션 수 (서버 운영진 화면에서 바꾸면 자동으로 덮어써져요)
const CENTER = 12;       // 가운데 칸(13번)
const MIN_PW = 4;        // 비밀번호 최소 글자 수
const PHOTO_REQUIRED = true;  // 인증 사진 필수 (false 로 바꾸면 사진 없이도 인증돼요. Supabase 의 settings 표 photo_required 와 같게!)

// ===== Supabase 연동 (둘 중 하나라도 비어 있으면 테스트 모드: 더미 명단, 이 폰에만 저장) =====
// 주소: Supabase 프로젝트 주소 / 키: Project Settings > API 의 'anon public' (또는 'publishable') 키 (공개돼도 안전한 키예요)
// 절대로 'service_role' 키를 여기에 넣지 마세요!
const SUPABASE_URL = '/api/bingo-srv'; // 허브가 직접 처리해요 (별도 서버 없음)
const SUPABASE_ANON_KEY = 'hub'; // 사용하지 않는 자리표시 값 (비어 있으면 테스트 모드가 켜져요)

// 테스트 모드용 더미 참가자 (pw가 빈 칸이면 '처음 입장 = 비밀번호 직접 설정' 체험용)
const DUMMY_ROSTER = [
  { name: '토끼', pw: '1234' },
  { name: '거북이', pw: '1234' },
  { name: '다람쥐', pw: '1234' },
  { name: '고라니', pw: '' },
  { name: '여우', pw: '' },
  { name: '곰돌이', pw: '' },
  { name: '펭귄', pw: '' },
  { name: '치타', pw: '' },
];
