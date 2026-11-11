// eTIMS provider interface boundary.
// An EtimsProvider issues a sales invoice/receipt for a settled reservation.
// Implementations: 'disabled' (records skip), 'mock' (development fixtures only),
// 'oscu' (KRA Online Sales Control Unit — sandbox/production, requires owner registration + certification).

export class EtimsError extends Error {
  constructor(message, code = 'ETIMS_ERROR', retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

/** @typedef {{ tin: string, branchId: string, deviceSerial: string,
 *   receiptType: 'S', receiptNumber: number, date: string, // DD/MM/YYYY
 *   customerPin?: string|null, customerName?: string|null,
 *   items: Array<{ name: string, quantity: number, unitPrice: number }>, // KES decimals, 2dp
 *   totalExclusive: number, taxAmount: number, totalInclusive: number,
 *   paymentType: '02' | '01' | '03' // 01 cash, 02 bank/mobile, 03 card — see TIS spec
 * }} SalesInvoiceData */

/** @typedef {{ receiptNumber: number, invoiceNumber?: string, receiptSignature?: string, internalData?: string, raw: unknown }} EtimsReceipt */

export {};
