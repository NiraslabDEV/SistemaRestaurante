import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Remove todos os dados na ordem correta (FK) */
export async function cleanupDatabase() {
  await prisma.splitPayment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.table.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();
}

/** Cria um restaurante completo com todos os perfis e produtos */
export async function seedRestaurant() {
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Restaurante Teste' },
  });

  const [hashedPin, hashedPassword] = await Promise.all([
    bcrypt.hash('1234', 10),
    bcrypt.hash('owner123', 10),
  ]);

  const [owner, waiter, kitchen, bar, table1, table2, foodProduct, drinkProduct] =
    await Promise.all([
      prisma.user.create({
        data: { name: 'Dono Teste', email: 'dono@teste.com', password: hashedPassword, role: 'OWNER', restaurantId: restaurant.id },
      }),
      prisma.user.create({
        data: { name: 'Garçom Teste', pin: hashedPin, role: 'WAITER', restaurantId: restaurant.id },
      }),
      prisma.user.create({
        data: { name: 'Cozinha Teste', pin: hashedPin, role: 'KITCHEN', restaurantId: restaurant.id },
      }),
      prisma.user.create({
        data: { name: 'Bar Teste', pin: hashedPin, role: 'BAR', restaurantId: restaurant.id },
      }),
      prisma.table.create({ data: { number: 1, restaurantId: restaurant.id } }),
      prisma.table.create({ data: { number: 2, restaurantId: restaurant.id } }),
      prisma.product.create({
        data: { name: 'Picanha na Brasa', price: 89.90, category: 'FOOD', available: true, allergens: [], isBrindeOnly: false, restaurantId: restaurant.id },
      }),
      prisma.product.create({
        data: { name: 'Caipirinha de Limão', price: 18.00, category: 'DRINK', available: true, allergens: [], isBrindeOnly: false, restaurantId: restaurant.id },
      }),
    ]);

  return { restaurant, owner, waiter, kitchen, bar, table1, table2, foodProduct, drinkProduct };
}

export { prisma };
