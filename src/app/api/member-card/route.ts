import { NextResponse } from "next/server";
import { currentUser, getMember, getMonth, getRaceRecs, getRaces, isStaffNick, kstToday, recRace } from "@/lib/hub";
import { getMyPoints } from "@/lib/points";
import { tierOf } from "@/lib/tiers";
import { rankMonth } from "@/lib/rank";

/** 회원 카드 요약 (대회 명단에서 이름을 누르면 아래에서 올라오는 카드) */
export async function GET(req: Request) {
  if (!(await currentUser())) return NextResponse.json({ error: "로그인해 주세요." }, { status: 401 });
  const nick = new URL(req.url).searchParams.get("nick")?.trim() ?? "";
  const member = nick ? await getMember(nick) : null;
  if (!member || isStaffNick(nick)) return NextResponse.json({ error: "회원을 찾을 수 없어요." }, { status: 404 });
  const today = kstToday(), ym = today.slice(0, 7);
  const [races, recs, month, pts] = await Promise.all([getRaces(), getRaceRecs(nick), getMonth(ym), getMyPoints(nick, 0)]);
  const joined = races.filter((r) => r.participants.some((p) => p.nick === nick));
  const upcoming = joined.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ name: r.name, date: r.date, course: r.participants.find((p) => p.nick === nick)?.course ?? "" }));
  const byId = new Map(races.map((r) => [r.id, r]));
  const done = Object.entries(recs).map(([id, rec]) => ({ rec, race: recRace(id, rec, byId) })).filter((x) => x.race && x.rec.sec > 0);
  const pb = new Map<string, { sec: number; time: string }>();
  for (const { rec } of done) { const c = pb.get(rec.course); if (!c || rec.sec < c.sec) pb.set(rec.course, { sec: rec.sec, time: rec.time }); }
  const recent = done.sort((a, b) => b.race!.date.localeCompare(a.race!.date)).slice(0, 2).map(({ rec, race }) => ({ name: race!.name, date: race!.date, course: rec.course, time: rec.time }));
  const row = rankMonth(month).find((r) => r.nick === nick);
  const tier = tierOf(pts.lv);
  return NextResponse.json({
    nick, name: member.name?.trim() || "없음", admin: member.role === "admin", manager: !!member.manager,
    points: pts.points, tier: { label: tier.label, color: tier.color, key: tier.key }, left: pts.left, pct: pts.pct,
    joinedCount: joined.length, upcoming: upcoming.slice(0, 3),
    pb: [...pb.entries()].map(([course, v]) => ({ course, time: v.time })),
    recent, month: { km: row?.km ?? 0, goal: row?.goal ?? 0, rate: row?.rate ?? null },
  }, { headers: { "cache-control": "no-store" } });
}
