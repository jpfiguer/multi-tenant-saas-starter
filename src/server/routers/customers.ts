// customers router: CRUD con tenant isolation aplicado en cada query
// la clave del aislamiento no es "confiar" en el orm, es filtrar por tenantId
// en el where de cada query, incluyendo updates y deletes

import { and, eq, ilike } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db/client"
import { customers } from "@/db/schema"
import { assertOwnedByTenant, router, tenantProcedure } from "@/server/trpc"

export const customersRouter = router({
  list: tenantProcedure
    .input(
      z
        .object({
          q: z.string().optional(),
          includeArchived: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(customers.tenantId, ctx.tenant.id)]
      if (input?.q) {
        conditions.push(ilike(customers.name, `%${input.q}%`))
      }
      if (!input?.includeArchived) {
        conditions.push(eq(customers.archived, false))
      }
      return db.select().from(customers).where(and(...conditions))
    }),

  get: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // filtrar por tenantId en el WHERE, no despues
      // si no pertenece al tenant, no aparece en el resultado
      const rows = await db
        .select()
        .from(customers)
        .where(
          and(eq(customers.id, input.id), eq(customers.tenantId, ctx.tenant.id)),
        )
        .limit(1)
      const row = rows[0]
      assertOwnedByTenant(row, ctx.tenant.id)
      return row
    }),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // tenantId lo inyecta el server, nunca lo acepta del cliente
      const [row] = await db
        .insert(customers)
        .values({ ...input, tenantId: ctx.tenant.id })
        .returning()
      return row
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).optional(),
          email: z.string().email().optional(),
          phone: z.string().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // el update filtra por tenantId en el WHERE
      // aunque el id pertenezca a otro tenant, el update no afecta nada
      const rows = await db
        .update(customers)
        .set({ ...input.patch, updatedAt: new Date() })
        .where(
          and(eq(customers.id, input.id), eq(customers.tenantId, ctx.tenant.id)),
        )
        .returning()
      const row = rows[0]
      assertOwnedByTenant(row, ctx.tenant.id)
      return row
    }),

  archive: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // soft delete, mismo filtro por tenantId
      const rows = await db
        .update(customers)
        .set({ archived: true, updatedAt: new Date() })
        .where(
          and(eq(customers.id, input.id), eq(customers.tenantId, ctx.tenant.id)),
        )
        .returning()
      const row = rows[0]
      assertOwnedByTenant(row, ctx.tenant.id)
      return { ok: true }
    }),
})
