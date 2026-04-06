import * as net from 'net';
import { logger } from '../utils/logger';

/**
 * Serviço opcional de impressão via protocolo ESC/POS (TCP).
 * Só funciona se PRINTER_ENABLED=true e PRINTER_IP configurado.
 */

interface PrintOrderPayload {
  tableNumber: number;
  waiterName: string;
  items: Array<{ name: string; quantity: number; observation?: string | null }>;
  total?: number;
  printedAt: Date;
}

function formatLine(text: string, width = 42): string {
  return text.slice(0, width).padEnd(width);
}

function buildEscPosBuffer(payload: PrintOrderPayload): Buffer {
  const lines: string[] = [];

  lines.push('\x1B\x40');             // ESC @ — inicializar impressora
  lines.push('\x1B\x61\x01');         // centralizar

  lines.push('PEDIDO - MESA ' + payload.tableNumber);
  lines.push('Garçom: ' + payload.waiterName);
  lines.push(payload.printedAt.toLocaleString('pt-BR'));
  lines.push('-'.repeat(42));

  lines.push('\x1B\x61\x00');         // alinhar à esquerda

  for (const item of payload.items) {
    lines.push(`${item.quantity}x ${item.name}`);
    if (item.observation) {
      lines.push(`   OBS: ${item.observation}`);
    }
  }

  lines.push('-'.repeat(42));

  if (payload.total !== undefined) {
    lines.push(`TOTAL: R$ ${payload.total.toFixed(2)}`);
  }

  lines.push('\n\n\n');               // alimentar papel
  lines.push('\x1D\x56\x00');         // corte de papel (modo full cut)

  return Buffer.from(lines.join('\n'), 'utf8');
}

export async function printOrder(payload: PrintOrderPayload): Promise<void> {
  if (process.env.PRINTER_ENABLED !== 'true') {
    logger.debug('Impressora desabilitada (PRINTER_ENABLED=false)');
    return;
  }

  const ip = process.env.PRINTER_IP;
  const port = parseInt(process.env.PRINTER_PORT || '9100', 10);

  if (!ip) {
    logger.warn('PRINTER_IP não configurado — impressão ignorada');
    return;
  }

  const buffer = buildEscPosBuffer(payload);

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout ao conectar à impressora'));
    }, 5000);

    client.connect(port, ip, () => {
      client.write(buffer, (err) => {
        clearTimeout(timeout);
        client.destroy();
        if (err) {
          logger.error({ err, ip, port }, 'Erro ao enviar dados para impressora');
          reject(err);
        } else {
          logger.info({ ip, port, tableNumber: payload.tableNumber }, 'Pedido impresso');
          resolve();
        }
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ err, ip, port }, 'Erro de conexão com impressora');
      reject(err);
    });
  });
}
