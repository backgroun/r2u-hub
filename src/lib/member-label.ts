/** 회원 명단에 있는 닉네임은 닉넴/이름으로, 외부 주문 이름은 입력 그대로 표시한다. */
export function knownMemberLabel(nick: string, names: Record<string, string>) {
  return Object.hasOwn(names, nick) ? `${nick}/${names[nick]?.trim() || "없음"}` : nick;
}
