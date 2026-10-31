import { bingoComment, bingoCommentRemove } from "@/app/actions";
import { ActionForm, ConfirmButton, Submit } from "@/components/action-form";
import PhotoZoom from "@/components/photo-zoom";
import type { BingoComment, BingoMission } from "@/lib/bingo-store";

export const bingoPhotoUrl = (p: string) => `/api/bingo-srv/storage/v1/object/public/proofs/${p.split("/").map(encodeURIComponent).join("/")}`;
const when = (at: number) => new Date(at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");

/** 운영진이 인증 한 건을 확인하는 카드: 사진(누르면 팝업으로 크게) · 달린 댓글 · 댓글 달기 */
export default function BingoReviewCard({ r, mission, name }: { r: { n: string; no: number; photo: string; comments: BingoComment[] }; mission?: BingoMission; name?: string }) {
  return (
    <div className="grid gap-2 border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-2 min-w-0">
        <b className="truncate">{r.n}/{name || "없음"}</b>
        <span className="text-sm truncate">{mission ? `${mission.e} ${mission.t.replace(/\n/g, " ")}` : `${r.no}번 미션`}</span>
        <small className="text-muted ml-auto shrink-0">{r.no}번</small>
      </div>
      {r.photo ? <PhotoZoom src={bingoPhotoUrl(r.photo)} alt={`${r.n} 인증 사진`} /> : <p className="text-sm text-muted">사진 없음</p>}
      {r.comments.map((c) => (
        <div key={c.at} className="flex items-start gap-2 text-sm">
          <span className="min-w-0">💬 {c.text} <small className="text-muted">· {c.by} · {when(c.at)}</small></span>
          <ActionForm action={bingoCommentRemove} keep hideInline className="ml-auto shrink-0">
            <input type="hidden" name="nick" value={r.n} /><input type="hidden" name="no" value={r.no} /><input type="hidden" name="at" value={c.at} />
            <ConfirmButton message="이 댓글을 지울까요?" className="btn btn-ghost btn-danger text-xs py-0.5 px-2">지우기</ConfirmButton>
          </ActionForm>
        </div>
      ))}
      <ActionForm action={bingoComment} hideInline className="flex gap-2">
        <input type="hidden" name="nick" value={r.n} /><input type="hidden" name="no" value={r.no} />
        <input name="text" className="input min-w-0 flex-1" maxLength={300} required placeholder="잘못된 이유를 댓글로 남겨요" aria-label={`${r.n} 님 인증에 댓글`} />
        <Submit className="btn btn-primary text-xs shrink-0" pendingText="보내는 중…">댓글 달기</Submit>
      </ActionForm>
    </div>
  );
}
