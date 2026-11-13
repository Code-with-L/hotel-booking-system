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

const STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked-in', checked_out: 'Checked-out', cancelled: 'Cancelled', expired: 'Expired', needs_allocation: 'Needs allocation' };
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
    const pending = reservations.filter((r) => r.status === 'pending');
    const confirmed = reservations.filter((r) => r.status === 'confirmed');

    const arrivals = reservations.filter((r) => r.checkIn.toISOString().slice(0, 10) === todayISO() && ['confirmed', 'pending'].includes(r.status));
    const departures = reservations.filter((r) => r.checkOut.toISOString().slice(0, 10) === todayISO() && ['confirmed', 'checked_in'].includes(r.status));
    const inHouse = reservations.filter((r) => r.status === 'checked_in').length;
    const sellable = rooms.filter((r) => r.status !== 'out_of_service').length;
    const occupancy = sellable > 0 ? Math.round((inHouse / sellable) * 100) : 0;
    const revenueMinor = reservations
      .filter((r) => ['confirmed', 'checked_in', 'checked_out'].includes(r.status))
      .reduce((sum, r) => sum + r.totalMinor, 0);

    // Operational counts: pending action, cancellations (recent 30d), payment overview
    const since30 = new Date(Date.now() - 30 * 86400000);
    const [cancelled30, payments, outstandingRows] = await Promise.all([
      prisma.reservation.count({ where: { status: 'cancelled', cancelledAt: { gte: since30 } } }),
      prisma.payment.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountMinor: true } }),
      prisma.$queryRaw`
        SELECT COALESCE(SUM(GREATEST(r."totalMinor" - COALESCE(p.paid, 0), 0)), 0)::bigint AS outstanding_minor
        FROM reservation r
        LEFT JOIN (SELECT "reservationId", SUM("amountMinor") AS paid FROM payment WHERE status = 'succeeded' GROUP BY "reservationId") p ON p."reservationId" = r.id
        WHERE r.status IN ('confirmed', 'checked_in', 'checked_out')`,
    ]);
    const paymentSummary = Object.fromEntries(payments.map((p) => [p.status, { count: p._count._all, amountMinor: p._sum.amountMinor || 0 }]));
    const outstandingMinor = Number(outstandingRows[0]?.outstanding_minor ?? 0);

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
      pendingCount: pending.length,
      confirmedCount: confirmed.length,
      cancelledLast30Days: cancelled30,
      outstandingMinor,
      outstanding: major(outstandingMinor),
      paymentSummary,
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
    // Attach succeeded-payment totals per reservation for the payments column
    const ids = rows.map((r) => r.id);
    const paid = ids.length
      ? await prisma.payment.groupBy({ by: ['reservationId'], where: { reservationId: { in: ids }, status: 'succeeded' }, _sum: { amountMinor: true } })
      : [];
    const paidMap = new Map(paid.map((p) => [p.reservationId, p._sum.amountMinor || 0]));
    res.json({ total, page, pageSize, rows: rows.map((r) => toListItem(r, roomNumbersOf(r), paidMap.get(r.id) ?? 0)) });
  } catch (err) { next(err); }
});

adminRouter.get('/admin/reservations/:reference', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const r = await prisma.reservation.findUnique({
      where: { reference: req.params.reference },
      include: { guest: true, roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } }, payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!r) throw notFound('Reservation not found.');
    res.json({
      ...toListItem(r, roomNumbersOf(r)),
      breakdown: {
        nightlyMinor: r.nightlyMinor,
        subtotalMinor: r.subtotalMinor,
        serviceChargeMinor: r.serviceChargeMinor,
        tourismLevyMinor: r.tourismLevyMinor,
        vatMinor: r.vatMinor,
        totalMinor: r.totalMinor,
        taxesAndFeesMinor: r.serviceChargeMinor + r.tourismLevyMinor + r.vatMinor,
        cancelFeeMinor: r.cancelFeeMinor ?? 0,
        currency: r.currency,
      },
      payments: r.payments.map((p) => ({ id: p.id, provider: p.provider, amountMinor: p.amountMinor, status: p.status, capturedAt: p.capturedAt, providerReference: p.providerReference })),
    });
  } catch (err) { next(err); }
});

// M10 Phase 0 (P0-04): pending→confirmed no longer exists. Desk settlement goes through
// POST /admin/reservations/:reference/settle (receptionist+), which enforces exact-balance collection.
const TRANSITIONS = {
  pending: ['cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  expired: [],
  needs_allocation: ['cancelled'],
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
      if (r.status === 'pending' && target === 'confirmed') {
        throw conflict('Use the settlement endpoint: POST /api/v1/admin/reservations/:reference/settle. Desk settlement records the payment, then confirms — a status flip alone no longer does this.', );
      }
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

    // Compare-and-swap: only the request whose expected status still holds may move the reservation
    const updated = await prisma.$transaction(async (tx) => {
      const moved = await tx.reservation.updateMany({ where: { id: r.id, status: r.status }, data });
      if (moved.count !== 1) throw conflict('Another staff member changed this reservation first. Refresh and try again.');
      const u = await tx.reservation.findUnique({ where: { id: r.id } });
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

    // Hard guard: a room with active (pending/confirmed/checked-in) reservations may NOT go out of service
    // until those reservations are resolved. No overrides.
    if (status === 'out_of_service' && room.status !== 'out_of_service') {
      const today = new Date(`${todayISO()}T00:00:00.000Z`);
      const occupied = await prisma.roomAllocation.findMany({
        where: { roomId: room.id, state: 'occupying', kind: { in: ['hold', 'reservation'] }, checkOut: { gt: today } },
        select: { sourceId: true },
      });
      const ids = [...new Set(occupied.map((a) => Number(a.sourceId)))];
      if (ids.length) {
        const overlapping = await prisma.reservation.findMany({
          where: { id: { in: ids }, status: { in: ['pending', 'confirmed', 'checked_in'] } },
          select: { reference: true },
        });
        if (overlapping.length) {
          throw conflict(
            `Room ${room.number} has ${overlapping.length} active reservation(s) overlapping the maintenance window: ${overlapping.map((r) => r.reference).join(', ')}. ` +
            'Complete, cancel or relocate those stays first. There is no override.'
          );
        }
      }
    }

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

// ---------- Room allocation history ----------
adminRouter.get('/admin/rooms/:number/history', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const room = await prisma.room.findFirst({ where: { number: req.params.number }, include: { roomType: true } });
    if (!room) throw notFound('Room not found.');
    const rows = await prisma.$queryRaw`
      SELECT a.check_in, a.check_out, a.kind, a.state, a.expires_at, a.created_at,
             r.reference, r.status AS reservation_status, r."totalMinor",
             g."firstName", g."lastName"
      FROM room_allocation a
      LEFT JOIN reservation r ON a.source_type = 'reservation' AND a.source_id = r.id
      LEFT JOIN guest g ON g.id = r."guestId"
      WHERE a.room_id = ${room.id}::bigint
      ORDER BY a.created_at DESC
      LIMIT 50`;
    res.json({
      room: { number: room.number, roomSlug: room.roomType.slug, roomName: room.roomType.name },
      history: rows.map((r) => ({
        checkIn: r.check_in instanceof Date ? r.check_in.toISOString().slice(0, 10) : String(r.check_in),
        checkOut: r.check_out instanceof Date ? r.check_out.toISOString().slice(0, 10) : String(r.check_out),
        kind: r.kind,
        state: r.state,
        expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : null,
        reference: r.reference ?? null,
        reservationStatus: r.reservation_status ?? null,
        guestName: r.firstName ? `${r.firstName} ${r.lastName}`.trim() : null,
        totalMinor: r.totalMinor ?? null,
      })),
    });
  } catch (err) { next(err); }
});

// ---------- Guest operational notes ----------
adminRouter.patch('/admin/guests/:id', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('Invalid guest id.');
    const notes = String(req.body?.notes ?? '').trim();
    if (notes.length > 800) throw badRequest('Notes must be 800 characters or fewer.');
    const guest = await prisma.guest.findUnique({ where: { id } });
    if (!guest) throw notFound('Guest not found.');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.guest.update({ where: { id }, data: { notes: notes || null } });
      await audit(tx, { actorUserId: req.auth.user.id, action: 'guest.notes_updated', entity: 'guest', entityId: id, before: { notes: guest.notes }, after: { notes: u.notes }, ip: req.ip });
      return u;
    });
    res.json({ id: String(updated.id), notes: updated.notes || '' });
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

// ---------- Financial overview (manager/admin only) ----------
adminRouter.get('/admin/reports/financial-summary', requireRole('manager', 'admin'), async (_req, res, next) => {
  try {
    const [paymentAgg, refundAgg, feesAgg, outstandingReservations, recentPayments] = await Promise.all([
      prisma.payment.groupBy({ by: ['status'], _sum: { amountMinor: true }, _count: { _all: true } }),
      prisma.paymentAttempt.aggregate({ where: { status: 'refunded' }, _sum: { amountMinor: true }, _count: { _all: true } }),
      prisma.reservation.aggregate({ where: { status: 'cancelled' }, _sum: { cancelFeeMinor: true }, _count: { _all: true } }),
      prisma.$queryRaw`
        SELECT r.reference, r."guestId", r.status, r."checkIn", r."totalMinor",
               COALESCE(p.paid, 0)::bigint AS paid_minor
        FROM reservation r
        LEFT JOIN (SELECT "reservationId", SUM("amountMinor") AS paid FROM payment WHERE status = 'succeeded' GROUP BY "reservationId") p ON p."reservationId" = r.id
        WHERE r.status IN ('confirmed', 'checked_in', 'checked_out')
          AND GREATEST(r."totalMinor" - COALESCE(p.paid, 0), 0) > 0
        ORDER BY r."checkIn" ASC
        LIMIT 25`,
      prisma.payment.findMany({
        include: { reservation: { select: { reference: true, guest: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const byStatus = Object.fromEntries(paymentAgg.map((p) => [p.status, { count: p._count._all, amountMinor: p._sum.amountMinor || 0 }]));
    const collectedMinor = (byStatus.succeeded?.amountMinor) || 0;
    const outstandingAgg = await prisma.$queryRaw`
      SELECT COALESCE(SUM(GREATEST(r."totalMinor" - COALESCE(p.paid, 0), 0)), 0)::bigint AS outstanding_minor
      FROM reservation r
      LEFT JOIN (SELECT "reservationId", SUM("amountMinor") AS paid FROM payment WHERE status = 'succeeded' GROUP BY "reservationId") p ON p."reservationId" = r.id
      WHERE r.status IN ('confirmed', 'checked_in', 'checked_out')`;
    const outstandingMinor = Number(outstandingAgg[0]?.outstanding_minor ?? 0);

    // Enrich outstanding list with guest names
    const guestIds = [...new Set(outstandingReservations.map((r) => r.guestId))];
    const guests = guestIds.length
      ? await prisma.guest.findMany({ where: { id: { in: guestIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const guestMap = new Map(guests.map((g) => [g.id, g]));

    res.json({
      currency: 'KES',
      collected: Math.round(collectedMinor / 100),
      collectedMinor,
      succeededCount: byStatus.succeeded?.count || 0,
      pendingMinor: byStatus.pending?.amountMinor || 0,
      pendingCount: byStatus.pending?.count || 0,
      failedCount: byStatus.failed?.count || 0,
      refunds: Math.round((refundAgg._sum.amountMinor || 0) / 100),
      refundsMinor: refundAgg._sum.amountMinor || 0,
      refundCount: refundAgg._count._all,
      cancellationFees: Math.round((feesAgg._sum.cancelFeeMinor || 0) / 100),
      cancellationFeesMinor: feesAgg._sum.cancelFeeMinor || 0,
      cancelledCount: feesAgg._count._all,
      outstanding: Math.round(outstandingMinor / 100),
      outstandingMinor,
      outstandingReservations: outstandingReservations.map((r) => ({
        reference: r.reference,
        status: r.status,
        arrival: r.checkIn instanceof Date ? r.checkIn.toISOString().slice(0, 10) : String(r.checkIn),
        guestName: guestMap.has(r.guestId) ? `${guestMap.get(r.guestId).firstName} ${guestMap.get(r.guestId).lastName}`.trim() : undefined,
        total: Math.round(r.totalMinor / 100),
        paid: Math.round(Number(r.paid_minor) / 100),
        balance: Math.round((r.totalMinor - Number(r.paid_minor)) / 100),
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        date: p.createdAt.toISOString(),
        reference: p.reservation?.reference,
        guestName: p.reservation?.guest ? `${p.reservation.guest.firstName} ${p.reservation.guest.lastName}`.trim() : undefined,
        provider: p.provider,
        amount: Math.round(p.amountMinor / 100),
        status: p.status,
      })),
    });
  } catch (err) { next(err); }
});

// ---------- eTIMS invoice history (manager/admin only, read-only) ----------
adminRouter.get('/admin/etims/invoices', requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const status = req.query.status && ['skipped', 'pending', 'issued', 'failed'].includes(String(req.query.status))
      ? String(req.query.status) : undefined;
    const where = status ? { status } : {};
    const [total, rows] = await Promise.all([
      prisma.taxInvoice.count({ where }),
      prisma.taxInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { reservation: { select: { reference: true, status: true, checkIn: true } } },
      }),
    ]);
    res.json({
      total, page, pageSize,
      countsByStatus: await prisma.taxInvoice.groupBy({ by: ['status'], _count: { _all: true } })
        .then((g) => Object.fromEntries(g.map((x) => [x.status, x._count._all]))),
      rows: rows.map((inv) => ({
        id: inv.id,
        reference: inv.reservation?.reference,
        reservationStatus: inv.reservation?.status,
        status: inv.status,
        receiptNumber: inv.receiptNumber,
        etimsInvoiceNumber: inv.etimsInvoiceNumber,
        totalMinor: inv.totalMinor,
        taxMinor: inv.taxMinor,
        currency: inv.currency,
        attempts: inv.attempts,
        lastError: inv.lastError,
        issuedAt: inv.issuedAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

// ---------- Payment health / reconciliation findings (manager/admin only, read-only) ----------
// Never mutates financial records. Findings point staff at anomalies to resolve manually.
adminRouter.get('/admin/reports/payment-health', requireRole('manager', 'admin'), async (_req, res, next) => {
  try {
    const now = new Date();
    const minus45m = new Date(now - 45 * 60 * 1000);
    const minus60m = new Date(now - 60 * 60 * 1000);
    const minus30d = new Date(now - 30 * 86400000);
    const [
      dupAttempts, stalePending, amountMismatch, overpaid, cancelledPaid, failed30d,
      invoiceFailed, invoicePendingStale, needsAllocationCount, staleUnverifiedCount, succeededVsAttemptsRows, refundByReservation,
    ] = await Promise.all([
      prisma.$queryRaw`SELECT "providerReference", count(*)::int AS n FROM payment_attempt
        WHERE "providerReference" IS NOT NULL GROUP BY "providerReference" HAVING count(*) > 2`,
      prisma.payment.findMany({
        where: { provider: 'mpesa', status: 'pending', createdAt: { lt: minus45m } },
        select: { id: true, providerReference: true, createdAt: true, reservation: { select: { reference: true } } },
        orderBy: { createdAt: 'asc' }, take: 25,
      }),
      prisma.$queryRaw`SELECT a.id, a."providerReference", a."amountMinor" AS attempt_minor, p."amountMinor" AS payment_minor
        FROM payment_attempt a JOIN payment p ON p.id = a."paymentId"
        WHERE a."amountMinor" IS NOT NULL AND a."amountMinor" <> p."amountMinor" LIMIT 25`,
      prisma.$queryRaw`SELECT r.reference, r."totalMinor", COALESCE(p.paid, 0)::bigint AS paid
        FROM reservation r JOIN (SELECT "reservationId", SUM("amountMinor") AS paid FROM payment WHERE status = 'succeeded' GROUP BY "reservationId") p ON p."reservationId" = r.id
        WHERE p.paid > r."totalMinor" ORDER BY r."checkIn" DESC LIMIT 25`,
      prisma.$queryRaw`SELECT r.reference, r."guestId", COALESCE(p.paid, 0)::bigint AS paid, COALESCE(rf.refunded, 0)::bigint AS refunded
        FROM reservation r
        JOIN (SELECT "reservationId", SUM("amountMinor") AS paid FROM payment WHERE status = 'succeeded' GROUP BY "reservationId") p ON p."reservationId" = r.id
        LEFT JOIN (SELECT "reservationId", SUM("amountMinor") AS refunded FROM payment_attempt WHERE status = 'refunded' GROUP BY "reservationId") rf ON rf."reservationId" = r.id
        WHERE r.status = 'cancelled' AND COALESCE(p.paid, 0) > COALESCE(rf.refunded, 0)
        ORDER BY r."checkIn" DESC LIMIT 25`,
      prisma.payment.count({ where: { status: 'failed', updatedAt: { gte: minus30d } } }),
      prisma.taxInvoice.findMany({ where: { status: 'failed' }, select: { id: true, reservation: { select: { reference: true } }, attempts: true, lastError: true }, orderBy: { createdAt: 'asc' }, take: 25 }),
      prisma.taxInvoice.findMany({ where: { status: 'pending', createdAt: { lt: minus60m } }, select: { id: true, reservation: { select: { reference: true } }, attempts: true }, orderBy: { createdAt: 'asc' }, take: 25 }),
      prisma.reservation.count({ where: { status: 'needs_allocation', createdAt: { lt: minus60m } } }),
      prisma.payment.count({ where: { status: 'pending', updatedAt: { lt: minus60m } } }),
      prisma.$queryRaw`SELECT
        (SELECT COALESCE(SUM("amountMinor"), 0) FROM payment WHERE status = 'succeeded')::bigint AS payments,
        (SELECT COALESCE(SUM("amountMinor"), 0) FROM payment_attempt WHERE status = 'succeeded')::bigint AS attempts`,
      prisma.paymentAttempt.aggregate({ where: { status: 'refunded' }, _sum: { amountMinor: true } }),
    ]);

    const sumPayments = Number(succeededVsAttemptsRows[0]?.payments ?? 0);
    const sumAttempts = Number(succeededVsAttemptsRows[0]?.attempts ?? 0);
    const refundTotalMinor = refundByReservation._sum.amountMinor || 0;

    const guestIds = [...new Set(cancelledPaid.map((r) => r.guestId))];
    const guests = guestIds.length
      ? await prisma.guest.findMany({ where: { id: { in: guestIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const guestMap = new Map(guests.map((g) => [g.id, g]));

    const findings = [
      { id: 'payments_without_reservation', severity: 'high', label: 'Payments without a matching reservation', count: 0, action: 'Cannot occur (FK enforced); verify ledger integrity.' },
      { id: 'duplicate_provider_transactions', severity: 'high', label: 'Duplicate provider transaction references', count: dupAttempts.length, samples: dupAttempts.slice(0, 5).map((d) => ({ reference: d.providerReference, attempts: d.n })), action: 'Inspect duplicate rows; providers retry - one of each is normally fine at attempt level.' },
      { id: 'amount_mismatches', severity: 'high', label: 'Attempt/payment amount mismatches', count: amountMismatch.length, samples: amountMismatch.slice(0, 5).map((d) => ({ id: d.id, reference: d.providerReference, attemptMinor: Number(d.attempt_minor), paymentMinor: Number(d.payment_minor) })), action: 'Investigate: amounts frozen at initiation; a mismatch indicates tampering or provider error.' },
      { id: 'overpaid_reservations', severity: 'high', label: 'Reservations paid more than their total', count: overpaid.length, samples: overpaid.slice(0, 5).map((d) => ({ reference: d.reference, totalMinor: Number(d.totalMinor), paidMinor: Number(d.paid) })), action: 'Settle the excess at the desk or refund the difference.' },
      { id: 'cancelled_with_outstanding_payment', severity: 'high', label: 'Cancelled reservations with captured payments not (fully) refunded', count: cancelledPaid.length, samples: cancelledPaid.slice(0, 5).map((d) => ({ reference: d.reference, guestName: guestMap.has(d.guestId) ? `${guestMap.get(d.guestId).firstName} ${guestMap.get(d.guestId).lastName}`.trim() : undefined, paidMinor: Number(d.paid), refundedMinor: Number(d.refunded) })), action: 'Process the refund via the manager refund flow or reconcile with the guest.' },
      { id: 'stale_pending_payments', severity: 'medium', label: 'Pending M-Pesa transactions older than 45 minutes', count: stalePending.length, samples: stalePending.slice(0, 5).map((p) => ({ id: p.id, reference: p.reservation?.reference, checkoutRequestId: p.providerReference, createdAt: p.createdAt })), action: 'Use Requery (manager) to ask Daraja for the truth; the sweeper does this automatically.' },
      { id: 'failed_payments_last_30d', severity: 'low', label: 'Failed payments (last 30 days)', count: failed30d, action: 'Informational only. No action unless a guest reports being charged.' },
      { id: 'invoices_failed', severity: 'medium', label: 'eTIMS invoices failed to issue', count: invoiceFailed.length, samples: invoiceFailed.slice(0, 5).map((i) => ({ id: i.id, reference: i.reservation?.reference, attempts: i.attempts, error: i.lastError })), action: 'Check eTIMS configuration; retry runs hourly (sweeper) up to 5 attempts.' },
      { id: 'invoices_pending_stale', severity: 'low', label: 'eTIMS invoices pending older than 60 minutes', count: invoicePendingStale.length, samples: invoicePendingStale.slice(0, 5).map((i) => ({ id: i.id, reference: i.reservation?.reference, attempts: i.attempts })), action: 'Check eTIMS pipeline; retry runs hourly.' },
      { id: 'succeeded_sum_mismatch', severity: sumAttempts === sumPayments ? 'none' : 'high', label: 'Attempt-vs-payment succeeded totals', count: sumAttempts === sumPayments ? 0 : 1, detail: `payments=${sumPayments} attempts=${sumAttempts}`, action: 'Totals must match; if they do not, inspect payment_attempt rows directly.' },
      { id: 'needs_allocation', severity: needsAllocationCount > 0 ? 'high' : 'none', label: 'Settled bookings missing a room assignment', count: Number(needsAllocationCount ?? 0), action: 'Assign rooms via the front desk assignment tool or check-out; do NOT mark confirmed without allocating.' },
      { id: 'stale_unverified_payments', severity: staleUnverifiedCount > 0 ? 'medium' : 'none', label: 'M-Pesa callbacks/queries never confirmed by Daraja (>60 min)', count: Number(staleUnverifiedCount ?? 0), action: 'Use Requery (manager) or wait for the sweeper; guests may not see a confirmation until resolved.' },
    ].filter((f) => f.count > 0);

    res.json({
      currency: 'KES',
      generatedAt: now.toISOString(),
      totals: { succeededMinor: sumPayments, attemptsSucceededMinor: sumAttempts, refundsMinor: refundTotalMinor },
      healthy: findings.every((f) => f.severity === 'none' || f.severity === 'low'),
      findings,
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
