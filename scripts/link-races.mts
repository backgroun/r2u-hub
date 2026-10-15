// 일회성: 우리 일정 대회를 마라톤온라인 대회와 이어 정보를 고친다. APPLY=1이면 실제로 쓴다.
// 실행: npx tsx --conditions=react-server --env-file=.env.local scripts/link-races.mts
import { linkExternalRaces } from "@/lib/race-link";

const dryRun = process.env.APPLY !== "1";
const r = await linkExternalRaces({ dryRun });
console.log(`dryRun=${dryRun} 연결 ${r.pairs.length}건, 후보 여러 개 ${r.ambiguous.length}건, 실제 수정 ${r.updated.length}건`);
for (const p of r.pairs) console.log(`  ${p.race.date} ${p.race.name}  →  ${p.ext.name} (#${p.ext.no})`);
for (const a of r.ambiguous) console.log(`  ? ${a.race.date} ${a.race.name}  →  ${a.candidates.map((c) => c.name).join(" | ")}`);
