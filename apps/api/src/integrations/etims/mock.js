// Mock eTIMS provider — DEVELOPMENT FIXTURES ONLY. Every identifier it returns is prefixed MOCK-.
// Never selected unless ETIMS_ENVIRONMENT=mock explicitly. Used by automated tests and local dev.
import { EtimsError } from './provider.js';

export class MockEtimsProvider {
  constructor(env) {
    this.env = env;
    this.kind = 'mock';
  }

  async issueSalesInvoice(invoice) {
    if (!Number.isInteger(invoice?.receiptNumber)) {
      throw new EtimsError('receiptNumber must be an integer', 'ETIMS_BAD_INVOICE', false);
    }
    return {
      receiptNumber: invoice.receiptNumber,
      invoiceNumber: `MOCK-${String(invoice.receiptNumber).padStart(8, '0')}`,
      receiptSignature: `MOCKSIG${invoice.receiptNumber}`,
      internalData: `MOCKINTERNAL${invoice.receiptNumber}`,
      raw: { mock: true, ...invoice },
    };
  }
}
