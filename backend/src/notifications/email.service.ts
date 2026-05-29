import { Injectable, Logger } from '@nestjs/common';

interface BuyerOrderData {
  cardName: string;
  amount: number; // MXN cents
  sellerName: string;
  orderId: string;
}

interface SellerOrderData {
  cardName: string;
  amount: number; // MXN cents
  buyerName: string;
  orderId: string;
}

interface ShippedData {
  cardName: string;
  trackingNumber: string;
  orderId: string;
}

const ACCENT = '#6C3AE8';
const BG = '#16161E';
const BG_DARK = '#0F0F14';

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG_DARK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" style="max-width:520px;background:${BG};border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,${ACCENT},#8B5CF6);padding:24px 32px">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.5px">TCG Live</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px">Subastas en vivo de cartas coleccionables</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,0.06)">
          <p style="margin:0;color:#52525b;font-size:11px;text-align:center">
            TCG Live &mdash; Subastas en vivo en México<br>
            ¿Dudas? Escríbenos a <a href="mailto:tcgsubastas@gmail.com" style="color:${ACCENT}">tcgsubastas@gmail.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;

    if (!smtpHost) {
      this.logger.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? 'TCG Live <tcgsubastas@gmail.com>',
        to,
        subject,
        html,
      });
    } catch (err) {
      this.logger.error(`Error al enviar correo a ${to}: ${err}`);
    }
  }

  async sendOrderConfirmationBuyer(email: string, data: BuyerOrderData): Promise<void> {
    const amountMxn = (data.amount / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    const subject = `Ganaste la subasta de ${data.cardName} — TCG Live`;

    const html = baseHtml(`
      <h2 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:900">¡Ganaste! 🏆</h2>
      <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.6">
        Obtuviste <strong style="color:#a78bfa">${data.cardName}</strong> en la subasta.
        El vendedor preparará tu envío pronto.
      </p>

      <table role="presentation" width="100%" style="background:rgba(108,58,232,0.1);border:1px solid rgba(108,58,232,0.2);border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:16px 20px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Carta ganada</p>
          <p style="margin:0;color:#fff;font-size:16px;font-weight:700">${data.cardName}</p>
        </td></tr>
        <tr><td style="padding:0 20px 16px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Precio final</p>
          <p style="margin:0;color:#a78bfa;font-size:20px;font-weight:900">$${amountMxn} MXN</p>
        </td></tr>
        <tr><td style="padding:0 20px 16px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Vendedor</p>
          <p style="margin:0;color:#fff;font-size:14px;font-weight:600">@${data.sellerName}</p>
        </td></tr>
      </table>

      <p style="margin:0 0 20px;color:#71717a;font-size:12px;line-height:1.6">
        Número de orden: <code style="color:#a78bfa">${data.orderId}</code>
      </p>

      <a href="${process.env.WEB_URL ?? 'https://tcglive.mx'}/mis-pedidos"
         style="display:inline-block;background:linear-gradient(135deg,${ACCENT},#8B5CF6);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:900;font-size:14px">
        Ver mi pedido →
      </a>
    `);

    await this.sendEmail(email, subject, html);
  }

  async sendOrderConfirmationSeller(email: string, data: SellerOrderData): Promise<void> {
    const amountMxn = (data.amount / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    const subject = `Vendiste ${data.cardName} — Prepara el envío`;

    const html = baseHtml(`
      <h2 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:900">¡Nueva venta! 🎉</h2>
      <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.6">
        <strong style="color:#a78bfa">@${data.buyerName}</strong> ganó tu subasta.
        Prepara el envío lo antes posible.
      </p>

      <table role="presentation" width="100%" style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:16px 20px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Carta vendida</p>
          <p style="margin:0;color:#fff;font-size:16px;font-weight:700">${data.cardName}</p>
        </td></tr>
        <tr><td style="padding:0 20px 16px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Precio final</p>
          <p style="margin:0;color:#4ade80;font-size:20px;font-weight:900">$${amountMxn} MXN</p>
        </td></tr>
        <tr><td style="padding:0 20px 16px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Comprador</p>
          <p style="margin:0;color:#fff;font-size:14px;font-weight:600">@${data.buyerName}</p>
        </td></tr>
      </table>

      <p style="margin:0 0 20px;color:#71717a;font-size:12px;line-height:1.6">
        Número de orden: <code style="color:#a78bfa">${data.orderId}</code>
      </p>

      <a href="${process.env.WEB_URL ?? 'https://tcglive.mx'}/mis-ventas"
         style="display:inline-block;background:linear-gradient(135deg,${ACCENT},#8B5CF6);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:900;font-size:14px">
        Ver mis ventas →
      </a>
    `);

    await this.sendEmail(email, subject, html);
  }

  async sendOrderShipped(email: string, data: ShippedData): Promise<void> {
    const subject = `Tu carta está en camino — ${data.cardName}`;

    const html = baseHtml(`
      <h2 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:900">Tu carta está en camino 🚚</h2>
      <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.6">
        El vendedor acaba de marcar tu pedido como enviado.
        Usa el número de guía para rastrear tu paquete.
      </p>

      <table role="presentation" width="100%" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:16px 20px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Carta enviada</p>
          <p style="margin:0;color:#fff;font-size:16px;font-weight:700">${data.cardName}</p>
        </td></tr>
        <tr><td style="padding:0 20px 16px">
          <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px">Número de guía</p>
          <p style="margin:0;color:#60a5fa;font-size:18px;font-weight:900;font-family:monospace">${data.trackingNumber}</p>
        </td></tr>
      </table>

      <p style="margin:0 0 20px;color:#71717a;font-size:12px;line-height:1.6">
        Número de orden: <code style="color:#a78bfa">${data.orderId}</code>
      </p>

      <a href="${process.env.WEB_URL ?? 'https://tcglive.mx'}/mis-pedidos"
         style="display:inline-block;background:linear-gradient(135deg,${ACCENT},#8B5CF6);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:900;font-size:14px">
        Ver mi pedido →
      </a>
    `);

    await this.sendEmail(email, subject, html);
  }
}
