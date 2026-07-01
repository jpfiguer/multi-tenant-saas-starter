// rate limit por tenant con upstash
// clave: `${tenantId}:${route}` para que un tenant abusivo no afecte a los demas
// configuracion diferenciada por plan (free, pro, enterprise)
//
// esto se integra en tRPC como un middleware que se aplica selectivamente
// a procedures publicos y mutaciones costosas (no a queries triviales)

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// una sola conexion a redis, cacheada por default por upstash
const redis = Redis.fromEnv()

// limites por plan (requests / minuto)
const LIMITS_BY_PLAN: Record<string, number> = {
  free: 30,
  pro: 300,
  enterprise: 3000,
}

const limiters = new Map<string, Ratelimit>()

function getLimiter(plan: string): Ratelimit {
  const key = plan in LIMITS_BY_PLAN ? plan : "free"
  const cached = limiters.get(key)
  if (cached) return cached
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(LIMITS_BY_PLAN[key], "1 m"),
    prefix: `rl:${key}`,
    analytics: true,
  })
  limiters.set(key, rl)
  return rl
}

// api simple: check(tenantId, plan, route)
// tira si excede el limite; retorna metadata si ok
export async function check(
  tenantId: string,
  plan: string,
  route: string,
): Promise<{ remaining: number; reset: number }> {
  const rl = getLimiter(plan)
  const key = `${tenantId}:${route}`
  const res = await rl.limit(key)
  if (!res.success) {
    const err = new Error("rate_limit_exceeded")
    ;(err as any).status = 429
    ;(err as any).retryAfter = res.reset
    throw err
  }
  return { remaining: res.remaining, reset: res.reset }
}
