// Shared constants - The Stillhouse. Used by api and (later) web.
export const CURRENCY = 'KES';
export const TIMEZONE = 'Africa/Nairobi';

export const ROLES = Object.freeze({
  GUEST: 'guest',
  RECEPTIONIST: 'receptionist',
  MANAGER: 'manager',
  ADMIN: 'admin',
});

export const RESERVATION_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
});

// Tax policy (see docs/TAX_AND_CHARGES.md; configurable via settings, values below are the approved provisional defaults)
export const TAX_POLICY = Object.freeze({
  serviceChargeRate: 0.10, // excluded from VAT base per VAT Act s.13(7) conditions
  serviceChargeVatExclusive: true,
  tourismLevyRate: 0.02,   // per Tourism Act s.105; excluded from VAT base
  vatRate: 0.16,
  currency: CURRENCY,
});

export const HOLD_TTL_MINUTES = 15;

export const API_ERROR = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ROOM_UNAVAILABLE: 'ROOM_UNAVAILABLE',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  PAYMENT_NOT_CONFIGURED: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
});
