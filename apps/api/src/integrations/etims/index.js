// eTIMS orchestration: resolves the configured provider and issues/records sales invoices
// for settled reservations. Invoices are DB-tracked; issuance happens AFTER reservation commit.
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { MockEtimsProvider } from './mock.js';
import { OscUProvider } from './oscu.js';
import { EtimsError } from './provider.js';

export const getEtimsProvider = () => {
  switch (env.etimsEnvironment) {
    case 'mock':
      return new MockEtimsProvider(env);
    case 'sandbox':
    case 'production':
      if (!env.etimsBaseUrl || !env.etimsTin) {
        throw new EtimsError('ETIMS_BASE_URL and ETIMS_TIN must be set for OSCU mode.', 'ETIMS_NOT_CONFIGURED', false);
      }
      return new OscUProvider({ tin: env.etimsTin, branchId: env.etimsBranchId, deviceSerial: env.etimsDeviceSerial, communicationKey: env.etimsCommunicationKey });
    default:
      return null; // disabled — nothing is issued, invoices recorded as skipped
  }
};

const formatDateDDMMYYYY = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

const nextReceiptNumber = async (tx) => {
  const last = await tx.taxInvoice.findFirst({ where: { receiptNumber: { not: null } }, orderBy: { receiptNumber: 'desc' } });
  return (last?.receiptNumber ?? 0) + 1;
};

/**
 * Create (or reuse) the tax invoice row for a reservation and attempt issuance.
 * Never throws — failures are persisted for the retry sweeper.
 */
export async function issueTaxInvoiceSafe({ reservation }) {
  try {
    const provider = getEtimsProvider();

    const existing = await prisma.taxInvoice.findUnique({ where: { reservationId: reservation.id } });
    if (existing?.status === 'issued') return { status: 'issued', already: true };

    const invoice = existing ?? await prisma.taxInvoice.create({
      data: {
        reservationId: reservation.id,
        status: 'pending',
        totalMinor: reservation.totalMinor,
        taxMinor: reservation.vatMinor,
        currency: reservation.currency,
      },
    });

    if (!provider) {
      await prisma.taxInvoice.update({ where: { id: invoice.id }, data: { status: 'skipped', lastError: 'ETIMS_DISABLED' } });
      logger.info({ reservationId: reservation.id }, 'tax invoice skipped (eTIMS not configured)');
      return { status: 'skipped' };
    }

    const receiptNumber = await prisma.$transaction(async (tx) => nextReceiptNumber(tx));
    const customerName = [reservation.guest?.firstName, reservation.guest?.lastName].filter(Boolean).join(' ') || 'Retail customer';

    const payload = {
      tin: env.etimsTin || 'MOCK',
      branchId: env.etimsBranchId || '00',
      deviceSerial: env.etimsDeviceSerial || 'MOCK',
      receiptType: 'S',
      receiptNumber,
      date: formatDateDDMMYYYY(new Date()),
      customerPin: null,
      customerName,
      items: [
        {
          name: `Accommodation — ${reservation.nights} night(s)`,
          quantity: reservation.rooms,
          unitPrice: Number(reservation.nightlyMinor) / 100,
        },
        { name: 'Service charge & tourism levy', quantity: 1, unitPrice: (reservation.serviceChargeMinor + reservation.tourismLevyMinor) / 100 },
      ],
      totalExclusive: Number(reservation.subtotalMinor) / 100,
      taxAmount: Number(reservation.vatMinor) / 100,
      totalInclusive: Number(reservation.totalMinor) / 100,
      paymentType: reservation.payments?.[0]?.provider === 'mpesa' ? '02' : '01',
    };

    try {
      const receipt = await provider.issueSalesInvoice(payload);
      await prisma.taxInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'issued',
          receiptNumber,
          etimsInvoiceNumber: receipt.invoiceNumber ?? null,
          etimsReceiptSignature: receipt.receiptSignature ?? null,
          etimsInternalData: receipt.internalData ?? null,
          etimsResponseRaw: receipt.raw ?? undefined,
          attempts: invoice.attempts + 1,
          lastError: null,
          issuedAt: new Date(),
        },
      });
      logger.info({ reservationId: reservation.id, receiptNumber }, 'tax invoice issued');
      return { status: 'issued', receiptNumber };
    } catch (err) {
      const attempts = invoice.attempts + 1;
      await prisma.taxInvoice.update({
        where: { id: invoice.id },
        data: { status: 'failed', attempts, lastError: String(err?.message || err).slice(0, 500), receiptNumber },
      });
      logger.warn({ reservationId: reservation.id, attempts, err: String(err?.message || err) }, 'tax invoice issuance failed');
      return { status: 'failed', error: String(err?.message || err) };
    }
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'tax invoice pipeline failure');
    return { status: 'error', error: 'tax_invoice_pipeline_failure' };
  }
}

/** Retry failed invoices (up to 5 attempts total each). Called by the sweeper when eTIMS is enabled. */
export async function retryFailedInvoices(limit = 10) {
  if (env.etimsEnvironment === 'disabled') return { retried: 0, skipped: true };
  const failed = await prisma.taxInvoice.findMany({
    where: { status: 'failed', attempts: { lt: 5 } },
    include: { reservation: { include: { guest: true, payments: true } } },
    take: limit,
  });
  let retried = 0;
  for (const inv of failed) {
    if (!inv.reservation) continue;
    await issueTaxInvoiceSafe({ reservation: inv.reservation });
    retried += 1;
  }
  return { retried };
}
