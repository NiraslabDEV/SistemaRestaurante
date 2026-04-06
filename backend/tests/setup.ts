import { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { buildApp } from '../src/app';

export const prisma = new PrismaClient();

let app: FastifyInstance;

export async function setupTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp({ testMode: true });
    await app.ready();
  }
  return app;
}

export async function getTestServer() {
  const instance = await setupTestApp();
  return supertest(instance.server);
}

export async function cleanupDatabase() {
  await prisma.splitPayment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.table.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();
}

export async function seedRestaurant() {
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Restaurante Teste' },
  });

  const hashedPin = await bcrypt.hash('1234', 10);
  const hashedPassword = await bcrypt.hash('owner123', 10);

  const owner = await prisma.user.create({
    data: {
      name: 'Dono Teste',
      email: 'dono@teste.com',
      password: hashedPassword,
      role: 'OWNER',
      restaurantId: restaurant.id,
    },
  });

  const waiter = await prisma.user.create({
    data: {
      name: 'Garçom Teste',
      pin: hashedPin,
      role: 'WAITER',
      restaurantId: restaurant.id,
    },
  });

  const kitchen = await prisma.user.create({
    data: {
      name: 'Cozinha Teste',
      pin: hashedPin,
      role: 'KITCHEN',
      restaurantId: restaurant.id,
    },
  });

  const bar = await prisma.user.create({
    data: {
      name: 'Bar Teste',
      pin: hashedPin,
      role: 'BAR',
      restaurantId: restaurant.id,
    },
  });

  const table1 = await prisma.table.create({
    data: { number: 1, restaurantId: restaurant.id },
  });

  const table2 = await prisma.table.create({
    data: { number: 2, restaurantId: restaurant.id },
  });

  const foodProduct = await prisma.product.create({
    data: {
      name: 'Picanha na Brasa',
      price: 89.90,
      category: 'FOOD',
      available: true,
      allergens: [],
      isBrindeOnly: false,
      restaurantId: restaurant.id,
    },
  });

  const drinkProduct = await prisma.product.create({
    data: {
      name: 'Caipirinha de Limão',
      price: 18.00,
      category: 'DRINK',
      available: true,
      allergens: [],
      isBrindeOnly: false,
      restaurantId: restaurant.id,
    },
  });

  return {
    restaurant,
    owner,
    waiter,
    kitchen,
    bar,
    table1,
    table2,
    foodProduct,
    drinkProduct,
  };
}

export function generateJWT(
  user: { id: string; role: string; restaurantId: string },
  secret: string = process.env.JWT_SECRET || 'test-secret-min-32-chars-for-hmac'
) {
  return jwt.sign(
    { userId: user.id, role: user.role, restaurantId: user.restaurantId },
    secret,
    { expiresIn: '8h' }
  );
}

beforeAll(async () => {
  await setupTestApp();
});

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
  if (app) await app.close();
});
