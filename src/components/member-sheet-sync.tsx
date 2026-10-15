"use client";
import { useActionState, useState } from "react";
import { syncMembersAction } from "@/app/actions";
import type { MemberDiff, SyncResult } from "@/lib/member-sync-types";

/** 시트 회원 동기화: 먼저 현재 회원과 시트의 차이를 비교해 보고, 담당자 비밀번호를 입력해야 적용된다 */
export default function MemberSheetSync({ url, children }: { url: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState<SyncResult, FormData>((_s, fd) => syncMembersAction(_s, fd), null);
  const [pw, setPw] = useState("");
  const diff = state?.diff;
  const applied = !!state?.applied;
  return (
    <div className="member-tools">
      {/* 한 줄: 시트 회원 동기화 버튼 + (children) 크루원 추가 */}
      <div className="member-tools-row">
        <button type="button" className="btn btn-excel" aria-expanded={open} onClick={() => setOpen((v) => !v)}>시트 회원 동기화</button>
        {children}
      </div>
      {open && <form action={run} className="panel p-4 grid gap-3 mt-2" data-af="1">
        <h2 className="font-bold">시트 회원 동기화</h2>
        <label className="field">
          <span className="label">시트 탭 주소</span>
          <input name="url" type="url" className="input" required defaultValue={url} />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <button type="submit" name="mode" value="preview" className="btn" disabled={pending}>{pending ? "확인 중…" : "① 변경 내용 비교"}</button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--lane)]">시트 열기 ↗</a>
        </div>

        {state?.msg && <p role="status" className={`text-sm ${state.ok ? "" : "text-[var(--bad)]"}`}>{state.msg}</p>}
        {diff && <DiffView diff={diff} applied={applied} />}

        {diff && !applied && (
          <div className="sync-apply grid gap-2">
            <label className="field">
              <span className="label">② 내 비밀번호 (접속한 담당자)</span>
              <input name="pw" type="password" autoComplete="current-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호 입력" />
            </label>
            <button type="submit" name="mode" value="apply" className="btn btn-excel" disabled={pending || !pw}>{pending ? "적용 중…" : "동기화 적용"}</button>
          </div>
        )}
      </form>}
    </div>
  );
}

function DiffView({ diff, applied }: { diff: MemberDiff; applied: boolean }) {
  const nothing = !diff.added.length && !diff.renamed.length && !diff.promoted.length;
  const blankOverwrites = diff.renamed.filter((r) => r.blank);
  return (
    <div className="sync-diff grid gap-2.5">
      <div className="sync-stats">
        <span>시트 <b className="num">{diff.sheetTotal}</b>명</span>
        <span>현재 <b className="num">{diff.currentTotal}</b>명</span>
        <span>변경 없음 <b className="num">{diff.unchanged}</b>명</span>
      </div>
      {nothing && <p className="text-sm">{applied ? "바뀐 내용이 없었어요." : "바뀌는 내용이 없어요. 그대로 두어도 돼요."}</p>}

      {diff.added.length > 0 && (
        <section className="sync-block sync-add">
          <h3>＋ 새로 추가 ({diff.added.length})</h3>
          <ul>{diff.added.map((a) => <li key={a.nick}><b>{a.nick}</b> / {a.name}{a.admin && <em> · 운영진</em>}</li>)}</ul>
        </section>
      )}
      {diff.renamed.length > 0 && (
        <section className="sync-block sync-warn">
          <h3>⚠ 이름 덮어쓰기 ({diff.renamed.length})</h3>
          <ul>{diff.renamed.map((r) => <li key={r.nick}><b>{r.nick}</b> : {r.from} <span aria-hidden>→</span> <b className={r.blank ? "sync-bad" : ""}>{r.to}</b>{r.blank && <em> · 시트 이름이 비어 있어요</em>}</li>)}</ul>
          {blankOverwrites.length > 0 && <p className="sync-note">시트 B열이 비어 있는 {blankOverwrites.length}명은 ‘없음’으로 바뀌어요. 원치 않으면 시트에 이름을 먼저 채워 주세요.</p>}
        </section>
      )}
      {diff.promoted.length > 0 && (
        <section className="sync-block sync-add">
          <h3>★ 운영진으로 지정 ({diff.promoted.length})</h3>
          <ul>{diff.promoted.map((n) => <li key={n}><b>{n}</b></li>)}</ul>
        </section>
      )}
      {diff.missing.length > 0 && (
        <section className="sync-block">
          <h3>시트에 없는 회원 ({diff.missing.length}) · 지우지 않고 그대로 둬요</h3>
          <ul>{diff.missing.map((m) => <li key={m.nick}><b>{m.nick}</b> / {m.name}</li>)}</ul>
        </section>
      )}
      <p className="sync-note">동기화는 닉네임·이름·운영진 지정만 반영해요. 비밀번호, 월간 기록, 대회 참가 기록은 건드리지 않고, 기존 운영진의 권한도 내리지 않아요.</p>
    </div>
  );
}
