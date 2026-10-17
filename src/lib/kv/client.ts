import "server-only";
import { Redis } from "@upstash/redis";
import { createPgRequester, type PgRequester } from "./pg-requester";

/**
 * 앱 전체가 쓰는 저장소 클라이언트 (한 곳에서만 만든다).
 *  - DATA_BACKEND=postgres → Postgres(Supabase) 를 Redis 처럼 쓴다. DATABASE_URL 필요.
 *  - 그 외(기본)           → 지금처럼 Upstash Redis.
 * 앱 코드는 어느 쪽인지 모르고 같은 방식으로 부른다.
 */
type G = typeof globalThis & { __r2uPg?: PgRequester };

function make(): Redis {
  if (process.env.DATA_BACKEND === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATA_BACKEND=postgres 인데 DATABASE_URL 이 없어요.");
    const g = globalThis as G;
    // 개발 서버가 코드를 다시 불러와도 접속 묶음(pool)은 하나만 쓴다
    g.__r2uPg ??= createPgRequester(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 3) });
    return new Redis(g.__r2uPg);
  }
  return new Redis({
    url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export const redis = make();
