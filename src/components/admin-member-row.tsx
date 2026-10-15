"use client";

import { useState } from "react";
import Link from "next/link";
import { memberAction, editMemberByAdmin } from "@/app/actions";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import { CrownIcon, GearIcon, LevelBadge } from "@/components/crown";
import type { Member } from "@/lib/hub";

export default function AdminMemberRow({ m, self, pushEnabled, lastSeen, lv }: { m: Member; self: string; pushEnabled: boolean; lastSeen?: number; lv?: number }) {
  const [edit, setEdit] = useState<"nick" | "name" | null>(null);
  return (
    <div className="member-row">
      <div className="member-row-main">
        {/* 1줄: 이름·알림·관리자 / 2줄: 비번없음·최근 접속 (작게). 버튼은 늘 오른쪽 같은 줄 */}
        <Link href={`/admin/members/${encodeURIComponent(m.nick)}`} className="member-name" title={`${m.nick}님의 개인 현황 보기`}>
          <span className="member-name-top">
            <b>{m.manager ? <GearIcon /> : m.role === "admin" ? <CrownIcon /> : null}{m.nick}/{m.name?.trim() || "없음"}{lv ? <LevelBadge lv={lv} /> : null}</b>
            <span role="img" aria-label={pushEnabled ? "알림 켜짐" : "알림 꺼짐"} title={pushEnabled ? "알림 켜짐" : "알림 꺼짐"} className={pushEnabled ? "text-sm shrink-0" : "text-sm shrink-0 opacity-40"}>{pushEnabled ? "🔔" : "🔕"}</span>
            {m.manager && <span className="chip shrink-0">관리자</span>}
          </span>
          <span className="member-name-sub">
          {!m.pw && <span className="chip chip-warn shrink-0">비번없음</span>}
          <span className="text-xs text-muted whitespace-nowrap" title="최근 접속 (한국 시간)">{Number.isFinite(lastSeen) && lastSeen ? `${new Date(lastSeen + 9 * 3600_000).toISOString().slice(5, 16).replace("-", "/").replace("T", " ")} 접속` : "접속 기록 없음"}</span>
          </span>
        </Link>
        <span className="member-actions">
          <button type="button" className="btn btn-ghost text-xs" aria-expanded={edit === "nick"} onClick={() => setEdit(edit === "nick" ? null : "nick")}>닉넴수정</button>
          <button type="button" className="btn btn-ghost text-xs" aria-expanded={edit === "name"} onClick={() => setEdit(edit === "name" ? null : "name")}>이름수정</button>
          {m.nick !== self && (
            <form action={memberAction}>
              <input type="hidden" name="nick" value={m.nick} /><input type="hidden" name="act" value="delete" />
              <ConfirmButton className="btn btn-ghost btn-danger text-xs">삭제</ConfirmButton>
            </form>
          )}
        </span>
      </div>
      {edit && <ActionForm key={`${m.nick}:${m.name}:${edit}`} action={editMemberByAdmin} className="member-edit-form" keep>
        <input type="hidden" name="oldNick" value={m.nick} />
        <input type="hidden" name="kind" value={edit} />
        <label className="field">
          <span className="label">{edit === "nick" ? "새 닉네임" : "이름 (1~4자)"}</span>
          <input name={edit === "nick" ? "newNick" : "name"} className="input" defaultValue={edit === "nick" ? m.nick : m.name === "없음" ? "" : m.name || ""} maxLength={edit === "nick" ? 5 : 4} required autoFocus />
        </label>
        <Submit className="btn btn-primary text-sm" confirm={edit === "nick" ? `${m.nick} 님의 닉네임을 바꿀까요?` : `${m.nick} 님의 이름을 바꿀까요?`}>저장</Submit>
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setEdit(null)}>닫기</button>
      </ActionForm>}
    </div>
  );
}

