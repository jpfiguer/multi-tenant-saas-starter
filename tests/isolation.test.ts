// tests que atacan explicitamente el middleware de aislamiento
// si estos tests pasan, el aislamiento es solido
// si alguno rompe, hay que arreglarlo YA (no es un warning, es un bug de seguridad)

import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { customersRouter } from "@/server/routers/customers"
import { setupTestDb, teardownTestDb } from "./setup"
import type { Tenant } from "./types"

// helpers de test que arman un caller con contexto simulado
// en tests reales de trpc, se usa trpc.createCaller con el ctx
async function callAs(tenant: Tenant, fn: (caller: ReturnType<typeof customersRouter.createCaller>) => Promise<unknown>) {
  const caller = customersRouter.createCaller({
    session: { user: { id: `u-${tenant.id}`, email: "u@example.com" } } as any,
    tenant,
  })
  return fn(caller)
}


describe("customers isolation", () => {
  let tenantA: Tenant
  let tenantB: Tenant

  beforeAll(async () => {
    ;({ tenantA, tenantB } = await setupTestDb())
  })

  afterAll(async () => {
    await teardownTestDb()
  })

  test("user of tenant A does NOT see customers of tenant B in list", async () => {
    const asA = (await callAs(tenantA, (c) => c.list())) as { tenantId: string }[]
    for (const row of asA) {
      expect(row.tenantId).toBe(tenantA.id)
    }
  })

  test("user of tenant A cannot get a customer of tenant B by id", async () => {
    // creamos un customer en tenantB
    const created = await callAs(tenantB, (c) =>
      c.create({ name: "customer-b" }),
    )
    const b = created as { id: string; tenantId: string }
    expect(b.tenantId).toBe(tenantB.id)

    // intentamos leerlo desde tenantA con su id exacto → NOT_FOUND
    await expect(
      callAs(tenantA, (c) => c.get({ id: b.id })),
    ).rejects.toThrow(/NOT_FOUND/)
  })

  test("user of tenant A cannot update a customer of tenant B", async () => {
    const created = await callAs(tenantB, (c) =>
      c.create({ name: "target" }),
    )
    const b = created as { id: string }
    await expect(
      callAs(tenantA, (c) =>
        c.update({ id: b.id, patch: { name: "hacked" } }),
      ),
    ).rejects.toThrow(/NOT_FOUND/)

    // y verificamos que sigue igual desde tenantB
    const stillOk = (await callAs(tenantB, (c) => c.get({ id: b.id }))) as {
      name: string
    }
    expect(stillOk.name).toBe("target")
  })

  test("create ignores tenantId in the input, uses ctx.tenant", async () => {
    // aun si el cliente intenta forzar tenantId de otro tenant,
    // el server lo ignora (no forma parte del input schema)
    const created = (await callAs(tenantA, (c) =>
      c.create({
        name: "should-belong-to-A",
        // @ts-expect-error probamos que el schema rechaza campos extra
        tenantId: tenantB.id,
      }),
    )) as { tenantId: string }
    expect(created.tenantId).toBe(tenantA.id)
  })

  test("archive respects tenant isolation", async () => {
    const created = await callAs(tenantB, (c) =>
      c.create({ name: "to-archive" }),
    )
    const b = created as { id: string }
    await expect(
      callAs(tenantA, (c) => c.archive({ id: b.id })),
    ).rejects.toThrow(/NOT_FOUND/)
  })
})
