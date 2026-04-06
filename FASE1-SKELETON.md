# Fase 1 – Skeleton do Projeto (Método Akita)

## 1. Visão Geral

Sistema de gestão de pedidos para restaurantes com quatro perfis:
- **Garçom** (app Flutter) – anota pedidos, envia para cozinha/bar, fecha conta.
- **Cozinha** (app Flutter kiosk) – recebe pedidos de comida, marca como pronto.
- **Bar** (app Flutter kiosk) – recebe pedidos de bebidas.
- **Dono** (app Flutter iOS/Android) – dashboard, gestão de cardápio e garçons.

**Stack final:**
- Backend: **Fastify + socket.io + TypeScript**
- Banco: **PostgreSQL (Oracle Cloud ou Neon.tech)**
- ORM: **Prisma**
- Apps: **Flutter (Riverpod, Isar para cache local)**
- Deploy: **Oracle Cloud Always Free (VM Ampere A1)**
- Impressão: **Opcional (impressora Wi‑Fi com ESC/POS)**

## 2. Estrutura de Diretórios

```
projeto/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth/          # login garçom (PIN), login dono (email)
│   │   │   ├── orders/        # CRUD comandas, enviar, fechar
│   │   │   ├── products/      # cardápio (dono)
│   │   │   ├── tables/        # mesas
│   │   │   └── dashboard/     # métricas (dono)
│   │   ├── websocket/
│   │   │   ├── handlers/      # kitchen, bar, waiter events
│   │   │   ├── rooms.js       # gerenciamento de salas socket.io
│   │   │   └── adapter.js     # Redis adapter (para escala futura)
│   │   ├── db/
│   │   │   └── prisma/        # schema, migrations, client
│   │   ├── middleware/
│   │   │   ├── auth.ts        # valida JWT (httpOnly cookie)
│   │   │   ├── role.ts        # verifica role (WAITER, KITCHEN, BAR, OWNER)
│   │   │   ├── rateLimit.ts   # rate limiting por IP/rota
│   │   │   └── security.ts    # helmet, cors, sanitização
│   │   ├── services/
│   │   │   ├── orderService.ts
│   │   │   ├── printerService.ts (opcional)
│   │   │   └── notificationService.ts
│   │   └── utils/
│   │       ├── errors.ts      # error handler padronizado
│   │       ├── logger.ts      # pino ou winston
│   │       └── crypto.ts      # bcrypt, jwt
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── security/          # testes de segurança específicos
│   ├── .env
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── apps/
│   ├── core/                  # lógica compartilhada Flutter (models, services, websocket)
│   ├── waiter/                # app garçom
│   ├── kitchen/               # app cozinha (kiosk)
│   ├── bar/                   # app bar (kiosk)
│   └── owner/                 # app dono (iOS/Android)
│
├── scripts/
│   └── deploy.sh              # script de deploy na Oracle VM
│
└── README.md
```

## 3. Modelos de Dados (Prisma)

```prisma
// backend/src/db/prisma/schema.prisma

model Restaurant {
  id        String    @id @default(cuid())
  name      String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  users     User[]
  tables    Table[]
  products  Product[]
}

model User {
  id           String     @id @default(cuid())
  name         String
  email        String?    @unique // apenas para OWNER
  pin          String?    // hash bcrypt (para WAITER)
  role         Role
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  orders       Order[]    @relation("waiterOrders")
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}

enum Role {
  WAITER
  KITCHEN
  BAR
  OWNER
}

model Table {
  id           String     @id @default(cuid())
  number       Int
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  orders       Order[]
  createdAt    DateTime   @default(now())
}

model Product {
  id           String     @id @default(cuid())
  name         String
  price        Float
  category     Category
  available    Boolean    @default(true)
  allergens    String[]   // e.g., ["gluten", "lactose"]
  isBrindeOnly Boolean    @default(false)
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  orderItems   OrderItem[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
}

enum Category {
  FOOD
  DRINK
  DESSERT
}

model Order {
  id            String       @id @default(cuid())
  tableId       String
  table         Table        @relation(fields: [tableId], references: [id])
  waiterId      String
  waiter        User         @relation("waiterOrders", fields: [waiterId], references: [id])
  status        OrderStatus
  isPostClosed  Boolean      @default(false) // saideira pós-fechamento
  closedAt      DateTime?
  total         Float
  items         OrderItem[]
  splitPayments SplitPayment[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}

enum OrderStatus {
  OPEN
  SENT_TO_KITCHEN
  SENT_TO_BAR
  PARTIALLY_READY
  COMPLETED
  CLOSED
}

model OrderItem {
  id            String      @id @default(cuid())
  orderId       String
  order         Order       @relation(fields: [orderId], references: [id])
  productId     String
  product       Product     @relation(fields: [productId], references: [id])
  quantity      Int
  observation   String?     // "sem gelo", "alergia: gluten"
  isBrinde      Boolean     @default(false)
  allergyAlert  String?     // preenchido automaticamente se produto tem alergênico
  status        ItemStatus
  destination   Destination // KITCHEN ou BAR (derivado da categoria)
  readyAt       DateTime?   // quando cozinha/bar marcou pronto
  deliveredAt   DateTime?   // quando garçom entregou
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}

enum ItemStatus {
  PENDING
  IN_PROGRESS
  READY
  DELIVERED
}

enum Destination {
  KITCHEN
  BAR
}

model SplitPayment {
  id        String   @id @default(cuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id])
  guestName String?
  amount    Float
  paid      Boolean  @default(false)
  paidAt    DateTime?
}
```

## 4. Rotas da API (REST + WebSocket)

### 4.1 REST (Fastify)

| Rota | Método | Descrição | Segurança |
|------|--------|-----------|------------|
| `/api/auth/waiter/login` | POST | PIN → JWT | Rate limit, bcrypt compare |
| `/api/auth/owner/login` | POST | email/senha → JWT | Rate limit, bcrypt |
| `/api/auth/logout` | POST | Invalida cookie | JWT required |
| `/api/restaurants/:id/tables` | GET | Lista mesas | JWT + role WAITER/OWNER |
| `/api/restaurants/:id/products` | GET | Cardápio (filtro categoria) | JWT (qualquer role) |
| `/api/orders` | POST | Criar comanda (abrir mesa) | JWT + WAITER |
| `/api/orders/:id/items` | POST | Adicionar item à comanda | JWT + WAITER, valida ownership da mesa |
| `/api/orders/:id/send` | POST | Enviar pedido (dispara WebSocket) | JWT + WAITER |
| `/api/orders/:id/close` | POST | Fechar conta, split | JWT + WAITER, valida IDOR |
| `/api/orders/:id/post-close` | POST | Saideira pós-fechamento | JWT + WAITER |
| `/api/owner/brinde/authorize` | POST | Dono autoriza brinde (gera token) | JWT + OWNER |
| `/api/owner/dashboard` | GET | Vendas do dia, ticket médio | JWT + OWNER |
| `/api/owner/products` | CRUD | Gerência de cardápio | JWT + OWNER |
| `/api/owner/workers` | CRUD | Gerência de garçons | JWT + OWNER |

### 4.2 WebSocket (socket.io)

**Namespaces:**
- `/waiter` – garçons (notificações de pronto)
- `/kitchen` – cozinha (pedidos de comida)
- `/bar` – bar (pedidos de bebida)
- `/owner` – dono (eventos de métricas)

**Eventos:**

| Evento (cliente→servidor) | Payload | Descrição |
|---------------------------|---------|------------|
| `waiter:send-order` | `{ orderId, items[] }` | Envia pedido (backend roteia para kitchen/bar) |
| `kitchen:item-ready` | `{ orderItemId }` | Cozinha marca item READY |
| `bar:item-ready` | `{ orderItemId }` | Bar marca item READY |
| `waiter:item-delivered` | `{ orderItemId }` | Garçom confirma entrega |

| Evento (servidor→cliente) | Payload | Descrição |
|---------------------------|---------|------------|
| `kitchen:new-order` | `{ orderId, tableNumber, items, createdAt }` | Cozinha recebe pedido |
| `bar:new-order` | `{ orderId, tableNumber, items }` | Bar recebe pedido |
| `waiter:item-ready-notification` | `{ orderId, tableNumber, itemName }` | Garçom é notificado |
| `owner:order-completed` | `{ orderId, total, waiterName }` | Dono atualizado |

## 5. Decisões de Segurança (Método Akita – Security-First)

Todas as decisões abaixo são **obrigatórias** e serão testadas na Fase 2.

| Princípio | Implementação |
|-----------|----------------|
| **Validação de entrada** | Zod schemas em todas as rotas. Rejeitar campos extras. |
| **Autenticação** | JWT em cookie httpOnly + SameSite=Strict. PIN do garçom tem bcrypt (salt 10). |
| **Autorização** | Middleware `role.ts` verifica permissão. Toda rota protegida valida `userId` vs recurso (ex: garçom só vê mesas do seu restaurante). |
| **Proteção IDOR** | Em rotas como `/orders/:id/close`, verificar se `order.waiterId === userId` ou `order.restaurantId` pertence ao dono. |
| **Rate limiting** | `fastify-rate-limit`: 100 req/15min por IP em rotas públicas; 500 req/15min em rotas autenticadas. |
| **Sanitização** | `fastify-helmet` + `xss-filters` em campos de observação. |
| **Prevenção SQL injection** | Prisma já previne (parametrização). |
| **Race conditions** | Use transações Prisma (`$transaction`) ao atualizar status de pedido ou fechar conta. |
| **Upload malicioso** | (Não aplicável – sem upload de arquivo por enquanto.) |
| **Campos gigantes** | Limite de tamanho: observação (500 chars), nome produto (100). |
| **Logs** | Todos os eventos de autenticação e alteração de pedido logados (pino). |

## 6. Variáveis de Ambiente (backend/.env)

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/restaurant
JWT_SECRET=super-secret-min-32-chars
CORS_ORIGIN=http://localhost:3001,https://app.restaurante.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Impressão opcional
PRINTER_ENABLED=false
PRINTER_IP=
PRINTER_PORT=9100

# WebSocket
SOCKET_PATH=/socket.io
```

## 7. Plano de Testes (TDD – será detalhado na Fase 2)

**Testes de segurança obrigatórios (exemplos):**

1. `POST /api/auth/waiter/login` com PIN errado → 401
2. `POST /api/orders/:id/close` com ID de outro garçom → 403
3. `POST /api/orders/:id/items` com `quantity` negativo → 400
4. Tentar acessar rota de dono com token de garçom → 403
5. Enviar `observation` com `<script>alert(1)</script>` → deve escapar ou rejeitar
6. Dois pedidos simultâneos para fechar mesma comanda → apenas um succeed (transação)
7. Rate limit: 101 requisições em 15 segundos → 429
8. WebSocket: conectar sem token → desconectar

**Testes de negócio:**
- Fluxo completo: abrir mesa → adicionar itens → enviar → cozinha recebe → marcar pronto → garçom notificado → entregar → fechar conta.
- Split payment: dividir total por 4, valores arredondados corretamente.
- Saideira: criar pedido pós-fechamento, não afeta vendas do dia (campo `isPostClosed`).

## 8. Instruções para o Agente (Próximas Fases)

Agora que o **Skeleton (Fase 1)** está definido, siga o Método Akita:

- **Fase 2 – Testes:** Gere os arquivos de teste completos (Jest + Supertest) para todas as rotas listadas, incluindo os testes de segurança mencionados. Use o diretório `backend/tests/`.
- **Fase 3 – Implementação:** Implemente o código Fastify + Prisma que faz os testes passarem. Comece pela rota de autenticação e depois as de pedidos.
- **Fase 4 – Otimização:** Refatore queries N+1, adicione índices no Prisma, otimize WebSocket.
- **Fase 5 – Deploy:** Configure o Oracle Cloud VM, Docker, GitHub Actions, e ambiente de produção.

**Importante:** Não avance para a Fase 2 sem confirmação do usuário.

---

## ✅ Final da Fase 1

O skeleton está completo. O projeto agora tem:
- Stack definida e justificada
- Estrutura de pastas clara
- Modelos de dados com todos os campos (incluindo brinde, alergia, saideira)
- APIs REST e WebSocket mapeadas
- Decisões de segurança documentadas
- Plano de testes esboçado

**Próximo passo:** Você confirma que o SDD está correto? Posso então gerar os **testes de segurança e negócio (Fase 2)** para você executar antes de qualquer código de implementação.
