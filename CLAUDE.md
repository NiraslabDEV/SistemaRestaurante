# CLAUDE.md — Sistema de Gestão de Restaurante

## Visão Geral

Sistema de gestão de pedidos para restaurantes com quatro perfis de usuário:
- **Garçom** (app Flutter) — anota pedidos, envia para cozinha/bar, fecha conta
- **Cozinha** (app Flutter kiosk) — recebe pedidos de comida, marca como pronto
- **Bar** (app Flutter kiosk) — recebe pedidos de bebidas
- **Dono** (app Flutter iOS/Android) — dashboard, gestão de cardápio e garçons

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Fastify + TypeScript |
| Realtime | socket.io |
| ORM | Prisma |
| Banco | PostgreSQL (Oracle Cloud Free ou Neon.tech) |
| Apps | Flutter (Riverpod, Isar cache local) |
| Testes | Jest + Supertest |
| Deploy | Oracle Cloud Always Free (VM Ampere A1) |
| Impressão | Opcional — impressora Wi-Fi ESC/POS |

## Estrutura de Diretórios

```
projeto/
├── CLAUDE.md
├── backend/
│   ├── src/
│   │   ├── app.ts                 # Bootstrap do Fastify
│   │   ├── routes/
│   │   │   ├── auth/              # login garçom (PIN), login dono (email)
│   │   │   ├── orders/            # CRUD comandas
│   │   │   ├── products/          # cardápio (dono)
│   │   │   ├── tables/            # mesas
│   │   │   └── dashboard/         # métricas (dono)
│   │   ├── websocket/
│   │   │   ├── handlers/          # kitchen, bar, waiter events
│   │   │   ├── rooms.ts           # gerenciamento de salas socket.io
│   │   │   └── adapter.ts         # Redis adapter (escala futura)
│   │   ├── db/
│   │   │   └── prisma/
│   │   │       └── schema.prisma
│   │   ├── middleware/
│   │   │   ├── auth.ts            # valida JWT (httpOnly cookie)
│   │   │   ├── role.ts            # verifica role
│   │   │   ├── rateLimit.ts       # rate limiting por IP/rota
│   │   │   └── security.ts        # helmet, cors, sanitização
│   │   ├── services/
│   │   │   ├── orderService.ts
│   │   │   ├── printerService.ts  # opcional
│   │   │   └── notificationService.ts
│   │   └── utils/
│   │       ├── errors.ts
│   │       ├── logger.ts
│   │       └── crypto.ts
│   ├── tests/
│   │   ├── setup.ts
│   │   ├── helpers/
│   │   │   ├── db.ts
│   │   │   ├── auth.ts
│   │   │   └── socket.ts
│   │   ├── unit/
│   │   ├── integration/
│   │   └── security/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── apps/
│   ├── core/
│   ├── waiter/
│   ├── kitchen/
│   ├── bar/
│   └── owner/
└── scripts/
    └── deploy.sh
```

## Modelos de Dados

- **Restaurant** — entidade raiz (multi-tenant futuro)
- **User** — roles: WAITER, KITCHEN, BAR, OWNER
- **Table** — mesas do restaurante
- **Product** — cardápio com categoria (FOOD, DRINK, DESSERT)
- **Order** — comanda por mesa/garçom
- **OrderItem** — item dentro da comanda, roteado para KITCHEN ou BAR
- **SplitPayment** — divisão de conta

## Rotas REST

| Rota | Método | Role | Proteção |
|------|--------|------|----------|
| `/api/auth/waiter/login` | POST | público | rate limit, bcrypt |
| `/api/auth/owner/login` | POST | público | rate limit, bcrypt |
| `/api/auth/logout` | POST | qualquer | JWT cookie |
| `/api/restaurants/:id/tables` | GET | WAITER/OWNER | JWT + role |
| `/api/restaurants/:id/products` | GET | qualquer auth | JWT |
| `/api/orders` | POST | WAITER | JWT + role |
| `/api/orders/:id/items` | POST | WAITER | JWT + IDOR check |
| `/api/orders/:id/send` | POST | WAITER | JWT + IDOR check |
| `/api/orders/:id/close` | POST | WAITER | JWT + IDOR check |
| `/api/orders/:id/post-close` | POST | WAITER | JWT + IDOR check |
| `/api/owner/brinde/authorize` | POST | OWNER | JWT + role |
| `/api/owner/dashboard` | GET | OWNER | JWT + role |
| `/api/owner/products` | CRUD | OWNER | JWT + role |
| `/api/owner/workers` | CRUD | OWNER | JWT + role |

## Variáveis de Ambiente

```
NODE_ENV
PORT
DATABASE_URL
JWT_SECRET
CORS_ORIGIN
RATE_LIMIT_WINDOW_MS
RATE_LIMIT_MAX
PRINTER_ENABLED
PRINTER_IP
PRINTER_PORT
SOCKET_PATH
```

## Decisões de Segurança

| Princípio | Implementação |
|-----------|--------------|
| Validação de entrada | Zod schemas em todas as rotas; rejeitar campos extras |
| Autenticação | JWT em cookie httpOnly + SameSite=Strict |
| Hash de senhas | bcrypt salt 10 para PIN e senha |
| Autorização | Middleware role.ts; deny by default |
| IDOR | Verifica ownership em TODA operação de escrita/leitura |
| Rate limiting | 100 req/15min por IP em rotas públicas |
| Sanitização | fastify-helmet + xss-filters em campos livres |
| SQL Injection | Prisma (parametrização automática) |
| Race conditions | Transações Prisma ($transaction + SELECT FOR UPDATE) |
| Campos gigantes | observation: max 500 chars; nome produto: max 100 chars |
| Logs | pino — todos eventos de auth e alteração de pedido |

## Integrações Externas

- **PostgreSQL** — banco principal (Oracle Cloud Free / Neon.tech)
- **socket.io** — realtime entre garçom, cozinha, bar, dono
- **Impressora ESC/POS** — opcional, via TCP Wi-Fi

## Fases do Projeto

- [x] Fase 1 — Skeleton (CLAUDE.md + estrutura)
- [x] Fase 2 — Testes (Jest + Supertest, security tests)
- [x] Fase 3 — Implementação (Fastify + Prisma + socket.io)
- [x] Fase 4 — Otimização (índices, singleton Prisma, funções puras)
- [x] Fase 5 — Deploy (GitHub Actions CI, Dockerfile, deploy.sh Oracle VM)
