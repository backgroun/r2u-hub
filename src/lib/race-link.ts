import "server-only";
import { K, redis, type Race } from "./hub";
import { detailExternal, listExternal, viewUrl, type ExtDetail, type ExtRace } from "./roadrun";

/* 우리 일정(구글시트에서 옮긴 대회 포함)과 마라톤온라인 대회를 같은 대회로 잇는다.
   이름이 조금씩 달라서(연도·회차·띄어쓰기·'국제' 등) 날짜가 같고 정리한 이름이 서로 들어 있으면 같은 대회로 본다. */
export function normRaceName(name: string) {
  return name
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/20\d\d\s*년?/g, "")
    .replace(/제?\s*\d+\s*회/g, "")
    .replace(/국제|전국|대회|기념|in\s/gi, "")
    .replace(/[\s·.,'"‘’“”\-_/]/g, "")
    .toLowerCase();
}

export function sameRace(a: { name: string; date: string }, b: { name: string; date: string }) {
  if (a.date !== b.date) return false;
  const x = normRaceName(a.name), y = normRaceName(b.name);
  if (x.length < 2 || y.length < 2) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** 마라톤온라인 상세로 우리 대회를 고친다. 참가자·응원·뒤풀이(다른 키)는 그대로, 카카오 장소·메모·직접 넣은 접수 페이지는 있으면 둔다. */
export function applyExternal(r: Race, d: ExtDetail, no: string): Race {
  const regStart = d.regStart ?? r.regStart, regEnd = d.regEnd ?? r.regEnd;
  return {
    ...r,
    name: d.name || r.name,
    date: d.date || r.date,
    time: d.time ?? r.time,
    place: d.place || r.place,
    regStart, regEnd,
    reg: regStart || regEnd ? "" : r.reg,
    src: no,
    note: r.note?.trim() ? r.note : [d.courses, d.homepage ?? viewUrl(no)].filter(Boolean).join(" · "),
  };
}

const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as Race;

/** 아직 연결 안 된 우리 대회를 마라톤온라인(전국, 올해·내년)에서 찾아 고친다. dryRun이면 짝만 돌려준다. */
export async function linkExternalRaces({ dryRun }: { dryRun: boolean }) {
  const races = Object.values((await redis.hgetall<Record<string, unknown>>(K.races)) ?? {}).map(parse);
  const years = [...new Set(races.map((r) => Number(r.date.slice(0, 4))))].filter((y) => y >= 2000);
  const ext: ExtRace[] = (await Promise.all(years.map((y) => listExternal("전국", y).catch(() => [] as ExtRace[])))).flat();
  const pairs: { race: Race; ext: ExtRace }[] = [];
  const ambiguous: { race: Race; candidates: ExtRace[] }[] = [];
  for (const race of races) {
    if (race.src) continue;
    const found = ext.filter((e) => sameRace(race, e));
    if (found.length === 1) pairs.push({ race, ext: found[0] });
    else if (found.length > 1) ambiguous.push({ race, candidates: found });
  }
  const updated: { before: Race; after: Race }[] = [];
  if (!dryRun) {
    for (const { race, ext: e } of pairs) {
      try {
        const d = await detailExternal(e.no);
        if (!d.name || !d.date) continue;
        const after = applyExternal(race, d, e.no);
        await redis.hset(K.races, { [race.id]: JSON.stringify(after) });
        updated.push({ before: race, after });
      } catch { /* 한 대회를 못 읽어도 나머지는 계속 */ }
    }
  }
  return { pairs, ambiguous, updated };
}
