// M-Pesa Daraja API client. Never simulates success: if credentials or MPESA_ENV are not configured,
// it throws MPESA_NOT_CONFIGURED. Only 'sandbox' and 'production' attempt real API calls.
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

const baseUrl = () => (env.mpesaEnv === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');

export const mpesaConfigured = () =>
  ['sandbox', 'production'].includes(env.mpesaEnv)
  && env.mpesaConsumerKey && env.mpesaConsumerSecret && env.mpesaShortcode && env.mpesaPasskey && env.mpesaCallbackUrl;

const notConfigured = () => new ApiError(
  503,
  'MPESA_NOT_CONFIGURED',
  'M-Pesa is not configured. Set MPESA_ENV=sandbox|production with MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY and MPESA_CALLBACK_URL. No money can be taken until this is done.'
);

async function fetchJson(url, { method = 'GET', headers = {}, body, auth } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, json, raw: text };
  } finally {
    clearTimeout(timer);
  }
}

export async function getAccessToken() {
  if (!mpesaConfigured()) throw notConfigured();
  const auth = Buffer.from(`${env.mpesaConsumerKey}:${env.mpesaConsumerSecret}`).toString('base64');
  const { status, json } = await fetchJson(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, { auth: `Basic ${auth}` });
  if (status !== 200 || !json?.access_token) {
    throw new ApiError(502, 'MPESA_UPSTREAM_ERROR', 'Could not authenticate with M-Pesa (Daraja). Please try again later.');
  }
  return json.access_token;
}

export async function stkPush({ phone, amountMajor, accountReference, transactionDesc }) {
  if (!mpesaConfigured()) throw notConfigured();
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const password = Buffer.from(`${env.mpesaShortcode}${env.mpesaPasskey}${timestamp}`).toString('base64');
  const body = {
    BusinessShortCode: env.mpesaShortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: String(Math.round(amountMajor)),
    PartyA: phone,
    PartyB: env.mpesaShortcode,
    PhoneNumber: phone,
    CallBackURL: env.mpesaCallbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc,
  };
  const { status, json } = await fetchJson(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, { method: 'POST', auth: `Bearer ${token}`, body });
  if (status !== 200 || !json?.CheckoutRequestID) {
    throw new ApiError(502, 'MPESA_UPSTREAM_ERROR', json?.errorMessage || json?.ResponseDescription || 'M-Pesa rejected the payment request. Please try again.');
  }
  return { checkoutRequestId: json.CheckoutRequestID, merchantRequestId: json.MerchantRequestID || null, responseDescription: json.ResponseDescription || '' };
}

/** STK Query — official Safaricom endpoint: POST /mpesa/stkpushquery/v1/query
 *  ResultCode semantics: 0 = success, 1032 = cancelled by user, 1037 = unreachable/timeout,
 *  1 = insufficient funds, 9999/timeout-class codes = still processing (treat as pending). */
export async function stkQuery(checkoutRequestId) {
  if (!mpesaConfigured()) throw notConfigured();
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const password = Buffer.from(`${env.mpesaShortcode}${env.mpesaPasskey}${timestamp}`).toString('base64');
  const body = {
    BusinessShortCode: env.mpesaShortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };
  const { status, json, raw } = await fetchJson(`${baseUrl()}/mpesa/stkpushquery/v1/query`, { method: 'POST', auth: `Bearer ${token}`, body });
  if (status !== 200) {
    throw new ApiError(502, 'MPESA_UPSTREAM_ERROR', `STK query failed (HTTP ${status}). ${String(raw).slice(0, 200)}`);
  }
  // Daraja returns both ResponseCode (query accepted) and ResultCode (transaction outcome)
  return {
    responseCode: json?.ResponseCode ?? null,
    resultCode: json?.ResultCode != null ? Number(json.ResultCode) : null,
    resultDesc: json?.ResultDesc || null,
    raw: json,
  };
}
