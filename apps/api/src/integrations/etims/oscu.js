// OSCU provider — KRA Online Sales Control Unit (system-to-system) integration boundary.
//
// Wire protocol note: the OSCU specification (available after sandbox registration per the
// KRA step-by-step guide, https://www.kra.go.ke/business/etims…) defines the service methods.
// The initialization call `/selectInitOsdcInfo` is public in the KRA guide and is implemented below.
// The sales-invoice call is INTENTIONALLY NOT GUESSED: it is configured via ETIMS_SALES_INVOICE_PATH
// (e.g. /saveSalesInvoice or whatever the OSCU specification for the registered device type defines).
// Until the owner completes KRA sandbox registration and certification, issuance is refused with
// a precise error — never a fabricated success.
//
// Sandbox:   https://etims-api-sbx.kra.go.ke
// Production: https://etims-api.kra.go.ke
import { EtimsError } from './provider.js';
import { env } from '../../config/env.js';

const TIMEOUT_MS = 10_000;

const post = async (path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.etimsBaseUrl}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, json, raw: text };
  } finally {
    clearTimeout(timer);
  }
};

export class OscUProvider {
  constructor(cfg) {
    this.cfg = cfg;
    this.kind = 'oscu';
  }

  /** One-time device activation. Params per KRA step-by-step guide. */
  async initializeDevice() {
    if (!env.etimsBaseUrl) throw new EtimsError('ETIMS_BASE_URL is not set.', 'ETIMS_NOT_CONFIGURED', false);
    const { status, json, raw } = await post('/selectInitOsdcInfo', {
      tin: this.cfg.tin,
      bhfId: this.cfg.branchId || '00',
      dvcSrlNo: this.cfg.deviceSerial,
    });
    if (status !== 200) {
      throw new EtimsError(`OSCU initialization failed (HTTP ${status}): ${String(raw).slice(0, 300)}`, 'ETIMS_INIT_FAILED', true);
    }
    return json;
  }

  async issueSalesInvoice(invoice) {
    if (!this.cfg.communicationKey) {
      throw new EtimsError(
        'OSCU communication key is not configured (ETIMS_COMMUNICATION_KEY). The owner must activate the OSCU device with KRA first (see docs/ACTIVATION_ETIMS.md).',
        'ETIMS_NOT_CONFIGURED',
        false,
      );
    }
    const path = process.env.ETIMS_SALES_INVOICE_PATH;
    if (!path) {
      throw new EtimsError(
        'Sales-invoice service path is not configured. Set ETIMS_SALES_INVOICE_PATH to the method name from the OSCU specification for your registered device (available after KRA sandbox registration). Nothing has been sent to KRA.',
        'ETIMS_SPEC_REQUIRED',
        false,
      );
    }
    // With initialization done and the spec's method path configured, the wire call happens here.
    const { status, json, raw } = await post(path, {
      tin: this.cfg.tin,
      bhfId: this.cfg.branchId || '00',
      dvcSrlNo: this.cfg.deviceSerial,
      ...invoice,
    });
    if (status !== 200) {
      throw new EtimsError(`OSCU rejected the invoice (HTTP ${status}): ${String(raw).slice(0, 300)}`, 'ETIMS_REJECTED', false);
    }
    return {
      receiptNumber: invoice.receiptNumber,
      invoiceNumber: json?.invoiceNumber || null,
      receiptSignature: json?.rcptSignature || null,
      internalData: json?.intrlData || null,
      raw: json ?? raw,
    };
  }
}
