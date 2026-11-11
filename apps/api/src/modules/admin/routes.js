// Administration module - staff-only. RBAC enforced server-side on every route.
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireRole, validate } from '../../middleware/index.js';
import { reservationStatusPatchSchema, roomPatchSchema, ratePatchSchema, settingsSchema } from '@stillhouse/shared';
import { badRequest, notFound, conflict, forbidden } from '../../lib/errors.js';
import { releaseAllocations } from '../../lib/allocations.js';
import { audit } from '../../lib/audit.js';
import { toListItem } from '../reservations/routes.js';

export const adminRouter = Router();

const STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked-in', checked_out: 'Checked-out', cancelled: 'Cancelled', expired: 'Expired' };
const LABEL_TO_RAW = Object.fromEntries(Object.entries(STATUS_LABEL).map(([k, v]) => [v.toLowerCase(), k]));

const todayISO = () => new Date().toISOString().slice(0, 10);
const major = (minor) => Math.round((minor || 0) / 100);
const roomNumbersOf = (r) => r.roomsAssigned?.map((rr) => rr.room.number) || [];

// ---------- Dashboard ----------
adminRouter.get('/admin/dashboard', requireRole('receptionist', 'manager', 'admin'), async (_req, res, next) => {
  try {
    const today = new Date(`${todayISO()}T00:00:00.000Z`);
    const [reservations, rooms, types] = await Promise.all([
      prisma.reservation.findMany({
        where: { status: { notIn: ['cancelled', 'expired'] } },
        include: { guest: true, roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } } },
        orderBy: { checkIn: 'asc' },
      }),
      prisma.room.findMany({ include: { roomType: true } }),
      prisma.roomType.findMany({ orderBy: { slug: 'asc' } }),
    ]);

    const active = reservations.filter((r) => !['cancelled'].includes(r.status));
    const arrivals = reservations.filter((r) => r.checkIn.toISOString().slice(0, 10) === todayISO() && ['confirmed', 'pending'].includes(r.status));
    const departures = reservations.filter((r) => r.checkOut.toISOString().slice(0, 10) === todayISO() && ['confirmed', 'checked_in'].includes(r.status));
    const inHouse = reservations.filter((r) => r.status === 'checked_in').length;
    const sellable = rooms.filter((r) => r.status !== 'out_of_service').length;
    const occupancy = sellable > 0 ? Math.round((inHouse / sellable) * 100) : 0;
    const revenueMinor = reservations
      .filter((r) => ['confirmed', 'checked_in', 'checked_out'].includes(r.status))
      .reduce((sum, r) => sum + r.totalMinor, 0);

    const occupiedTodayRows = await prisma.$queryRaw`
      SELECT DISTINCT ra.room_id FROM room_allocation ra
      WHERE ra.state = 'occupying' AND ra.kind = 'reservation'
        AND ra.check_in <= ${todayISO()}::date AND ra.check_out > ${todayISO()}::date`;
    const occupiedRoomIds = new Set(occupiedTodayRows.map((r) => String(r.room_id)));

    const byType = types.map((t) => {
      const units = rooms.filter((r) => r.roomTypeId === t.id);
      const occupied = units.filter((r) => occupiedRoomIds.has(String(r.id))).length;
      const outOfService = units.filter((r) => r.status === 'out_of_service').length;
      return { slug: t.slug, name: t.name, total: units.length, occupied, ready: units.length - outOfService - occupied, outOfService };
    });

    const recent = [...reservations]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6)
      .map((r) => toListItem(r, roomNumbersOf(r)));

    res.json({
      totalReservations: active.length,
      arrivals: arrivals.map((r) => toListItem(r, roomNumbersOf(r))),
      departures: departures.map((r) => toListItem(r, roomNumbersOf(r))),
      arrivalsCount: arrivals.length,
      departuresCount: departures.length,
      inHouse,
      sellable,
      occupancy,
      revenue: major(revenueMinor),
      revenueMinor,
      recent,
      byType,
    });
  } catch (err) { next(err); }
});

// ---------- Reservations ----------
adminRouter.get('/admin/reservations', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const statusRaw = String(req.query.status || '').trim().toLowerCase();
    const roomTypeSlug = String(req.query.roomType || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

    const where = {};
    if (statusRaw && STATUS_LABEL[statusRaw]) where.status = statusRaw;
    else if (statusRaw && LABEL_TO_RAW[statusRaw]) where.status = LABEL_TO_RAW[statusRaw];
    if (roomTypeSlug) where.roomType = { slug: roomTypeSlug };
    if (q) {
      where.OR = [
        { reference: { contains: q, mode: 'insensitive' } },
        { guest: { email: { contains: q, mode: 'insensitive' } } },
        { guest: { firstName: { contains: q, mode: 'insensitive' } } },
        { guest: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.findMany({
        where,
        include: { guest: true, roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } } },
        orderBy: { checkIn: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ total, page, pageSize, rows: rows.map((r) => toListItem(r, roomNumbersOf(r))) });
  } catch (err) { next(err); }
});

adminRouter.get('/admin/reservations/:reference', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const r = await prisma.reservation.findUnique({
      where: { reference: req.params.reference },
      include: { guest: true, roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } }, payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!r) throw notFound('Reservation not found.');
    res.json({ ...toListItem(r, roomNumbersOf(r)), payments: r.payments.map((p) => ({ id: p.id, provider: p.provider, amountMinor: p.amountMinor, status: p.status, capturedAt: p.capturedAt, providerReference: p.providerReference })) });
  } catch (err) { next(err); }
});

const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  expired: [],
};

adminRouter.patch('/admin/reservations/:reference', requireRole('receptionist', 'manager', 'admin'), validate(reservationStatusPatchSchema), async (req, res, next) => {
  try {
    const target = req.validatedBody.status;
    if ((target === 'cancelled') && !['manager', 'admin', 'receptionist'].some((r) => req.auth.roles.includes(r))) {
      throw forbidden();
    }
    const r = await prisma.reservation.findUnique({
      where: { reference: req.params.reference },
      include: { ratePlan: true, roomsAssigned: { include: { room: true } } },
    });
    if (!r) throw notFound('Reservation not found.');
    const allowed = TRANSITIONS[r.status] || [];
    if (!allowed.includes(target)) {
      throw conflict(`Invalid transition: ${r.status} → ${target}. Allowed from ${r.status}: ${allowed.join(', ') || 'none'}.`);
    }
    const now = new Date();
    const data = { status: target, updatedAt: now };
    if (target === 'checked_in') data.checkedInAt = now;
    if (target === 'checked_out') data.checkedOutAt = now;
    if (target === 'cancelled') {
      data.cancelledAt = now;
      data.cancellationReason = req.validatedBody.reason || 'Cancelled by front desk';
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.reservation.update({ where: { id: r.id }, data });
      if (target === 'cancelled') {
        await releaseAllocations(tx, { sourceType: 'reservation', sourceId: r.id, state: 'released' });
      }
      await audit(tx, { actorUserId: req.auth.user.id, action: `reservation.${target}`, entity: 'reservation', entityId: r.id, before: { status: r.status }, after: { status: target, reason: req.validatedBody.reason || null }, ip: req.ip });
      return u;
    });
    res.json(toListItem({ ...r, ...updated }, roomNumbersOf(r)));
  } catch (err) { next(err); }
});

// ---------- Rooms & maintenance ----------
adminRouter.get('/admin/rooms', requireRole('receptionist', 'manager', 'admin'), async (_req, res, next) => {
  try {
    const [rooms, todayBlocks] = await Promise.all([
      prisma.room.findMany({ include: { roomType: true }, orderBy: [{ roomType: { slug: 'asc' } }, { number: 'asc' }] }),
      prisma.roomAllocation.findMany({
        where: { state: 'occupying', kind: 'reservation', checkIn: { lte: new Date(`${todayISO()}T00:00:00.000Z`) }, checkOut: { gt: new Date(`${todayISO()}T00:00:00.000Z`) } },
        select: { roomId: true },
      }),
    ]);
    const occupiedToday = new Set(todayBlocks.map((b) => String(b.roomId)));
    const units = rooms.map((r) => ({
      number: r.number,
      roomSlug: r.roomType.slug,
      roomName: r.roomType.name,
      floor: r.floor,
      status: r.status === 'out_of_service' ? 'Out of service' : occupiedToday.has(String(r.id)) ? 'Occupied' : 'Vacant clean',
      maintenance: r.status === 'out_of_service' ? (r.notes || '') : '',
      capacity: r.roomType.maxAdults,
    }));
    res.json(units);
  } catch (err) { next(err); }
});

adminRouter.patch('/admin/rooms/:number', requireRole('receptionist', 'manager', 'admin'), validate(roomPatchSchema), async (req, res, next) => {
  try {
    const room = await prisma.room.findFirst({ where: { number: req.params.number }, include: { roomType: true } });
    if (!room) throw notFound('Room not found.');
    const { status, notes } = req.validatedBody;
    if (!status && notes === undefined) throw badRequest('Nothing to update.');
    const updated = await prisma.$transaction(async (tx) => {
      let u = room;
      if (status && status !== room.status) {
        if (status === 'out_of_service') {
          u = await tx.room.update({ where: { id: room.id }, data: { status: 'out_of_service', notes: notes ?? room.notes ?? 'Out of service' } });
          // Confine the room for ~1 year; admin can clear it later.
          const block = await tx.inventoryBlock.create({
            data: { roomId: room.id, roomTypeId: room.roomTypeId, checkIn: new Date(`${todayISO()}T00:00:00.000Z`), checkOut: new Date(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) + 'T00:00:00.000Z'), kind: 'maintenance', reason: notes || 'Out of service', createdByUserId: req.auth.user.id },
          });
          await tx.roomAllocation.create({
            data: { roomId: room.id, checkIn: block.checkIn, checkOut: block.checkOut, kind: 'block', state: 'occupying', sourceType: 'inventory_block', sourceId: block.id },
          });
        } else {
          // Clearing back to active: release all future occupying maintenance allocations for this room
          const blocks = await tx.roomAllocation.findMany({ where: { roomId: room.id, kind: 'block', state: 'occupying', checkOut: { gte: new Date(`${todayISO()}T00:00:00.000Z`) } } });
          for (const b of blocks) {
            await tx.roomAllocation.update({ where: { id: b.id }, data: { state: 'released' } });
          }
          u = await tx.room.update({ where: { id: room.id }, data: { status: 'active', notes: '' } });
        }
      } else if (notes !== undefined) {
        u = await tx.room.update({ where: { id: room.id }, data: { notes } });
      }
      await audit(tx, { actorUserId: req.auth.user.id, action: 'room.updated', entity: 'room', entityId: room.number, before: { status: room.status, notes: room.notes }, after: { status: u.status, notes: u.notes }, ip: req.ip });
      return u;
    });
    res.json({ number: updated.number, roomSlug: room.roomType.slug, status: updated.status === 'out_of_service' ? 'Out of service' : 'Vacant clean', maintenance: updated.notes || '' });
  } catch (err) { next(err); }
});

// ---------- Guests ----------
adminRouter.get('/admin/guests', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const where = q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {};
    const guests = await prisma.guest.findMany({
      where,
      include: {
        reservations: {
          include: { roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } } },
          orderBy: { checkIn: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(guests.map((g) => ({
      id: String(g.id),
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email,
      phone: g.phone,
      country: g.country,
      notes: g.notes || '',
      createdAt: g.createdAt.toISOString(),
      totalStays: g.reservations.filter((r) => ['confirmed', 'checked_in', 'checked_out'].includes(r.status)).length,
      memberSince: g.createdAt.toISOString(),
      reservations: g.reservations.map((r) => toListItem(r, roomNumbersOf(r))),
    })));
  } catch (err) { next(err); }
});

adminRouter.get('/admin/guests/:id', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('Invalid guest id.');
    const guest = await prisma.guest.findUnique({
      where: { id },
      include: { reservations: { include: { roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } } }, orderBy: { checkIn: 'desc' } } },
    });
    if (!guest) throw notFound('Guest not found.');
    res.json({ ...guest, id: String(guest.id), reservations: guest.reservations.map((r) => toListItem(r, roomNumbersOf(r))) });
  } catch (err) { next(err); }
});

// ---------- Rates ----------
const STATUS_OUT = { active: 'Active', scheduled: 'Scheduled', inactive: 'Paused' };
const STATUS_IN = Object.fromEntries(Object.entries(STATUS_OUT).map(([k, v]) => [v.toLowerCase(), k]));

adminRouter.get('/admin/rates', requireRole('manager', 'admin'), async (_req, res, next) => {
  try {
    const cards = await prisma.rateCard.findMany({
      include: { roomType: true, ratePlan: true },
      orderBy: [{ roomType: { slug: 'asc' } }, { ratePlan: { sortOrder: 'asc' } }, { validFrom: 'asc' }],
    });
    res.json(cards.map((c) => ({
      id: String(c.id),
      roomSlug: c.roomType.slug,
      roomName: c.roomType.name,
      planId: c.ratePlan.key,
      planName: c.ratePlan.name,
      season: c.season,
      nightly: major(c.nightlyMinor),
      nightlyMinor: c.nightlyMinor,
      from: c.validFrom.toISOString().slice(0, 10),
      to: c.validTo.toISOString().slice(0, 10),
      status: STATUS_OUT[c.status] || c.status,
    })));
  } catch (err) { next(err); }
});

adminRouter.patch('/admin/rates/:id', requireRole('manager', 'admin'), validate(ratePatchSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('Invalid rate id.');
    const card = await prisma.rateCard.findUnique({ where: { id }, include: { roomType: true, ratePlan: true } });
    if (!card) throw notFound('Rate not found.');
    const data = {};
    if (req.validatedBody.nightlyMinor != null) data.nightlyMinor = req.validatedBody.nightlyMinor;
    if (req.validatedBody.status) data.status = req.validatedBody.status;
    if (Object.keys(data).length === 0) throw badRequest('Nothing to update.');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.rateCard.update({ where: { id }, data });
      await audit(tx, { actorUserId: req.auth.user.id, action: 'rate.updated', entity: 'rate_card', entityId: id, before: { nightlyMinor: card.nightlyMinor, status: card.status }, after: data, ip: req.ip });
      return u;
    });
    res.json({ id: String(updated.id), nightly: major(updated.nightlyMinor), status: STATUS_OUT[updated.status] || updated.status });
  } catch (err) { next(err); }
});

// ---------- Reports ----------
adminRouter.get('/admin/reports/occupancy', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const sellable = await prisma.room.count({ where: { status: 'active' } });
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const start = since.toISOString().slice(0, 10);

    const allocations = await prisma.roomAllocation.findMany({
      where: { state: 'occupying', kind: 'reservation', checkOut: { gt: new Date(`${start}T00:00:00.000Z`) } },
      select: { roomId: true, checkIn: true, checkOut: true },
    });

    const series = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const occupied = allocations.filter((a) => a.checkIn.toISOString().slice(0, 10) <= iso && a.checkOut.toISOString().slice(0, 10) > iso).length;
      series.push({ date: iso, value: sellable > 0 ? Math.round((occupied / sellable) * 100) : 0 });
    }
    res.json(series);
  } catch (err) { next(err); }
});

adminRouter.get('/admin/reports/monthly', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const months = Math.min(12, Math.max(1, Number(req.query.months) || 6));
    const rows = await prisma.$queryRaw`
      SELECT date_trunc('month', r."checkIn") AS month,
             rt.slug AS slug,
             COUNT(r.id)::int AS reservations,
             SUM(r."totalMinor")::bigint AS revenue_minor
      FROM reservation r
      JOIN room_type rt ON rt.id = r."roomTypeId"
      WHERE r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r."checkIn" >= (date_trunc('month', now()) - (interval '1 month' * ${months - 1}))
      GROUP BY 1, 2
      ORDER BY 1 ASC`;
    const byMonth = new Map();
    for (const row of rows) {
      const key = new Date(row.month).toISOString().slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, { month: new Date(row.month).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), reservations: 0, garden: 0, valley: 0, signature: 0 });
      const bucket = byMonth.get(key);
      bucket.reservations += row.reservations;
      const revKes = Math.round(Number(row.revenue_minor) / 100);
      const short = row.slug.split('-')[0]; // garden | valley | signature
      bucket[short] = (bucket[short] || 0) + revKes;
    }
    res.json([...byMonth.values()]);
  } catch (err) { next(err); }
});

// ---------- Settings ----------
adminRouter.get('/admin/settings', requireRole('manager', 'admin'), async (_req, res, next) => {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'admin.settings' } });
    if (s) return res.json(s.value);
    res.json(null);
  } catch (err) { next(err); }
});

adminRouter.put('/admin/settings', requireRole('manager', 'admin'), validate(settingsSchema), async (req, res, next) => {
  try {
    const before = await prisma.setting.findUnique({ where: { key: 'admin.settings' } });
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.setting.upsert({
        where: { key: 'admin.settings' },
        create: { key: 'admin.settings', value: req.validatedBody, updatedByUserId: req.auth.user.id },
        update: { value: req.validatedBody, updatedByUserId: req.auth.user.id },
      });
      await audit(tx, { actorUserId: req.auth.user.id, action: 'settings.updated', entity: 'setting', entityId: 'admin.settings', before: before?.value ?? null, after: req.validatedBody, ip: req.ip });
      return u;
    });
    res.json(updated.value);
  } catch (err) { next(err); }
});

// ---------- Payments reconciliation (for daily settlement) ----------
adminRouter.get('/admin/reports/reconciliation', requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : new Date();
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw badRequest('Invalid from/to date range.');
    }
    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { reservation: { select: { reference: true, checkIn: true, guest: { select: { firstName: true, lastName: true, email: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const totals = payments.reduce((acc, p) => {
      acc.count += 1;
      if (p.status === 'succeeded') acc.succeededMinor += p.amountMinor;
      else if (p.status === 'failed') acc.failed += 1;
      else if (p.status === 'pending') acc.pending += 1;
      else if (p.status === 'refunded' || p.status === 'partially_refunded') acc.refunded += 1;
      return acc;
    }, { count: 0, succeededMinor: 0, failed: 0, pending: 0, refunded: 0 });
    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      totals,
      payments: payments.map((p) => ({
        id: p.id,
        date: p.createdAt.toISOString(),
        reference: p.reservation?.reference,
        guest: p.reservation?.guest ? `${p.reservation.guest.firstName} ${p.reservation.guest.lastName}` : undefined,
        provider: p.provider,
        providerReference: p.providerReference,
        amountMinor: p.amountMinor,
        status: p.status,
        capturedAt: p.capturedAt,
      })),
    });
  } catch (err) { next(err); }
});

// ---------- Audit log ----------
adminRouter.get('/admin/audit-log', requireRole('admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const entity = req.query.entity ? String(req.query.entity) : undefined;
    const where = entity ? { entity } : {};
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, include: { actor: { select: { email: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ total, page, pageSize, rows });
  } catch (err) { next(err); }
});
