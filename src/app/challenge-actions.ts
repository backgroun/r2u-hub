"use server";
import { createHash, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, newId } from "@/lib/hub";
import { isConfirmed, CONFIRM_REQUIRED } from "@/lib/confirm-token";
import { activeChallenge, getBlocks, setChallengeConfig } from "@/lib/event-blocks";
import {
  addLog, delImage, getActRec, getMemberRec, listActs, listMembers, nextTicket, purgeChallenge, saveRaffle, putImage, removeActRec, removeMemberRec, saveActRec, saveMemberRec,
} from "@/lib/challenge/store";
import { IMG_KINDS, RULE, currentPhase, effectiveCfg, defaultRulesText, drawRaffle, fmtTicket, nowKst, parseDuration, validateActivity, validateConfig, type Activity, type ChallengeConfig, type ImgKind, type Phase, type RawInput } from "@/lib/challenge/rules";
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

/** 지금 진행 중인 챌린지 블록(폼이 가리키는 것과 같아야 한다). 테스트 모드 블록은 운영진(크루 보기 중이어도)만 쓸 수 있다. */
async function liveBlock(fd: FormData, u: { admin: boolean; realAdmin?: boolean }) {
  const block = await activeChallenge(undefined, { staff: u.admin});
  return block?.challenge && block.id === str(fd, "id", 20) ? { block, cfg: block.challenge } : null;
}

/* ---------- 참가 신청·취소 ---------- */
export async function joinChallengeAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd, u);
  if (!live) return fail("지금 신청을 받는 챌린지가 없어요.");
  if (currentPhase(live.cfg, nowKst()) !== "signup") return fail("신청 기간이 아니에요.");
  if (await getMemberRec(live.block.id, u.nick)) return fail("이미 신청했어요.");
  const now = Date.now();
  await saveMemberRec(live.block.id, { nick: u.nick, appliedAt: now, agreedAt: now, paid: false });
  await addLog(live.block.id, { by: u.nick, action: "join", target: u.nick });
  refresh();
  return ok(`신청했어요! 회비 ${live.cfg.fee.toLocaleString("ko-KR")}원을 입금하면 운영진이 확인한 뒤 참가가 확정돼요.`);
}

export async function leaveChallengeAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd, u);
  if (!live) return fail("지금 신청을 받는 챌린지가 없어요.");
  if (currentPhase(live.cfg, nowKst()) !== "signup") return fail("신청 기간이 끝나서 취소할 수 없어요.");
  const member = await getMemberRec(live.block.id, u.nick);
  if (!member) return fail("신청 내역이 없어요.");
  await removeMemberRec(live.block.id, u.nick);
  await addLog(live.block.id, { by: u.nick, action: "leave", target: u.nick });
  refresh();
  return ok(member.paid ? "신청을 취소했어요. 낸 회비는 돌려드리지 않아요." : "신청을 취소했어요."); // 입금 확인 전에는 환불 얘기를 하지 않는다
}

/** 참가자가 "입금 완료"를 눌러 운영진에게 입금했다고 알린다(다시 누르면 취소). 입금 확인은 운영진이 따로 한다. */
export async function claimPaidAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd, u);
  if (!live) return fail("지금 신청을 받는 챌린지가 없어요.");
  if (currentPhase(live.cfg, nowKst()) !== "signup") return fail("신청 기간이 아니에요.");
  const m = await getMemberRec(live.block.id, u.nick);
  if (!m) return fail("신청 내역이 없어요.");
  if (m.paid) return fail("이미 입금이 확인됐어요.");
  const undo = fd.get("undo") === "1";
  await saveMemberRec(live.block.id, { ...m, paidClaimedAt: undo ? undefined : Date.now() });
  refresh();
  return ok(undo ? "입금 완료 알림을 취소했어요." : "입금했다고 운영진에게 알렸어요. 확인되면 입금 확인됨으로 바뀌어요.");
}

/* ---------- 기록 올리기·수정 ---------- */
const FILE_FIELD: Record<ImgKind, string> = { summary: "img_summary", cadence: "img_cadence", zone: "img_zone", map: "img_map" };
const IMG_TYPES = ["image/webp", "image/jpeg", "image/png"];

export async function submitActivityAction(_: Result, fd: FormData): Promise<Result> {
  const u = await me();
  const live = await liveBlock(fd, u);
  if (!live) return fail("지금 기록을 받는 챌린지가 없어요.");
  const nowStr = nowKst();
  const phase = currentPhase(live.cfg, nowStr);
  if (phase !== "running") return fail("지금은 기록을 올릴 수 있는 기간이 아니에요.");
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

  // 러닝 일자만 받는다. 하루에 여러 번 달린 기록을 구분하도록 내부 시각은 자동으로 붙인다(수정 때 날짜가 같으면 기존 값을 유지).
  const runDate = str(fd, "runDate", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) return fail("러닝 일자를 골라 주세요.");
  let startedAt = existing && existing.startedAt.slice(0, 10) === runDate ? existing.startedAt : "";
  if (!startedAt) {
    const used = new Set((await listActs(live.block.id)).filter((a) => a.nick === u.nick && a.id !== actId && a.date === runDate).map((a) => a.startedAt.slice(11, 16)));
    const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const nowHm = nowStr.slice(11, 16);
    let m = runDate === nowStr.slice(0, 10) && nowHm < "12:00" ? Number(nowHm.slice(0, 2)) * 60 + Number(nowHm.slice(3)) : 12 * 60; // 오늘이면 지금보다 늦은 시각이 되지 않게
    while (m >= 0 && used.has(hm(m))) m--;
    if (m < 0) return fail("하루에 올릴 수 있는 기록 수를 넘었어요.");
    startedAt = `${runDate}T${hm(m)}`;
  }
  const raw: RawInput = {
    startedAt,
    distanceKm: num(fd, "distanceKm"),
    durationSec: parseDuration(str(fd, "dur", 20)),
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
  const v = validateActivity(raw, flags, effectiveCfg(live.cfg), nowStr);
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
  const rec: Activity = { id, nick: u.nick, ...v.value, imgs, status: "pending", createdAt: existing?.createdAt ?? now, updatedAt: now };
  // 검수 없이 바로 인정된 기록으로 등록한다
  Object.assign(rec, { status: "ok", reviewedBy: "자동", reviewedAt: now });
  // 경품 추첨용 행운 번호: 새 기록에만 한 장 발급하고, 수정해도 그대로 둔다
  if (existing?.ticket != null) rec.ticket = existing.ticket;
  else if (!existing) rec.ticket = await nextTicket(live.block.id);
  if (existing) {
    // 수정: 기록(검수 전)을 먼저 저장한 뒤 캡처를 바꾼다. 저장이 실패해도 승인된 기록이 검수 안 된 캡처를 가리키지 않는다.
    await saveActRec(live.block.id, rec);
    for (const kind of IMG_KINDS) if (files[kind]) await putImage(live.block.id, id, kind, files[kind]!);
  } else {
    for (const kind of IMG_KINDS) if (files[kind]) await putImage(live.block.id, id, kind, files[kind]!);
    await saveActRec(live.block.id, rec);
  }
  // 기록을 먼저 저장한 뒤에 빠진 캡처를 지운다(저장이 실패해도 기록이 지워진 이미지를 가리키지 않게)
  for (const kind of IMG_KINDS) if (existing?.imgs[kind] && !imgs[kind]) await delImage(live.block.id, id, kind);
  if (existing) await addLog(live.block.id, { by: u.nick, action: "edit", target: `${u.nick}/${id}` });
  refresh();
  return ok(existing ? "수정했어요." : `기록을 올렸어요! 행운 번호 ${fmtTicket(rec.ticket as number)}번이 발급됐어요.`);
}

export async function deleteActivityAction(fd: FormData) {
  if (!(await isConfirmed(fd.get("confirmToken")))) return; // 비밀번호 확인 필요
  const u = await me();
  const live = await liveBlock(fd, u);
  if (!live) return;
  const phase = currentPhase(live.cfg, nowKst());
  if (phase !== "running") return;
  const a = await getActRec(live.block.id, str(fd, "actId", 20));
  if (!a || a.nick !== u.nick) return;
  await removeActRec(live.block.id, a.id);
  await addLog(live.block.id, { by: u.nick, action: "delete", target: `${u.nick}/${a.id}` });
  refresh();
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

/** 설정 변경 내역을 `필드 이전→이후` 목록으로 만든다(처리 기록용) */
function configDiff(a: ChallengeConfig, b: ChallengeConfig): string {
  const out: string[] = [];
  const show = (v: string | number) => String(v).replace("T", " ");
  const cmp = (name: string, x: string | number, y: string | number) => { if (x !== y) out.push(`${name} ${show(x)}→${show(y)}`); };
  cmp("신청시작", a.signupStart, b.signupStart); cmp("신청마감", a.signupEnd, b.signupEnd);
  cmp("기록시작", a.start, b.start); cmp("기록종료", a.end, b.end);
  cmp("회비", a.fee, b.fee);
  if ((a.rulesText ?? "") !== (b.rulesText ?? "")) out.push("규정 안내 글 변경");
  cmp("은행", a.bank.bank, b.bank.bank); cmp("계좌", a.bank.account, b.bank.account); cmp("예금주", a.bank.holder, b.bank.holder);
  cmp("상품", a.prizes.join(", "), b.prizes.join(", "));
  cmp("추첨상품", (a.raffle ?? []).join(", "), (b.raffle ?? []).join(", "));
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
    signupStart: str(fd, "signupStart", 16), signupEnd: str(fd, "signupEnd", 16),
    start: str(fd, "start", 16), end: str(fd, "end", 16),
    finalAt: str(fd, "end", 16), // 기록 종료가 지나면 바로 종료·시상
    prizes: String(fd.get("prizes") ?? "").split("\n").map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
    spendNote: "", // 회비 사용 내역은 더 이상 입력하지 않는다
    raffle: String(fd.get("raffle") ?? "").split("\n").map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 20),
    rulesText: "", // 아래에서 기본 글과 비교해 채운다
    // 테스트 모드 설정은 이 폼이 건드리지 않는다
    testMode: b.challenge?.testMode === true, testPhase: b.challenge?.testPhase ?? "",
  };
  // 규정 안내 글: 기본 글과 같으면 비워 둔다(그래야 기간·회비를 바꿀 때 기본 글이 같이 바뀐다)
  const rulesInput = String(fd.get("rulesText") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 4000);
  cfg.rulesText = rulesInput === defaultRulesText() ? "" : rulesInput;
  const bad = validateConfig(cfg);
  if (bad) return fail(bad);
  const note = configDiff(b.challenge as ChallengeConfig, cfg);
  await setChallengeConfig(b.id, cfg);
  await addLog(b.id, { by: u.nick, action: "config", target: b.title, note });
  revalidatePath("/", "layout");
  return ok("챌린지 설정을 저장했어요.");
}

/* ---------- 테스트 모드 (운영진 전용) ---------- */
const PHASES: Phase[] = ["soon", "signup", "ready", "running", "closed"];

/** 테스트 모드 켜기·끄기와 단계 고정. testMode·testPhase 두 값만 바꾼다. */
export async function setChallengeTestAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  const b = await challengeBlock(str(fd, "id", 20));
  const mode = str(fd, "testMode", 1), phase = str(fd, "testPhase", 10);
  if (mode !== "1" && mode !== "0") return fail("켜기 또는 끄기를 골라 주세요.");
  if (phase !== "" && !PHASES.includes(phase as Phase)) return fail("단계를 다시 골라 주세요.");
  const on = mode === "1";
  await setChallengeConfig(b.id, { ...(b.challenge as ChallengeConfig), testMode: on, testPhase: phase as Phase | "" });
  await addLog(b.id, { by: u.nick, action: "test-mode", target: b.title, note: on ? `켬 · 단계 ${phase || "날짜대로"}` : "끔" });
  revalidatePath("/", "layout");
  return ok(on ? "테스트 모드를 켰어요. 운영진에게만 보여요." : "테스트 모드를 껐어요. 날짜대로 돌아가요.");
}

/** 테스트 데이터 모두 지우기: 테스트 모드가 켜진 챌린지에서만. 블록과 설정은 남기고 신청자·기록(캡처)·장소 정리표·이의 제기·처리 기록을 지운다. */
export async function resetChallengeDataAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  if (!(await isConfirmed(fd.get("confirmToken")))) return fail(CONFIRM_REQUIRED);
  const b = await challengeBlock(str(fd, "id", 20));
  if (!b.challenge?.testMode) return fail("테스트 모드를 켠 상태에서만 지울 수 있어요.");
  await purgeChallenge(b.id);
  await addLog(b.id, { by: u.nick, action: "test-reset", target: "테스트 데이터 초기화", note: b.title });
  revalidatePath("/", "layout");
  return ok("테스트 데이터를 모두 지웠어요.");
}

/** 경품 추첨: 기록 시간이 끝난 뒤(테스트 모드는 언제든) 행운 번호를 무작위로 뽑아 상품 순서대로 당첨자를 정한다. 한 사람은 한 번만 당첨되고, 다시 뽑으면 이전 결과를 덮어쓴다. */
export async function drawRaffleAction(_: Result, fd: FormData): Promise<Result> {
  const u = await staff();
  if (!(await isConfirmed(fd.get("confirmToken")))) return fail(CONFIRM_REQUIRED);
  const b = await challengeBlock(str(fd, "id", 20));
  const cfg = b.challenge as ChallengeConfig;
  if (currentPhase(cfg, nowKst()) !== "closed" && !cfg.testMode) return fail("기록이 끝난 뒤에 추첨할 수 있어요.");
  const prizes = cfg.raffle ?? [];
  if (!prizes.length) return fail("추첨 상품을 설정에 먼저 적어 주세요.");
  const [members, acts] = await Promise.all([listMembers(b.id), listActs(b.id)]);
  const eligible = new Set((cfg.testMode ? members : members.filter((m) => m.paid)).map((m) => m.nick)); // 순위와 같은 기준: 입금 확인된 참가자(테스트 모드는 전원)
  const tickets = acts.filter((a) => a.ticket != null && eligible.has(a.nick)).map((a) => ({ ticket: a.ticket as number, nick: a.nick }));
  if (!tickets.length) return fail("추첨할 행운 번호가 없어요.");
  const winners = drawRaffle(tickets, prizes, (n) => randomInt(n));
  await saveRaffle(b.id, { at: Date.now(), by: u.nick, ticketCount: tickets.length, winners });
  await addLog(b.id, { by: u.nick, action: "raffle", target: `번호 ${tickets.length}장`, note: winners.map((w) => `${w.prize}→${w.nick}(${fmtTicket(w.ticket)})`).join(" / ") });
  revalidatePath("/", "layout");
  return ok(`추첨했어요! 당첨 ${winners.length}명`);
}
