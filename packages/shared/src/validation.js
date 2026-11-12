// Shared zod schemas (request validation). Server is the source of truth.
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const minorUnits = z.number().int().nonnegative();

export const availabilityQuerySchema = z.object({
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.coerce.number().int().min(1).max(16).default(2),
  children: z.coerce.number().int().min(0).max(8).default(0),
  rooms: z.coerce.number().int().min(1).max(4).default(1),
}).refine((d) => d.checkOut > d.checkIn, { message: 'checkOut must be after checkIn', path: ['checkOut'] });

export const quoteRequestSchema = z.object({
  roomTypeSlug: z.string().min(1),
  ratePlanKey: z.string().min(1),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(16).default(2),
  children: z.number().int().min(0).max(8).default(0),
  rooms: z.number().int().min(1).max(4).default(1),
}).refine((d) => d.checkOut > d.checkIn, { message: 'checkOut must be after checkIn', path: ['checkOut'] });

export const guestSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().regex(/^[+()\d][\d\s().-]{6,}$/, 'Use digits, spaces and an optional leading +'),
  idNumber: z.string().trim().regex(/^\d{5,12}$/, 'National ID is digits only (5-12)'),
  country: z.string().trim().min(1).max(100),
  requests: z.string().trim().max(600).optional().or(z.literal('')),
  privacy: z.literal(true, { errorMap: () => ({ message: 'Privacy consent is required' }) }),
});

export const createReservationSchema = z.object({
  roomTypeSlug: z.string().min(1),
  ratePlanKey: z.string().min(1),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(16),
  children: z.number().int().min(0).max(8).default(0),
  rooms: z.number().int().min(1).max(4).default(1),
  guest: guestSchema,
  source: z.enum(['web', 'admin', 'phone']).default('web'),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = signInSchema.extend({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(40).optional(),
  country: z.string().trim().max(100).default('Kenya'),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  country: z.string().trim().max(100).optional(),
  notes: z.string().max(600).optional(),
});

export const cancelReservationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const reservationStatusPatchSchema = z.object({
  status: z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled']),
  reason: z.string().trim().max(500).optional(),
});

export const roomPatchSchema = z.object({
  status: z.enum(['active', 'out_of_service']).optional(),
  notes: z.string().trim().max(600).optional(),
});

export const ratePatchSchema = z.object({
  nightlyMinor: minorUnits.optional(),
  status: z.enum(['active', 'scheduled', 'inactive']).optional(),
});

export const settingsSchema = z.object({
  hotel: z.object({
    name: z.string().trim().min(1),
    legalName: z.string().trim().min(1),
    location: z.string().trim().min(1),
    rooms: z.number().int().positive(),
    timezone: z.string().trim().min(1),
  }),
  contact: z.object({
    email: z.string().trim().email(),
    phone: z.string().trim().min(5),
    website: z.string().trim().min(3),
  }),
  policies: z.object({
    checkIn: z.string().regex(/^\d{2}:\d{2}$/),
    checkOut: z.string().regex(/^\d{2}:\d{2}$/),
    cancellation: z.string().trim().min(1),
    children: z.string().trim().min(1),
  }),
  booking: z.object({
    minNights: z.number().int().min(1),
    maxNights: z.number().int().min(1),
    maxRoomsPerBooking: z.number().int().min(1).max(10),
    advancePurchaseDays: z.number().int().min(0),
    acceptEnquiriesOnly: z.boolean(),
  }),
}).strict();

export const initiatePaymentSchema = z.object({
  reservationReference: z.string().trim().min(1),
  phone: z.string().trim().regex(/^\d{9,15}$/).optional(), // 2547XXXXXXXX form; required when provider=mpesa
  email: z.string().trim().toLowerCase().email().optional(), // required when not signed in (owns the reservation)
});

export const recordDeskPaymentSchema = z.object({
  reservationReference: z.string().trim().min(1),
  amountMinor: minorUnits,
  method: z.enum(['cash', 'card', 'bank_transfer', 'other']).default('cash'),
  note: z.string().trim().max(500).optional(),
});

export const enquirySchema = z.object({
  kind: z.enum(['experience', 'dining']),
  subject: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  date: isoDate.optional(),
  guests: z.number().int().min(1).max(50).default(2),
  message: z.string().trim().min(1).max(2000),
});

export const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
