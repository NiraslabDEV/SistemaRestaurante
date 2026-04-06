import {
  calculateTotal,
  validateSplitPayment,
  canAddPostCloseItem,
} from '../../src/services/orderService';

describe('Order Service – Testes Unitários', () => {
  describe('calculateTotal', () => {
    it('deve calcular total corretamente com múltiplos itens', () => {
      const items = [
        { price: 89.90, quantity: 1, isBrinde: false },
        { price: 18.00, quantity: 2, isBrinde: false },
      ];
      expect(calculateTotal(items)).toBeCloseTo(125.90, 2);
    });

    it('deve ignorar itens marcados como brinde no total', () => {
      const items = [
        { price: 89.90, quantity: 1, isBrinde: false },
        { price: 18.00, quantity: 1, isBrinde: true },
      ];
      expect(calculateTotal(items)).toBeCloseTo(89.90, 2);
    });

    it('deve retornar 0 para lista vazia', () => {
      expect(calculateTotal([])).toBe(0);
    });

    it('deve retornar 0 se todos os itens são brinde', () => {
      const items = [
        { price: 50.00, quantity: 2, isBrinde: true },
        { price: 30.00, quantity: 1, isBrinde: true },
      ];
      expect(calculateTotal(items)).toBe(0);
    });

    it('deve multiplicar price por quantity corretamente', () => {
      const items = [{ price: 10.00, quantity: 3, isBrinde: false }];
      expect(calculateTotal(items)).toBeCloseTo(30.00, 2);
    });
  });

  describe('validateSplitPayment', () => {
    it('deve validar split que soma exatamente o total', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: 30.00 },
        { guestName: 'Maria', amount: 30.00 },
        { guestName: 'Pedro', amount: 40.00 },
      ];
      expect(validateSplitPayment(total, splits)).toBe(true);
    });

    it('deve validar split com diferença de arredondamento <= R$0.02', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: 33.33 },
        { guestName: 'Maria', amount: 33.33 },
        { guestName: 'Pedro', amount: 33.34 },
      ];
      expect(validateSplitPayment(total, splits)).toBe(true);
    });

    it('deve rejeitar split que não soma o total', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: 30.00 },
        { guestName: 'Maria', amount: 30.00 },
        // Faltam 40.00
      ];
      expect(validateSplitPayment(total, splits)).toBe(false);
    });

    it('deve rejeitar split com valor negativo', () => {
      const total = 100.00;
      const splits = [
        { guestName: 'João', amount: -10.00 },
        { guestName: 'Maria', amount: 110.00 },
      ];
      expect(validateSplitPayment(total, splits)).toBe(false);
    });

    it('deve rejeitar split vazio com total maior que zero', () => {
      expect(validateSplitPayment(100.00, [])).toBe(false);
    });

    it('deve aceitar split com um único pagante', () => {
      const total = 89.90;
      const splits = [{ guestName: 'João', amount: 89.90 }];
      expect(validateSplitPayment(total, splits)).toBe(true);
    });
  });

  describe('canAddPostCloseItem', () => {
    it('deve permitir item pós-fechamento se order está CLOSED', () => {
      const order = { status: 'CLOSED', closedAt: new Date() };
      expect(canAddPostCloseItem(order)).toBe(true);
    });

    it('deve rejeitar item pós-fechamento se order está OPEN', () => {
      const order = { status: 'OPEN', closedAt: null };
      expect(canAddPostCloseItem(order)).toBe(false);
    });

    it('deve rejeitar item pós-fechamento se order está SENT_TO_KITCHEN', () => {
      const order = { status: 'SENT_TO_KITCHEN', closedAt: null };
      expect(canAddPostCloseItem(order)).toBe(false);
    });

    it('deve rejeitar item pós-fechamento se closedAt é null mesmo com status CLOSED', () => {
      const order = { status: 'CLOSED', closedAt: null };
      expect(canAddPostCloseItem(order)).toBe(false);
    });
  });
});
