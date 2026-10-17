// Postgres 위에서 Redis 명령을 흉내 내는 요청기(Requester).
// Upstash 클라이언트(@upstash/redis)의 `new Redis(requester)` 에 꽂아 쓰면, 값 직렬화·역직렬화·파이프라인 등
// 클라이언트 쪽 동작은 그대로 유지되고 저장소만 Postgres(Supabase)로 바뀐다.
//
// 파일 하나로 끝나도록(다른 파일을 가져오지 않음) 쓰고, node 에서 바로 실행하는 점검·이전 스크립트도 같이 쓴다.
// 그래서 TypeScript 의 지울 수 있는 문법만 쓴다 (enum·namespace·parameter property 금지).

import pg from "pg";

export const KV_TABLE = "r2u_kv";

/** 표 만들기 (이미 있으면 그대로) */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${KV_TABLE} (
  key        text             NOT NULL,
  type       text             NOT NULL,            -- s 문자열 / h 해시 / z 정렬집합 / l 리스트
  field      text             NOT NULL DEFAULT '', -- 해시 필드 · 정렬집합 멤버 · 리스트 위치
  value      text,
  score      double precision,                     -- 정렬집합 점수 · 리스트 순서
  expires_at timestamptz,                          -- 비어 있으면 영구
  ord        bigserial,                            -- 넣은 순서 (해시·리스트 읽기 순서 유지)
  PRIMARY KEY (key, field)
);
CREATE INDEX IF NOT EXISTS ${KV_TABLE}_key_idx ON ${KV_TABLE} (key);
CREATE INDEX IF NOT EXISTS ${KV_TABLE}_exp_idx ON ${KV_TABLE} (expires_at) WHERE expires_at IS NOT NULL;
-- 공개 API(Data API)를 나중에 켜더라도 바깥에서 읽을 수 없게 행 수준 보안을 켠다 (서버의 postgres 계정은 그대로 접근)
ALTER TABLE ${KV_TABLE} ENABLE ROW LEVEL SECURITY;
`;

type Row = Record<string, unknown>;
type Step = { sql: string; parse: (rows: Row[]) => unknown };
type CmdResult = { result?: unknown; error?: string };
type UpstashRequestLike = { path?: string[]; body?: unknown };

const T = KV_TABLE;
const LIVE = "(expires_at IS NULL OR expires_at > now())";

/** SQL 문자열 값: 따옴표를 두 번 쓰고, 널 문자는 막는다 (standard_conforming_strings=on 이라 역슬래시는 그대로 글자) */
function lit(v: unknown): string {
  const s = typeof v === "string" ? v : String(v);
  if (s.includes("\u0000")) throw new Error("ERR value contains a NUL character");
  return `'${s.replace(/'/g, "''")}'`;
}
const num = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("ERR value is not a valid float");
  return String(n);
};
const int = (v: unknown): string => {
  const s = String(v);
  if (!/^-?\d+$/.test(s)) throw new Error("ERR value is not an integer or out of range");
  return s;
};
const arr = (xs: unknown[]): string => (xs.length ? `ARRAY[${xs.map(lit).join(",")}]::text[]` : "ARRAY[]::text[]");
const str = (v: unknown): string => (typeof v === "string" ? v : String(v));
const rowsInt = (rows: Row[]): number => Number(rows[0]?.n ?? 0);

/** 레디스 글롭(*, ?)을 LIKE 패턴으로. [..] 같은 복잡한 글롭은 지원하지 않는다 */
function globToLike(p: string): string {
  if (/[\[\]\\]/.test(p)) throw new Error("ERR unsupported glob pattern");
  return p.replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/\*/g, "%").replace(/\?/g, "_");
}

/** 점수 범위 값("-inf","+inf","(5" 제외 표시) 해석 */
function parseBound(v: unknown): { n: number; excl: boolean } {
  let s = str(v).toLowerCase();
  let excl = false;
  if (s.startsWith("(")) { excl = true; s = s.slice(1); }
  if (s === "+inf" || s === "inf") return { n: Infinity, excl };
  if (s === "-inf") return { n: -Infinity, excl };
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error("ERR min or max is not a float");
  return { n, excl };
}

/** 한 명령을 SQL 한 문장과 결과 변환 규칙으로 바꾼다. 결과는 레디스 서버가 돌려주는 날것의 형태(문자열·숫자·배열) */
function plan(cmd: unknown[]): Step {
  const name = str(cmd[0]).toLowerCase();
  const a = cmd.slice(1);
  switch (name) {
    case "ping": return { sql: "SELECT 1", parse: () => "PONG" };

    case "get": {
      return { sql: `SELECT value FROM ${T} WHERE key=${lit(a[0])} AND type='s' AND ${LIVE}`, parse: (r) => (r[0] ? (r[0].value as string | null) : null) };
    }

    case "set": {
      const key = lit(a[0]), val = lit(a[1]);
      let nx = false, xx = false, exp = "NULL";
      for (let i = 2; i < a.length; i++) {
        const o = str(a[i]).toLowerCase();
        if (o === "nx") nx = true;
        else if (o === "xx") xx = true;
        else if (o === "ex") exp = `now() + make_interval(secs => ${num(a[++i])})`;
        else if (o === "px") exp = `now() + make_interval(secs => ${num(a[++i])} / 1000.0)`;
        else if (o === "exat") exp = `to_timestamp(${num(a[++i])})`;
        else if (o === "pxat") exp = `to_timestamp(${num(a[++i])} / 1000.0)`;
        else throw new Error(`ERR unsupported SET option ${o}`);
      }
      if (xx) {
        return {
          sql: `WITH u AS (UPDATE ${T} SET value=${val}, expires_at=${exp} WHERE key=${key} AND type='s' AND ${LIVE} RETURNING 1) SELECT count(*)::int AS n FROM u`,
          parse: (r) => (rowsInt(r) > 0 ? "OK" : null),
        };
      }
      if (nx) {
        return {
          sql: `INSERT INTO ${T}(key,type,field,value,expires_at) SELECT ${key},'s','',${val},${exp} WHERE NOT EXISTS (SELECT 1 FROM ${T} WHERE key=${key} AND ${LIVE}) ON CONFLICT (key,field) DO UPDATE SET type='s', value=EXCLUDED.value, expires_at=EXCLUDED.expires_at RETURNING 1 AS n`,
          parse: (r) => (r.length ? "OK" : null),
        };
      }
      return {
        sql: `WITH d AS (DELETE FROM ${T} WHERE key=${key} AND type<>'s') INSERT INTO ${T}(key,type,field,value,expires_at) VALUES (${key},'s','',${val},${exp}) ON CONFLICT (key,field) DO UPDATE SET type='s', value=EXCLUDED.value, expires_at=EXCLUDED.expires_at RETURNING 1 AS n`,
        parse: () => "OK",
      };
    }

    case "mget": {
      return {
        sql: `SELECT key, value FROM ${T} WHERE key = ANY(${arr(a)}) AND type='s' AND ${LIVE}`,
        parse: (r) => { const m = new Map(r.map((x) => [x.key as string, x.value as string])); return a.map((k) => m.get(str(k)) ?? null); },
      };
    }

    case "del": case "unlink": {
      return {
        sql: `WITH d AS (DELETE FROM ${T} WHERE key = ANY(${arr(a)}) RETURNING key, expires_at) SELECT count(DISTINCT key)::int AS n FROM d WHERE expires_at IS NULL OR expires_at > now()`,
        parse: rowsInt,
      };
    }

    case "exists": {
      return { sql: `SELECT count(DISTINCT key)::int AS n FROM ${T} WHERE key = ANY(${arr(a)}) AND ${LIVE}`, parse: rowsInt };
    }

    case "incr": case "incrby": case "decr": case "decrby": {
      const by = name === "incr" ? "1" : name === "decr" ? "-1" : name === "incrby" ? int(a[1]) : String(-Number(int(a[1])));
      const key = lit(a[0]);
      return {
        sql: `INSERT INTO ${T}(key,type,field,value) VALUES (${key},'s','',${by}::text) ON CONFLICT (key,field) DO UPDATE SET value = CASE WHEN ${T}.expires_at IS NOT NULL AND ${T}.expires_at <= now() THEN ${by}::text ELSE ((${T}.value)::bigint + ${by})::text END, expires_at = CASE WHEN ${T}.expires_at IS NOT NULL AND ${T}.expires_at <= now() THEN NULL ELSE ${T}.expires_at END RETURNING value`,
        parse: (r) => Number(r[0]?.value),
      };
    }

    case "expire": case "pexpire": case "expireat": case "pexpireat": {
      const n = num(a[1]);
      const exp = name === "expire" ? `now() + make_interval(secs => ${n})`
        : name === "pexpire" ? `now() + make_interval(secs => ${n} / 1000.0)`
        : name === "expireat" ? `to_timestamp(${n})` : `to_timestamp(${n} / 1000.0)`;
      return {
        sql: `WITH u AS (UPDATE ${T} SET expires_at=${exp} WHERE key=${lit(a[0])} AND ${LIVE} RETURNING 1) SELECT count(*)::int AS n FROM u`,
        parse: (r) => (rowsInt(r) > 0 ? 1 : 0),
      };
    }

    case "pttl": case "ttl": {
      const div = name === "ttl" ? "1000" : "1";
      return {
        sql: `SELECT count(*)::int AS cnt, bool_or(expires_at IS NULL) AS forever, (extract(epoch FROM (max(expires_at) - now())) * 1000)::bigint AS ms FROM ${T} WHERE key=${lit(a[0])} AND ${LIVE}`,
        parse: (r) => (Number(r[0]?.cnt) === 0 ? -2 : r[0]?.forever ? -1 : Math.ceil(Number(r[0]?.ms) / Number(div))),
      };
    }

    case "type": {
      return {
        sql: `SELECT type FROM ${T} WHERE key=${lit(a[0])} AND ${LIVE} LIMIT 1`,
        parse: (r) => ({ s: "string", h: "hash", z: "zset", l: "list" } as Record<string, string>)[r[0]?.type as string] ?? "none",
      };
    }

    case "keys": {
      return {
        sql: `SELECT DISTINCT key FROM ${T} WHERE key LIKE ${lit(globToLike(str(a[0])))} ESCAPE '\\' AND ${LIVE} ORDER BY key`,
        parse: (r) => r.map((x) => x.key as string),
      };
    }

    case "scan": {
      const cursor = Number(int(a[0]));
      let count = 10, match = "*";
      for (let i = 1; i < a.length; i++) {
        const o = str(a[i]).toLowerCase();
        if (o === "count") count = Number(int(a[++i]));
        else if (o === "match") match = str(a[++i]);
        else if (o === "type") i++;
      }
      return {
        sql: `SELECT DISTINCT key FROM ${T} WHERE key LIKE ${lit(globToLike(match))} ESCAPE '\\' AND ${LIVE} ORDER BY key OFFSET ${cursor} LIMIT ${count + 1}`,
        parse: (r) => { const ks = r.map((x) => x.key as string); return ks.length > count ? [String(cursor + count), ks.slice(0, count)] : ["0", ks]; },
      };
    }

    case "dbsize": {
      return { sql: `SELECT count(DISTINCT key)::int AS n FROM ${T} WHERE ${LIVE}`, parse: rowsInt };
    }

    // ---------- 해시 ----------
    case "hset": case "hmset": {
      if (a.length < 3 || (a.length - 1) % 2 !== 0) throw new Error("ERR wrong number of arguments for 'hset' command");
      const key = lit(a[0]);
      const pairs = new Map<string, string>();
      for (let i = 1; i < a.length; i += 2) pairs.set(str(a[i]), str(a[i + 1]));
      const values = [...pairs].map(([f, v]) => `(${key},'h',${lit(f)},${lit(v)},(SELECT max(expires_at) FROM ${T} WHERE key=${key} AND ${LIVE}))`).join(",");
      return {
        sql: `WITH d AS (DELETE FROM ${T} WHERE key=${key} AND type<>'h'), p AS (INSERT INTO ${T}(key,type,field,value,expires_at) VALUES ${values} ON CONFLICT (key,field) DO UPDATE SET value=EXCLUDED.value RETURNING (xmax = 0) AS ins) SELECT count(*) FILTER (WHERE ins)::int AS n FROM p`,
        parse: (r) => (name === "hmset" ? "OK" : rowsInt(r)),
      };
    }

    case "hsetnx": {
      const key = lit(a[0]);
      return {
        sql: `INSERT INTO ${T}(key,type,field,value,expires_at) SELECT ${key},'h',${lit(a[1])},${lit(a[2])},(SELECT max(expires_at) FROM ${T} WHERE key=${key} AND ${LIVE}) WHERE NOT EXISTS (SELECT 1 FROM ${T} WHERE key=${key} AND type<>'h' AND ${LIVE}) ON CONFLICT (key,field) DO NOTHING RETURNING 1 AS n`,
        parse: (r) => (r.length ? 1 : 0),
      };
    }

    case "hget": {
      return { sql: `SELECT value FROM ${T} WHERE key=${lit(a[0])} AND type='h' AND field=${lit(a[1])} AND ${LIVE}`, parse: (r) => (r[0] ? (r[0].value as string | null) : null) };
    }

    case "hmget": {
      const fields = a.slice(1);
      return {
        sql: `SELECT field, value FROM ${T} WHERE key=${lit(a[0])} AND type='h' AND field = ANY(${arr(fields)}) AND ${LIVE}`,
        parse: (r) => { const m = new Map(r.map((x) => [x.field as string, x.value as string])); return fields.map((f) => m.get(str(f)) ?? null); },
      };
    }

    case "hexists": {
      return { sql: `SELECT count(*)::int AS n FROM ${T} WHERE key=${lit(a[0])} AND type='h' AND field=${lit(a[1])} AND ${LIVE}`, parse: (r) => (rowsInt(r) > 0 ? 1 : 0) };
    }

    case "hkeys": {
      return { sql: `SELECT field FROM ${T} WHERE key=${lit(a[0])} AND type='h' AND ${LIVE} ORDER BY ord`, parse: (r) => r.map((x) => x.field as string) };
    }

    case "hlen": {
      return { sql: `SELECT count(*)::int AS n FROM ${T} WHERE key=${lit(a[0])} AND type='h' AND ${LIVE}`, parse: rowsInt };
    }

    case "hgetall": {
      return { sql: `SELECT field, value FROM ${T} WHERE key=${lit(a[0])} AND type='h' AND ${LIVE} ORDER BY ord`, parse: (r) => r.flatMap((x) => [x.field as string, x.value as string]) };
    }

    case "hdel": {
      return {
        sql: `WITH d AS (DELETE FROM ${T} WHERE key=${lit(a[0])} AND type='h' AND field = ANY(${arr(a.slice(1))}) RETURNING 1) SELECT count(*)::int AS n FROM d`,
        parse: rowsInt,
      };
    }

    case "hincrbyfloat": case "hincrby": {
      const key = lit(a[0]), f = lit(a[1]);
      const isFloat = name === "hincrbyfloat";
      const by = isFloat ? num(a[2]) : int(a[2]);
      const cast = isFloat ? "numeric" : "bigint";
      const out = (e: string) => (isFloat ? `trim_scale(${e})::text` : `(${e})::text`);
      return {
        sql: `INSERT INTO ${T}(key,type,field,value,expires_at) VALUES (${key},'h',${f},${out(`${by}::${cast}`)},(SELECT max(expires_at) FROM ${T} WHERE key=${key} AND ${LIVE})) ON CONFLICT (key,field) DO UPDATE SET value=${out(`(${T}.value)::${cast} + ${by}::${cast}`)} RETURNING value`,
        parse: (r) => (isFloat ? (r[0]?.value as string) : Number(r[0]?.value)),
      };
    }

    // ---------- 정렬 집합 ----------
    case "zadd": {
      if (a.length < 3) throw new Error("ERR wrong number of arguments for 'zadd' command");
      const key = lit(a[0]);
      let i = 1;
      if (Number.isNaN(Number(a[1]))) throw new Error(`ERR unsupported ZADD option ${str(a[1]).toLowerCase()}`);
      const members = new Map<string, number>();
      for (; i + 1 < a.length; i += 2) members.set(str(a[i + 1]), Number(num(a[i])));
      const values = [...members].map(([m, s]) => `(${key},'z',${lit(m)},'',${s})`).join(",");
      return {
        sql: `WITH d AS (DELETE FROM ${T} WHERE key=${key} AND type<>'z'), p AS (INSERT INTO ${T}(key,type,field,value,score) VALUES ${values} ON CONFLICT (key,field) DO UPDATE SET score=EXCLUDED.score RETURNING (xmax = 0) AS ins) SELECT count(*) FILTER (WHERE ins)::int AS n FROM p`,
        parse: rowsInt,
      };
    }

    case "zrem": {
      return {
        sql: `WITH d AS (DELETE FROM ${T} WHERE key=${lit(a[0])} AND type='z' AND field = ANY(${arr(a.slice(1))}) RETURNING 1) SELECT count(*)::int AS n FROM d`,
        parse: rowsInt,
      };
    }

    case "zcard": {
      return { sql: `SELECT count(*)::int AS n FROM ${T} WHERE key=${lit(a[0])} AND type='z' AND ${LIVE}`, parse: rowsInt };
    }

    case "zrange": {
      const rest = a.slice(3).map((x) => str(x).toLowerCase());
      const byScore = rest.includes("byscore"), rev = rest.includes("rev"), withScores = rest.includes("withscores");
      let limit: { off: number; cnt: number } | null = null;
      const li = rest.indexOf("limit");
      if (li >= 0) limit = { off: Number(a[3 + li + 1]), cnt: Number(a[3 + li + 2]) };
      if (rest.includes("bylex")) throw new Error("ERR BYLEX is not supported");
      const start = a[1], stop = a[2];
      return {
        sql: `SELECT field, score FROM ${T} WHERE key=${lit(a[0])} AND type='z' AND ${LIVE} ORDER BY score, field`,
        parse: (r) => {
          let list = r.map((x) => ({ m: x.field as string, s: Number(x.score) }));
          if (byScore) {
            // REV 일 때는 (max, min) 순서로 받는다
            const lo = parseBound(rev ? stop : start), hi = parseBound(rev ? start : stop);
            list = list.filter((e) => (lo.excl ? e.s > lo.n : e.s >= lo.n) && (hi.excl ? e.s < hi.n : e.s <= hi.n));
            if (rev) list.reverse();
            if (limit) list = list.slice(limit.off, limit.cnt < 0 ? undefined : limit.off + limit.cnt);
          } else {
            if (rev) list.reverse();
            const n = list.length;
            let s = Number(int(start)), e = Number(int(stop));
            if (s < 0) s = Math.max(n + s, 0);
            if (e < 0) e = n + e;
            list = s > e || s >= n ? [] : list.slice(s, e + 1);
          }
          return withScores ? list.flatMap((e) => [e.m, String(e.s)]) : list.map((e) => e.m);
        },
      };
    }

    // ---------- 리스트 ----------
    case "lpush": {
      const key = lit(a[0]);
      const vals = a.slice(1);
      if (!vals.length) throw new Error("ERR wrong number of arguments for 'lpush' command");
      return {
        sql: `WITH base AS (SELECT coalesce(min(score),0) AS m FROM ${T} WHERE key=${key} AND type='l' AND ${LIVE}), ins AS (INSERT INTO ${T}(key,type,field,value,score) SELECT ${key},'l',(m - g.i)::text,g.v,m - g.i FROM base, unnest(${arr(vals)}) WITH ORDINALITY AS g(v,i) RETURNING 1) SELECT ((SELECT count(*) FROM ${T} WHERE key=${key} AND type='l' AND ${LIVE}) + (SELECT count(*) FROM ins))::int AS n`,
        parse: rowsInt,
      };
    }

    case "ltrim": {
      const key = lit(a[0]);
      const s = int(a[1]), e = int(a[2]);
      return {
        sql: `WITH r AS (SELECT field, (row_number() OVER (ORDER BY score)) - 1 AS rn, count(*) OVER () AS c FROM ${T} WHERE key=${key} AND type='l' AND ${LIVE}), del AS (DELETE FROM ${T} USING r WHERE ${T}.key=${key} AND ${T}.type='l' AND ${T}.field=r.field AND NOT (r.rn BETWEEN (CASE WHEN ${s} < 0 THEN greatest(r.c + ${s}, 0) ELSE ${s} END) AND (CASE WHEN ${e} < 0 THEN r.c + ${e} ELSE ${e} END)) RETURNING 1) SELECT count(*)::int AS n FROM del`,
        parse: () => "OK",
      };
    }

    case "lrange": {
      const key = lit(a[0]);
      const s = int(a[1]), e = int(a[2]);
      return {
        sql: `WITH r AS (SELECT value, (row_number() OVER (ORDER BY score)) - 1 AS rn, count(*) OVER () AS c FROM ${T} WHERE key=${key} AND type='l' AND ${LIVE}) SELECT value FROM r WHERE rn BETWEEN (CASE WHEN ${s} < 0 THEN greatest(c + ${s}, 0) ELSE ${s} END) AND (CASE WHEN ${e} < 0 THEN c + ${e} ELSE ${e} END) ORDER BY rn`,
        parse: (r) => r.map((x) => x.value as string),
      };
    }

    default:
      throw new Error(`ERR unknown command '${name}'`);
  }
}

/** pg 접속 설정: Supabase 처럼 인증서 체인이 기본 신뢰 목록에 없는 곳은 검증을 건너뛰고, 로컬은 SSL 없이 */
export function poolConfig(url: string, opts: { max?: number } = {}): pg.PoolConfig {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  return {
    connectionString: u.toString(),
    max: opts.max ?? 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: local || mode === "disable" ? false : { rejectUnauthorized: false },
  };
}

export class PgRequester {
  pool: pg.Pool;
  private ready: Promise<void> | null = null;
  /** 같은 순간에 들어온 단일 명령은 모아서 한 번에 보낸다 (서버가 멀수록 왕복 횟수가 곧 속도라서) */
  private pending: { step: Step; resolve: (v: CmdResult) => void }[] = [];
  private scheduled = false;
  /** 요청기 인터페이스 표시 (Upstash 클라이언트가 읽음) */
  readYourWrites = true;

  constructor(pool: pg.Pool) { this.pool = pool; }

  /** 표가 없으면 만든다. 권한이 없거나 이미 있으면 조용히 넘어간다 */
  private ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        try {
          const r = await this.pool.query(`SELECT to_regclass('${T}') AS t`);
          if (r.rows[0]?.t) return;
          await this.pool.query(SCHEMA_SQL);
        } catch { /* 표가 이미 있거나 만들 권한이 없다 → 다음 질의에서 실제 오류가 드러난다 */ }
      })();
    }
    return this.ready;
  }

  /** 여러 SQL 을 한 번에 보내(왕복 1번) 같은 순서의 결과를 돌려받는다 */
  private async run(sqls: string[], atomic: boolean): Promise<Row[][]> {
    await this.ensure();
    if (process.env.KV_STATS) console.log(`[kv] roundtrip statements=${sqls.length}${atomic ? " atomic" : ""}`);
    const text = (atomic ? ["BEGIN", ...sqls, "COMMIT"] : sqls).join(";\n");
    const res = (await this.pool.query(text)) as unknown as pg.QueryResult | pg.QueryResult[];
    const list = Array.isArray(res) ? res : [res];
    const rows = list.map((x) => x.rows as Row[]);
    return atomic ? rows.slice(1, 1 + sqls.length) : rows;
  }

  async request<TResult = unknown>(req: UpstashRequestLike): Promise<{ result?: TResult; error?: string }> {
    const path = req.path?.[0];
    try {
      if (path === "pipeline" || path === "multi-exec") {
        const cmds = req.body as unknown[][];
        const steps: Step[] = [];
        const results: CmdResult[] = [];
        // 문법이 틀린 명령이 있으면 그 자리만 오류로 두고 나머지는 실행한다 (파이프라인)
        const runnable: number[] = [];
        for (let i = 0; i < cmds.length; i++) {
          try { steps.push(plan(cmds[i])); runnable.push(i); }
          catch (e) { steps.push({ sql: "", parse: () => null }); results[i] = { error: (e as Error).message }; }
        }
        const sqls = runnable.map((i) => steps[i].sql);
        if (sqls.length) {
          const rows = await this.run(sqls, path === "multi-exec");
          runnable.forEach((i, k) => { results[i] = { result: steps[i].parse(rows[k]) }; });
        }
        this.maybeGc();
        return results as unknown as { result?: TResult };
      }
      const step = plan(req.body as unknown[]);
      const res = await new Promise<CmdResult>((resolve) => {
        this.pending.push({ step, resolve });
        if (!this.scheduled) { this.scheduled = true; setImmediate(() => void this.flush()); }
      });
      if (res.error !== undefined) return { error: res.error };
      return { result: res.result as TResult };
    } catch (e) {
      const msg = (e as Error).message;
      if (Array.isArray(req.body) && (path === "pipeline" || path === "multi-exec")) {
        return (req.body as unknown[]).map(() => ({ error: msg })) as unknown as { error?: string };
      }
      return { error: msg };
    }
  }

  /** 모아 둔 단일 명령을 한 번의 왕복으로 보낸다. 묶음이 실패하면 하나씩 다시 보내서 오류를 해당 명령에만 돌려준다 */
  private async flush() {
    const batch = this.pending; this.pending = []; this.scheduled = false;
    try {
      const rows = await this.run(batch.map((b) => b.step.sql), false);
      batch.forEach((b, i) => b.resolve({ result: b.step.parse(rows[i]) }));
    } catch (e) {
      if (batch.length === 1) { batch[0].resolve({ error: (e as Error).message }); return; }
      for (const b of batch) {
        try { const r = await this.run([b.step.sql], false); b.resolve({ result: b.step.parse(r[0]) }); }
        catch (err) { b.resolve({ error: (err as Error).message }); }
      }
    }
    this.maybeGc();
  }

  /** 만료된 줄을 가끔 청소한다 (읽을 때는 걸러내므로 급하지 않다) */
  private maybeGc() {
    if (Math.random() < 0.02) this.pool.query(`DELETE FROM ${T} WHERE expires_at IS NOT NULL AND expires_at <= now()`).catch(() => {});
  }

  async close() { await this.pool.end(); }
}

/** 접속 주소로 요청기를 만든다 */
export function createPgRequester(url: string, opts: { max?: number } = {}): PgRequester {
  return new PgRequester(new pg.Pool(poolConfig(url, opts)));
}
