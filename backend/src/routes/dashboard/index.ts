import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import { prisma } from '../../db/prisma/client';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /api/owner/dashboard — apenas OWNER
  fastify.get('/', { preHandler: requireRole('OWNER') }, async (request, reply) => {
    const restaurantId = request.user.restaurantId;

    // Início do dia corrente
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalOrders, closedOrders] = await Promise.all([
      prisma.order.count({ where: { table: { restaurantId } } }),
      prisma.order.findMany({
        where: {
          table: { restaurantId },
          status: 'CLOSED',
          closedAt: { gte: today },
          isPostClosed: false,
        },
        select: { total: true },
      }),
    ]);

    const dailyRevenue = closedOrders.reduce((sum: number, o: { total: number }) => sum + o.total, 0);
    const averageTicket = closedOrders.length > 0 ? dailyRevenue / closedOrders.length : 0;

    return reply.send({
      totalOrders,
      closedToday: closedOrders.length,
      dailyRevenue: parseFloat(dailyRevenue.toFixed(2)),
      averageTicket: parseFloat(averageTicket.toFixed(2)),
    });
  });
}
