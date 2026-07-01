// tRPC server setup con context tipado y middleware de tenant
// el middleware es la unica cosa que evita que un procedure "olvide"
// filtrar por tenantId, se aplica automaticamente a tenantProcedure

import { initTRPC, TRPCError } from "@trpc/server"
import { ZodError } from "zod"
import superjson from "superjson"

import type { Session } from "next-auth"

type Tenant = {
  id: string
  slug: string
  plan: "free" | "pro" | "enterprise"
}

// context de tRPC: se arma en cada request desde la sesion
// authedContext = tiene sesion valida
// tenantedContext = tiene sesion valida Y un tenant activo
export type Context = {
  session: Session | null
  tenant: Tenant | null
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure

// middleware: exige sesion valida
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

// middleware: exige tenant activo en la sesion
// este es el que protege el aislamiento: sin tenant no hay query
// el ctx.tenant se propaga a los procedures que lo usan
const hasTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.tenant) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "no active tenant in session",
    })
  }
  return next({ ctx: { ...ctx, tenant: ctx.tenant } })
})

export const authedProcedure = t.procedure.use(isAuthed)
export const tenantProcedure = authedProcedure.use(hasTenant)

// helper para asegurar que una entidad pertenece al tenant actual
// se usa en updates/deletes por id, antes de aplicar el cambio
// tira NOT_FOUND (no FORBIDDEN) para no leakear existencia cross-tenant
export function assertOwnedByTenant(
  entity: { tenantId: string } | undefined | null,
  currentTenantId: string,
): asserts entity is { tenantId: string } {
  if (!entity || entity.tenantId !== currentTenantId) {
    throw new TRPCError({ code: "NOT_FOUND" })
  }
}
