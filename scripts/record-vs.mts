// 일회성: 지금 진행 중인 1:1 대결을 승리 정산 기록에 넣는다. APPLY=1이면 실제로 쓴다.
// 실행: npx tsx --conditions=react-server --env-file=.env.local scripts/record-vs.mts
import { getAllVs, kstToday } from "@/lib/hub";
import { getVsHistory, recordVsPair } from "@/lib/versus";

const ym = kstToday().slice(0, 7);
const all = await getAllVs(ym);
const seen = new Set<string>();
const pairs = Object.entries(all).filter(([a, b]) => { if (seen.has(a) || seen.has(b)) return false; seen.add(a); seen.add(b); return true; });
console.log(`${ym} 진행 중 ${pairs.length}건:`, pairs.map(([a, b]) => `${a} vs ${b}`).join(", "));
if (process.env.APPLY === "1") for (const [a, b] of pairs) await recordVsPair(ym, a, b);
console.log("기록:", (await getVsHistory(ym)).map((h) => `${h.a} vs ${h.b}`).join(", "));
