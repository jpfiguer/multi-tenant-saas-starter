# multi-tenant-saas-starter

Starter minimo pero realista de un **SaaS multi-tenant** con **Next.js + tRPC
+ Drizzle + PostgreSQL**, aislamiento por tenant desde el dia 1, tests que
prueban aislamiento explicitamente, y rate limit por tenant con Upstash Redis.

> Codigo sintetico, sin datos ni clientes reales. Ilustra los patrones que uso
> en SaaS multi-tenant productivos. Ver [`portfolio`](https://github.com/jpfiguer/portfolio)
> para case studies con contexto de negocio.

## Que muestra

- **Aislamiento por tenant desde el dia 1**: cada tabla lleva `tenantId`,
  middleware inyecta el tenant en cada procedure tRPC
- **Tests de aislamiento explicitos**: un usuario del tenant A no puede leer
  ni escribir datos del tenant B, ni siquiera pasando IDs directos
- **Rate limit por tenant** con Upstash: un tenant abusivo no afecta a los demas
- **Type-safety end-to-end**: cambiar una firma en el backend rompe el frontend
  en compile-time (tRPC + Drizzle + Zod)
- **Auth con NextAuth + passkeys** (WebAuthn)
- **Migraciones con drizzle-kit** + seed determinista para tests

## Stack

- Next.js 15 (App Router + Server Actions)
- tRPC v11 + React Query
- Drizzle ORM + PostgreSQL
- NextAuth v5 + `@simplewebauthn/*`
- Upstash Redis (rate limit)
- Vitest + Playwright + Testing Library
- Tailwind + shadcn/ui
- Zod para validacion en boundaries

## Arquitectura del aislamiento

```mermaid
flowchart LR
  U[User request] --> A[middleware auth<br/>NextAuth]
  A --> B[middleware tenant<br/>extrae tenantId de la sesion]
  B --> C[middleware rate limit<br/>upstash por tenantId]
  C --> D[tRPC procedure]
  D --> E[Drizzle query<br/>con where eq(tenantId)]
  E --> F[(PostgreSQL)]

  G[Tests aislamiento] -.-> H[assert user A no ve datos B]
  G -.-> I[assert insert falla si tenantId ajeno]
```

## Estructura

```
multi-tenant-saas-starter/
├── README.md
├── LICENSE (AGPL-3.0)
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── src/
│   ├── db/
│   │   ├── schema.ts              tablas con tenantId
│   │   ├── client.ts              drizzle client
│   │   └── migrations/            drizzle migrations
│   ├── server/
│   │   ├── trpc.ts                context + middleware
│   │   ├── router.ts              main router
│   │   ├── routers/
│   │   │   ├── customers.ts       CRUD con tenant isolation
│   │   │   └── contracts.ts
│   │   └── ratelimit.ts           upstash config
│   ├── auth/
│   │   ├── nextauth.ts            config con webauthn
│   │   └── passkeys.ts            simplewebauthn helpers
│   └── lib/
│       └── errors.ts              app errors
├── app/                           next.js app router
├── tests/
│   ├── isolation.test.ts          tests que atacan el middleware
│   ├── ratelimit.test.ts
│   └── e2e/                       playwright
└── .github/workflows/ci.yml
```

## Correr local

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm test
```

## El middleware que no se puede saltar

El middleware que inyecta `tenantId` en cada procedure es la unica cosa que
protege el aislamiento. Los tests de `tests/isolation.test.ts` lo atacan
explicitamente:

- Un procedure `getCustomer(id)` no puede devolver un customer de otro tenant,
  ni pasandole el `id` directamente
- Un procedure `updateCustomer(id, patch)` no puede modificar un customer de
  otro tenant, aunque el `id` exista en la db
- Un procedure `listCustomers()` solo devuelve los del tenant actual

Ver `src/server/trpc.ts` para la implementacion del middleware y
`src/server/routers/customers.ts` para el uso.

## Licencia

AGPL-3.0.
