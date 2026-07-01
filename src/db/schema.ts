// schema drizzle con tenantId en cada tabla
// convencion: la columna se llama tenantId, no organizationId ni otras variantes
// hay un index compuesto (tenantId, ...) en cada tabla para asegurar que
// las queries siempre filtren por tenant como primer criterio

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

// tenants: la unica tabla sin tenantId propio (es el propio tenant)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"), // free, pro, enterprise
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// users: pertenecen a un tenant (multi-tenant simple, no cross-tenant users)
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("member"), // member, admin
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantEmailIdx: index("users_tenant_email_idx").on(t.tenantId, t.email),
  }),
)

// customers: entidad del dominio, aislada por tenant
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("customers_tenant_idx").on(t.tenantId),
    tenantNameIdx: index("customers_tenant_name_idx").on(t.tenantId, t.name),
  }),
)

// contracts: FK a customer + tenantId propio (defense in depth)
// tenerlo redundante permite validar el aislamiento aun si el customer se
// borra por soft delete inconsistente
export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"), // draft, active, closed
    amount: text("amount").notNull(), // numeric text para precision
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantIdx: index("contracts_tenant_idx").on(t.tenantId),
    tenantCustomerIdx: index("contracts_tenant_customer_idx").on(
      t.tenantId,
      t.customerId,
    ),
  }),
)
