"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, kstToday, newId } from "@/lib/hub";
import { isConfirmed, CONFIRM_REQUIRED } from "@/lib/confirm-token";
import { activeChallenge, getBlocks, setChallengeConfig } from "@/lib/event-blocks";
import {
  addLog, delImage, getActRec, getAppeal, getMemberRec, listActs, listAppeals, putImage, removeActRec, removeMemberRec, saveActRec, saveAppeal, saveMemberRec, setPlaceGroup,
} from "@/lib/challenge/store";
import { IMG_KINDS, RULE, phaseOf, placeKey, validateActivity, validateConfig, type ActStatus, type Activity, type ChallengeConfig, type ImgKind, type RawInput } from "@/lib/challenge/rules";
import type { Result } from "@/app/actions";

const ok = (msg?: string): Result => ({ ok: true, msg });
const fail = (msg: string): Result => ({ ok: false, msg });
const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
/** 빈 칸이면 null, 숫자가 아니면 NaN */
const num = (fd: FormData, k: string): number | null => {
  const s = String(fd.get(k) ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

async function me() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
const refresh = () => { revalidatePath("/event"); revalidatePath("/event/challenge"); revalidatePath("/admin"); };

/** 지금 진행 중인 챌린지 블록(폼이 가리키는 것과 같아야 한다) */
async function liveBlock(fd: FormData) {
  const block = await activeChallenge();
  return block?.challenge && block.id === str(fd, "id", 20) ? { block, cfg: block.challenge } : null;
}

/* ---------- 참가 신청·취소 ---------- */
export async function joinChallengeAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 신청을 받는 챌린지가 없어요.");
  if (phaseOf(live.cfg, kstToday()) !== "signup") return fail("신청 기간이 아니에요.");
  if (fd.get("agree") !== "on") return fail("규정과 ‘회비 환불 없음’에 동의해 주세요.");
  if (await getMemberRec(live.block.id, u.nick)) return fail("이미 신청했어요.");
  const now = Date.now();
  await saveMemberRec(live.block.id, { nick: u.nick, appliedAt: now, agreedAt: now, paid: false });
  await addLog(live.block.id, { by: u.nick, action: "join", target: u.nick });
  refresh();
  return ok(`신청했어요! 회비 ${live.cfg.fee.toLocaleString("ko-KR")}원을 입금하면 운영진이 확인한 뒤 참가가 확정돼요.`);
}

export async function leaveChallengeAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 신청을 받는 챌린지가 없어요.");
  if (phaseOf(live.cfg, kstToday()) !== "signup") return fail("신청 기간이 끝나서 취소할 수 없어요.");
  if (!(await getMemberRec(live.block.id, u.nick))) return fail("신청 내역이 없어요.");
  await removeMemberRec(live.block.id, u.nick);
  await addLog(live.block.id, { by: u.nick, action: "leave", target: u.nick });
  refresh();
  return ok("신청을 취소했어요. 낸 회비는 돌려드리지 않아요.");
}

/* ---------- 기록 올리기·수정 ---------- */
const FILE_FIELD: Record<ImgKind, string> = { summary: "img_summary", cadence: "img_cadence", zone: "img_zone", map: "img_map" };
const IMG_TYPES = ["image/webp", "image/jpeg", "image/png"];

export async function submitActivityAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 기록을 받는 챌린지가 없어요.");
  const today = kstToday();
  const phase = phaseOf(live.cfg, today);
  if (phase !== "running" && phase !== "upload") return fail("지금은 기록을 올릴 수 있는 기간이 아니에요.");
  if (!(await getMemberRec(live.block.id, u.nick))) return fail("참가 신청한 사람만 기록을 올릴 수 있어요.");

  const actId = str(fd, "actId", 20);
  const existing = actId ? await getActRec(live.block.id, actId) : null;
  if (actId && (!existing || existing.nick !== u.nick)) return fail("수정할 기록을 찾을 수 없어요.");

  const files: Partial<Record<ImgKind, { type: string; data: string }>> = {};
  for (const kind of IMG_KINDS) {
    const f = fd.get(FILE_FIELD[kind]);
    if (!(f instanceof File) || f.size === 0) continue;
    if (!IMG_TYPES.includes(f.type)) return fail("JPG, PNG, WebP 이미지만 올릴 수 있어요.");
    if (f.size > RULE.imageMaxBytes) return fail("캡처 용량이 너무 커요. 다시 골라 주세요.");
    files[kind] = { type: f.type, data: Buffer.from(await f.arrayBuffer()).toString("base64") };
  }

  const dur = [num(fd, "durH"), num(fd, "durM"), num(fd, "durS")].map((n) => n ?? 0);
  const raw: RawInput = {
    startedAt: str(fd, "startedAt", 16),
    distanceKm: num(fd, "distanceKm"),
    durationSec: dur.every((n) => Number.isFinite(n) && n >= 0) ? Math.round(dur[0] * 3600 + dur[1] * 60 + dur[2]) : null,
    surface: str(fd, "surface", 10),
    cadence: num(fd, "cadence"),
    avgHr: num(fd, "avgHr"),
    zone2Pct: num(fd, "zone2Pct"),
    place: str(fd, "place", 60),
  };
  // 수정할 때 선택 항목(케이던스·Zone 2·장소)을 비우고 새 캡처도 없으면 그 항목은 지운 것으로 본다
  const keep = (kind: ImgKind, hasValue: boolean) => !!files[kind] || (hasValue && !!existing?.imgs[kind]);
  const flags = {
    summary: !!files.summary || !!existing?.imgs.summary,
    cadence: keep("cadence", raw.cadence != null),
    zone: keep("zone", raw.zone2Pct != null || raw.avgHr != null),
    map: keep("map", raw.place !== ""),
  };
  const v = validateActivity(raw, flags, live.cfg, today);
  if (!v.ok) return fail(v.msg);

  const mine = (await listActs(live.block.id)).filter((a) => a.nick === u.nick);
  if (mine.some((a) => a.startedAt === v.value.startedAt && a.id !== actId)) return fail("같은 시작 시각의 기록을 이미 올렸어요.");

  // 새 기록은 (닉네임, 시작 시각)에서 정한 id를 쓴다: 더블탭·재시도로 동시에 두 번 들어와도 한 기록으로 합쳐진다.
  // 수정으로 시작 시각이 바뀐 옛 기록이 같은 id를 쓰고 있으면 충돌이므로 무작위 id로 돌린다.
  let id = existing?.id;
  if (!id) {
    const det = createHash("sha1").update(`${u.nick}|${v.value.startedAt}`).digest("base64url").slice(0, 10);
    const clash = await getActRec(live.block.id, det);
    id = clash && (clash.nick !== u.nick || clash.startedAt !== v.value.startedAt) ? newId() : det;
  }
  const now = Date.now();
  const imgs: Activity["imgs"] = {};
  for (const kind of IMG_KINDS) if (flags[kind]) imgs[kind] = true;
  for (const kind of IMG_KINDS) if (files[kind]) await putImage(live.block.id, id, kind, files[kind]!);
  await saveActRec(live.block.id, { id, nick: u.nick, ...v.value, imgs, status: "pending", createdAt: existing?.createdAt ?? now, updatedAt: now });
  // 기록을 먼저 저장한 뒤에 빠진 캡처를 지운다(저장이 실패해도 기록이 지워진 이미지를 가리키지 않게)
  for (const kind of IMG_KINDS) if (existing?.imgs[kind] && !imgs[kind]) await delImage(live.block.id, id, kind);
  if (existing) await addLog(live.block.id, { by: u.nick, action: "edit", target: `${u.nick}/${id}` });
  refresh();
  return ok(existing ? "수정했어요. 운영진이 다시 확인해요." : "기록을 올렸어요! 운영진이 캡처를 확인해요.");
}

export async function deleteActivityAction(fd: FormData) {
  if (!(await isConfirmed(fd.get("confirmToken")))) return; // 비밀번호 확인 필요
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return;
  const phase = phaseOf(live.cfg, kstToday());
  if (phase !== "running" && phase !== "upload") return;
  const a = await getActRec(live.block.id, str(fd, "actId", 20));
  if (!a || a.nick !== u.nick) return;
  await removeActRec(live.block.id, a.id);
  await addLog(live.block.id, { by: u.nick, action: "delete", target: `${u.nick}/${a.id}` });
  refresh();
}

/* ---------- 이의 제기 ---------- */
export async function fileAppealAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd);
  if (!live) return fail("지금 이의 제기를 받는 챌린지가 없어요.");
  if (phaseOf(live.cfg, kstToday()) !== "appeal") return fail("이의 제기 기간이 아니에요.");
  if (!(await getMemberRec(live.block.id, u.nick))) return fail("참가자만 이의 제기를 할 수 있어요.");
  const a = await getActRec(live.block.id, str(fd, "actId", 20));
  if (!a || a.nick !== u.nick) return fail("이의 제기할 기록을 골라 주세요.");
  const reason = str(fd, "reason", 300);
  if (reason.length < 5) return fail("이의 사유를 5자 이상 적어 주세요.");
  if ((await listAppeals(live.block.id)).some((p) => p.actId === a.id && !p.done)) return fail("이 기록은 이미 이의 제기를 접수했어요.");
  const id = newId();
  await saveAppeal(live.block.id, { id, nick: u.nick, actId: a.id, reason, at: Date.now(), done: false });
  await addLog(live.block.id, { by: u.nick, action: "appeal", target: `${u.nick}/${a.id}`, note: reason });
  refresh();
  return ok("이의 제기를 접수했어요. 운영진이 확인하고 답해요.");
}

/* ====================== 운영진 ====================== */
async function staff() {
  const u = await me();
  if (!u.admin) throw new Error("운영진만 할 수 있어요.");
  return u;
}
async function challengeBlock(id: string) {
  const b = (await getBlocks()).find((x) => x.id === id && x.type === "challenge" && x.challenge);
  if (!b) throw new Error("챌린지를 찾을 수 없어요.");
  return b;
}

/** 입금 확인·취소 */
export async function setPaidAction(fd: FormData) {
  const u = await staff();
  const blockId = str(fd, "id", 20), nick = str(fd, "nick", 30);
  const m = await getMemberRec(blockId, nick);
  if (!m) return;
  const paid = fd.get("paid") === "1";
  await saveMemberRec(blockId, { ...m, paid, ...(paid ? { paidAt: Date.now(), paidBy: u.nick } : { paidAt: undefined, paidBy: undefined }) });
  await addLog(blockId, { by: u.nick, action: paid ? "paid" : "unpaid", target: nick });
  refresh();
}

/** 기록 승인·반려. 본인 기록은 다른 운영진이 검수한다. */
export async function reviewActivityAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const blockId = str(fd, "blockId", 20), decision = str(fd, "decision", 10), reason = str(fd, "reason", 200);
  const a = await getActRec(blockId, str(fd, "actId", 20));
  if (!a) return fail("기록을 찾을 수 없어요.");
  if (a.nick === u.nick) return fail("본인 기록은 다른 운영진이 검수해요.");
  if (decision !== "ok" && decision !== "rejected") return fail("승인 또는 반려를 골라 주세요.");
  if (decision === "rejected" && reason.length < 2) return fail("반려 사유를 적어 주세요.");
  await saveActRec(blockId, { ...a, status: decision as ActStatus, rejectReason: decision === "rejected" ? reason : undefined, reviewedBy: u.nick, reviewedAt: Date.now() });
  await addLog(blockId, { by: u.nick, action: decision === "ok" ? "approve" : "reject", target: `${a.nick}/${a.id}`, note: reason || undefined });
  refresh();
  return ok(decision === "ok" ? "승인했어요." : "반려했어요. 참가자 화면에 사유가 보여요.");
}

/** 장소 정리표: 입력된 장소를 묶음 이름으로 묶는다(비우면 묶음 해제) */
export async function setPlaceGroupAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const blockId = str(fd, "id", 20), raw = str(fd, "raw", 60), label = str(fd, "label", 40);
  if (!raw) return fail("장소를 찾을 수 없어요.");
  await setPlaceGroup(blockId, placeKey(raw), label || null);
  await addLog(blockId, { by: u.nick, action: "place-group", target: raw, note: label || "묶음 해제" });
  refresh();
  return ok(label ? `‘${raw}’를 ‘${label}’ 장소로 묶었어요.` : "묶음을 풀었어요.");
}

export async function resolveAppealAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const blockId = str(fd, "id", 20), answer = str(fd, "answer", 300);
  const p = await getAppeal(blockId, str(fd, "appealId", 20));
  if (!p) return fail("이의 제기를 찾을 수 없어요.");
  if (answer.length < 2) return fail("답변을 적어 주세요.");
  await saveAppeal(blockId, { ...p, done: true, answer, answeredBy: u.nick, answeredAt: Date.now() });
  await addLog(blockId, { by: u.nick, action: "appeal-answer", target: `${p.nick}/${p.actId}`, note: answer });
  refresh();
  return ok("답변했어요.");
}

/** 설정 변경 내역을 `필드 이전→이후` 목록으로 만든다(처리 기록용) */
function configDiff(a: ChallengeConfig, b: ChallengeConfig): string {
  const out: string[] = [];
  const cmp = (name: string, x: string | number, y: string | number) => { if (x !== y) out.push(`${name} ${x}→${y}`); };
  cmp("신청시작", a.signupStart, b.signupStart); cmp("신청마감", a.signupEnd, b.signupEnd);
  cmp("기록시작", a.start, b.start); cmp("기록종료", a.end, b.end);
  cmp("업로드마감", a.uploadEnd, b.uploadEnd); cmp("이의제기마감", a.appealEnd, b.appealEnd); cmp("최종확정", a.finalAt, b.finalAt);
  cmp("회비", a.fee, b.fee);
  cmp("은행", a.bank.bank, b.bank.bank); cmp("계좌", a.bank.account, b.bank.account); cmp("예금주", a.bank.holder, b.bank.holder);
  cmp("상품", a.prizes.join(", "), b.prizes.join(", "));
  if (a.spendNote !== b.spendNote) out.push("회비 사용 내역 변경");
  return out.length ? out.join(" / ") : "변경 없음";
}

/** 챌린지 설정 저장(기간·회비·계좌·상품). 규정이 바뀌는 일이라 비밀번호 확인이 필요하고 로그를 남긴다. */
export async function saveChallengeConfigAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  if (!(await isConfirmed(fd.get("confirmToken")))) return fail(CONFIRM_REQUIRED);
  const b = await challengeBlock(str(fd, "id", 20));
  const cfg: ChallengeConfig = {
    fee: Number(str(fd, "fee", 8)),
    bank: { bank: str(fd, "bank", 20), account: str(fd, "account", 30), holder: str(fd, "holder", 20) },
    signupStart: str(fd, "signupStart", 10), signupEnd: str(fd, "signupEnd", 10),
    start: str(fd, "start", 10), end: str(fd, "end", 10),
    uploadEnd: str(fd, "uploadEnd", 10), appealEnd: str(fd, "appealEnd", 10), finalAt: str(fd, "finalAt", 10),
    prizes: String(fd.get("prizes") ?? "").split("\n").map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
    spendNote: str(fd, "spendNote", 500),
  };
  const bad = validateConfig(cfg);
  if (bad) return fail(bad);
  const note = configDiff(b.challenge as ChallengeConfig, cfg);
  await setChallengeConfig(b.id, cfg);
  await addLog(b.id, { by: u.nick, action: "config", target: b.title, note });
  revalidatePath("/", "layout");
  return ok("챌린지 설정을 저장했어요.");
}
