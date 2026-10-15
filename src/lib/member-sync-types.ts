/** 시트 회원 동기화: 적용 전에 보여 주는 비교 결과 */
export type MemberDiff = {
  sheetTotal: number;
  currentTotal: number;
  unchanged: number;
  added: { nick: string; name: string; admin: boolean }[];
  /** 덮어쓰이는 이름 (blank: 시트 이름이 비어 있어 ‘없음’으로 바뀌는 경우) */
  renamed: { nick: string; from: string; to: string; blank: boolean }[];
  promoted: string[];
  /** 시트에 없는 회원: 지우지 않고 그대로 둔다 */
  missing: { nick: string; name: string }[];
};
export type SyncResult = { ok: boolean; msg?: string; diff?: MemberDiff; applied?: boolean } | null;
