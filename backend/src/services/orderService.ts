import { prisma } from '../db/prisma/client';
import { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, AppError } from '../utils/errors';
import xss from 'xss';

// --- Funções puras (testáveis unitariamente) ---

interface ItemForTotal {
  price: number;
  quantity: number;
  isBrinde: boolean;
}

export function calculateTotal(items: ItemForTotal[]): number {
  return items
    .filter(i => !i.isBrinde)
    .reduce((sum, i) => sum + i.price * i.quantity, 0);
}

interface SplitEntry {
  guestName?: string | null;
  amount: number;
}

export function validateSplitPayment(total: number, splits: SplitEntry[]): boolean {
  if (splits.length === 0) return false;
  if (splits.some(s => s.amount < 0)) return false;

  const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  return Math.abs(splitTotal - total) <= 0.02;
}

export function canAddPostCloseItem(order: { status: string; closedAt: Date | null }): boolean {
  return order.status === 'CLOSED' && order.closedAt !== null;
}

// --- Operações de banco ---

export async function createOrder(tableId: string, waiterId: string, restaurantId: string) {
  // Validar que a mesa pertence ao restaurante do garçom
  const table = await prisma.table.findFirst({
    where: { id: tableId, restaurantId },
  });

  if (!table) {
    throw new AppError('Mesa não encontrada neste restaurante', 400);
  }

  return prisma.order.create({
    data: {
      tableId,
      waiterId,
      status: 'OPEN',
      total: 0,
    },
  });
}

export async function addItemToOrder(
  orderId: string,
  productId: string,
  quantity: number,
  observation: string | undefined,
  requestingUserId: string
) {
  // Verificar ownership da comanda (proteção IDOR)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { table: true },
  });

  if (!order) throw new NotFoundError('Comanda não encontrada');
  if (order.waiterId !== requestingUserId) {
    throw new ForbiddenError('Você não tem permissão para editar esta comanda');
  }

  // Validar produto
  const product = await prisma.product.findFirst({
    where: { id: productId, restaurantId: order.table.restaurantId },
  });

  if (!product) throw new NotFoundError('Produto não encontrado');
  if (!product.available) throw new AppError('Produto indisponível', 400);

  // Sanitizar observação
  const sanitizedObs = observation ? xss(observation) : undefined;

  // Detectar alergênicos automaticamente
  const allergyAlert =
    product.allergens.length > 0
      ? `Atenção: contém ${product.allergens.join(', ')}`
      : undefined;

  const destination: 'KITCHEN' | 'BAR' =
    product.category === 'FOOD' || product.category === 'DESSERT' ? 'KITCHEN' : 'BAR';

  return prisma.orderItem.create({
    data: {
      orderId,
      productId,
      quantity,
      observation: sanitizedObs,
      destination,
      allergyAlert,
      status: 'PENDING',
    },
    include: { product: true },
  });
}

export async function sendOrder(orderId: string, requestingUserId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });

  if (!order) throw new NotFoundError('Comanda não encontrada');
  if (order.waiterId !== requestingUserId) {
    throw new ForbiddenError('Acesso negado');
  }
  if (order.items.length === 0) {
    throw new AppError('Comanda sem itens', 400);
  }

  const hasFood = order.items.some((i: { destination: string }) => i.destination === 'KITCHEN');
  const hasDrink = order.items.some((i: { destination: string }) => i.destination === 'BAR');

  let newStatus: string;
  if (hasFood && hasDrink) newStatus = 'SENT_TO_KITCHEN';
  else if (hasFood) newStatus = 'SENT_TO_KITCHEN';
  else newStatus = 'SENT_TO_BAR';

  return prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus as any },
    include: { items: { include: { product: true } } },
  });
}

export async function closeOrder(
  orderId: string,
  requestingUserId: string,
  split?: SplitEntry[]
) {
  // Transação atômica — evita race condition de fechamento duplo
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // SELECT FOR UPDATE simulado via transação + verificação de status
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) throw new NotFoundError('Comanda não encontrada');
    if (order.waiterId !== requestingUserId) {
      throw new ForbiddenError('Acesso negado');
    }
    if (order.status === 'CLOSED') {
      throw new ConflictError('Comanda já foi fechada');
    }

    const total = calculateTotal(
      order.items.map((i: { product: { price: number }; quantity: number; isBrinde: boolean }) => ({
        price: i.product.price,
        quantity: i.quantity,
        isBrinde: i.isBrinde,
      }))
    );

    // Validar split se fornecido
    if (split && split.length > 0) {
      if (!validateSplitPayment(total, split)) {
        throw new AppError('Split payment inválido: valores não somam o total', 400);
      }
    }

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: 'CLOSED', closedAt: new Date(), total },
    });

    let splitPayments: any[] = [];
    if (split && split.length > 0) {
      splitPayments = await Promise.all(
        split.map(s =>
          tx.splitPayment.create({
            data: {
              orderId,
              guestName: s.guestName ? xss(s.guestName) : null,
              amount: s.amount,
              paid: false,
            },
          })
        )
      );
    }

    return { order: updatedOrder, splitPayments };
  });
}

export async function addPostCloseItem(
  orderId: string,
  productId: string,
  quantity: number,
  requestingUserId: string
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order) throw new NotFoundError('Comanda não encontrada');
  if (order.waiterId !== requestingUserId) throw new ForbiddenError('Acesso negado');
  if (!canAddPostCloseItem(order)) {
    throw new AppError('Comanda não está fechada — não é possível adicionar saideira', 400);
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Produto não encontrado');

  const destination: 'KITCHEN' | 'BAR' =
    product.category === 'FOOD' || product.category === 'DESSERT' ? 'KITCHEN' : 'BAR';

  const item = await prisma.orderItem.create({
    data: {
      orderId,
      productId,
      quantity,
      destination,
      status: 'PENDING',
    },
  });

  return { item: { ...item, isPostClose: true } };
}
