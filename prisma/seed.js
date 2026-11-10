// Seed: The Stillhouse dev fixtures. Idempotent (upserts). Not for production use as-is;
// only creates demonstration/staff development data. Run: npm run db:seed
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const T = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const hundred = (n) => Math.round(n / 10000) * 10000; // round to whole KSh 100 (inputs in cents)

const ROOM_TYPES = [
  { slug: 'garden-room', number: '01', name: 'The Garden Room', tagline: 'Low, quiet and open to the trees.', summary: 'A ground-level room that opens through full-height glass onto its own planted terrace.', description: ['The Garden Room is where the property is most intimate.', 'Furnishing is deliberately reduced: a low king-size bed dressed in natural linen.'], sizeSqm: 42, maxAdults: 2, bed: 'One king-size bed', view: 'Garden and acacia canopy', fromPriceMinor: 2800000, unitCount: 14, prefix: 'G', floor: 'Garden', amenities: ['bed', 'terrace', 'shower', 'climate', 'wifi', 'refreshments', 'workspace', 'bath'], features: ['Full-height sliding glass onto a planted private terrace', 'Timber ceiling and lime-washed stone walls', 'Garden outlook from bed'] },
  { slug: 'valley-suite', number: '02', name: 'The Valley Suite', tagline: 'A long view, held at a distance.', summary: 'Raised above the garden level with a skylit bedroom, a separate sitting area and a terrace oriented toward the escarpment.', description: ['The Valley Suite is organised around its view.', 'A separate sitting area and a generous terrace give the suite the feeling of a small private house.'], sizeSqm: 68, maxAdults: 2, bed: 'One king-size bed', view: 'Rift Valley escarpment', fromPriceMinor: 4200000, unitCount: 9, prefix: 'V', floor: 'Upper terrace', amenities: ['bed', 'terrace', 'shower', 'climate', 'wifi', 'refreshments', 'workspace', 'bath'], features: ['Skylit bedroom with a wall of glass toward the valley', 'Separate sitting area', 'Elevated position above the garden level'] },
  { slug: 'signature-retreat', number: '03', name: 'The Signature Retreat', tagline: 'The whole horizon, entirely to yourself.', summary: 'The property’s largest expression: a freestanding retreat with a soaking tub, a deep terrace and the widest outlook across the valley.', description: ['The Signature Retreat stands slightly apart from the rest of the property.', 'A soaking tub sits beside the glass, so the valley is part of the evening ritual.'], sizeSqm: 96, maxAdults: 2, bed: 'One king-size bed', view: 'Widest valley outlook on the property', fromPriceMinor: 6500000, unitCount: 5, prefix: 'S', floor: 'Ridge', amenities: ['bed', 'terrace', 'shower', 'climate', 'wifi', 'refreshments', 'workspace', 'bath'], features: ['Freestanding soaking tub beside the glass', 'Deep private terrace with the widest outlook', 'Bedroom, bathing room and living space in one plan'] },
];

const RATE_PLANS = [
  { key: 'flexible', name: 'Flexible rate', summary: 'Change dates or cancel without charge up to 7 days before arrival.', cancellationSummary: 'Free cancellation up to 7 days before arrival. Within 7 days, the first night would be charged.', cancellationPolicy: { windowHours: 168, penaltyPercent: 100, refundable: true }, refundable: true, multiplier: 1, sortOrder: 0 },
  { key: 'advance', name: 'Advance purchase rate', summary: '12% below the flexible rate. Booked at least 21 days ahead, non-refundable.', cancellationSummary: 'Non-refundable and non-changeable once confirmed. Must be booked at least 21 days before arrival.', cancellationPolicy: { windowHours: 0, penaltyPercent: 100, refundable: false }, refundable: false, multiplier: 0.88, sortOrder: 1 },
];

const MAINTENANCE = { G04: 'HVAC service', V07: 'Terrace repainting', G12: 'Bathroom fixture replacement' };

async function main() {
  // Hotel singleton
  await prisma.hotel.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      name: 'The Stillhouse',
      legalName: 'The Stillhouse (concept property)',
      address: 'Great Rift Valley escarpment, Naivasha',
      location: 'Naivasha, Kenya',
      phone: '+254 000 000 000',
      email: 'reservations@stillhouse.example',
      website: 'stillhouse.example',
      coordinates: { lat: -0.7174, lng: 36.4319 },
      policies: { checkIn: '14:00', checkOut: '11:00', cancellation: 'Flexible rate: free cancellation up to 7 days before arrival.', children: 'Children are welcome in the Valley Suite and Signature Retreat by arrangement.' },
    },
    update: {},
  });

  // Room types, rooms, rate plans, rate cards
  for (const rt of ROOM_TYPES) {
    const type = await prisma.roomType.upsert({
      where: { slug: rt.slug },
      create: { slug: rt.slug, number: rt.number, name: rt.name, tagline: rt.tagline, summary: rt.summary, description: rt.description, sizeSqm: rt.sizeSqm, maxAdults: rt.maxAdults, maxChildren: 1, bed: rt.bed, view: rt.view, fromPriceMinor: rt.fromPriceMinor, unitCount: rt.unitCount, amenities: rt.amenities, features: rt.features },
      update: { tagline: rt.tagline, summary: rt.summary, description: rt.description, sizeSqm: rt.sizeSqm, maxAdults: rt.maxAdults, bed: rt.bed, view: rt.view, fromPriceMinor: rt.fromPriceMinor, unitCount: rt.unitCount, amenities: rt.amenities, features: rt.features },
    });

    for (let i = 1; i <= rt.unitCount; i++) {
      const number = `${rt.prefix}${String(i).padStart(2, '0')}`;
      const outOfService = Boolean(MAINTENANCE[number]);
      await prisma.room.upsert({
        where: { roomTypeId_number: { roomTypeId: type.id, number } },
        create: { number, roomTypeId: type.id, floor: rt.floor, status: outOfService ? 'out_of_service' : 'active', notes: MAINTENANCE[number] || null },
        update: {},
      });
    }

    for (const rp of RATE_PLANS) {
      const plan = await prisma.ratePlan.upsert({
        where: { roomTypeId_key: { roomTypeId: type.id, key: rp.key } },
        create: { ...rp, roomTypeId: type.id },
        update: { name: rp.name, summary: rp.summary, cancellationSummary: rp.cancellationSummary, cancellationPolicy: rp.cancellationPolicy, refundable: rp.refundable, multiplier: rp.multiplier, sortOrder: rp.sortOrder },
      });
      const base = hundred(Math.round(type.fromPriceMinor * rp.multiplier));
      const greenFrom = addDays(T, -30); const greenTo = addDays(T, 60);
      const peakFrom = addDays(T, 61); const peakTo = addDays(T, 160);
      const cards = [
        { season: 'Green season', validFrom: greenFrom, validTo: greenTo, nightlyMinor: hundred(Math.round(base * 0.9)), status: 'active' },
        { season: 'Peak season', validFrom: peakFrom, validTo: peakTo, nightlyMinor: hundred(Math.round(base * 1.25)), status: rp.key === 'advance' ? 'scheduled' : 'active' },
      ];
      for (const card of cards) {
        await prisma.rateCard.upsert({
          where: { roomTypeId_ratePlanId_season_validFrom: { roomTypeId: type.id, ratePlanId: plan.id, season: card.season, validFrom: card.validFrom } },
          create: { roomTypeId: type.id, ratePlanId: plan.id, ...card, validFrom: card.validFrom, validTo: card.validTo },
          update: { nightlyMinor: card.nightlyMinor, status: card.status, validTo: card.validTo },
        });
      }
    }
  }

  // Roles
  for (const key of ['guest', 'receptionist', 'manager', 'admin']) {
    await prisma.role.upsert({ where: { key }, create: { key, label: key.charAt(0).toUpperCase() + key.slice(1) }, update: {} });
  }

  // Staff + demo guest users
  const hash = (pw) => bcrypt.hashSync(pw, 12);
  const admin = await prisma.user.upsert({ where: { email: (process.env.SEED_ADMIN_EMAIL || 'admin@thestillhouse.example').toLowerCase() }, create: { email: (process.env.SEED_ADMIN_EMAIL || 'admin@thestillhouse.example').toLowerCase(), passwordHash: hash(process.env.SEED_ADMIN_PASSWORD || 'StillhouseAdmin!26'), name: 'Hotel Administrator' }, update: {} });
  const manager = await prisma.user.upsert({ where: { email: (process.env.SEED_MANAGER_EMAIL || 'manager@thestillhouse.example').toLowerCase() }, create: { email: (process.env.SEED_MANAGER_EMAIL || 'manager@thestillhouse.example').toLowerCase(), passwordHash: hash(process.env.SEED_MANAGER_PASSWORD || 'StillhouseManager!26'), name: 'Hotel Manager' }, update: {} });
  const guest = await prisma.guest.upsert({ where: { email: (process.env.SEED_GUEST_EMAIL || 'naomi.achieng@example.com').toLowerCase() }, create: { firstName: 'Naomi', lastName: 'Achieng', email: (process.env.SEED_GUEST_EMAIL || 'naomi.achieng@example.com').toLowerCase(), phone: '+254 712 000 042', country: 'Kenya', notes: 'Prefers a quiet room away from the restaurant.', marketingConsent: true }, update: {} });
  const guestUser = await prisma.user.upsert({ where: { email: guest.email }, create: { guestId: guest.id, email: guest.email, passwordHash: hash(process.env.SEED_GUEST_PASSWORD || 'GuestPassword!26'), name: `${guest.firstName} ${guest.lastName}` }, update: {} });

  const roles = await prisma.role.findMany();
  const roleByKey = Object.fromEntries(roles.map((r) => [r.key, r.id]));
  const link = async (userId, roleKey) => prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: roleByKey[roleKey] } }, create: { userId, roleId: roleByKey[roleKey] }, update: {} });
  await link(admin.id, 'admin');
  await link(admin.id, 'manager');
  await link(admin.id, 'receptionist');
  await link(manager.id, 'manager');
  await link(manager.id, 'receptionist');
  await link(guestUser.id, 'guest');

  // Settings KV (matches admin Settings page shape)
  const settings = {
    hotel: { name: 'The Stillhouse', legalName: 'The Stillhouse (concept property)', location: 'Naivasha, Kenya', rooms: 28, timezone: 'Africa/Nairobi' },
    contact: { email: 'reservations@stillhouse.example', phone: '+254 000 000 000', website: 'stillhouse.example' },
    policies: { checkIn: '14:00', checkOut: '11:00', cancellation: 'Flexible rate: free cancellation up to 7 days before arrival.', children: 'Children are welcome in the Valley Suite and Signature Retreat by arrangement.' },
    booking: { minNights: 1, maxNights: 14, maxRoomsPerBooking: 4, advancePurchaseDays: 21, acceptEnquiriesOnly: false },
  };
  await prisma.setting.upsert({ where: { key: 'admin.settings' }, create: { key: 'admin.settings', value: settings }, update: { value: settings } });

  // Maintenance blocks mirrored as confined inventory allocations + blocks
  for (const [number, reason] of Object.entries(MAINTENANCE)) {
    const room = await prisma.room.findFirst({ where: { number }, include: { roomType: true } });
    if (!room) continue;
    const existing = await prisma.inventoryBlock.findFirst({ where: { roomId: room.id, checkIn: addDays(T, 7), checkOut: addDays(T, 37) } });
    if (existing) continue;
    const block = await prisma.inventoryBlock.create({ data: { roomId: room.id, roomTypeId: room.roomTypeId, checkIn: addDays(T, 7), checkOut: addDays(T, 37), kind: 'maintenance', reason, createdByUserId: admin.id } });
    await prisma.roomAllocation.create({ data: { roomId: room.id, checkIn: block.checkIn, checkOut: block.checkOut, kind: 'block', state: 'occupying', sourceType: 'inventory_block', sourceId: block.id } });
  }

  // --- Demo reservation history & future bookings (fixtures; deterministic) ---
  // Only generated when the reservation table is empty. Real allocations are created through the
  // same "room_allocation" ledger as live bookings, so availability/admin/reports all reflect them.
  const existingReservations = await prisma.reservation.count();
  if (existingReservations === 0) {
    const rng = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const GUEST_LIST = [
      ['Naomi', 'Achieng'], ['James', 'Mwangi'], ['Faith', 'Wanjiru'], ['Peter', 'Otieno'],
      ['Grace', 'Nyambura'], ['David', 'Kibet'], ['Sarah', 'Chebet'], ['Daniel', 'Muthoni'],
      ['Lucy', 'Akinyi'], ['Samuel', 'Kamau'], ['Esther', 'Wambui'], ['Brian', 'Odhiambo'],
    ];
    const guests = [];
    for (const [firstName, lastName] of GUEST_LIST) {
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
      const g = await prisma.guest.upsert({
        where: { email },
        create: { firstName, lastName, email, phone: `+254 7${String(Math.floor(rng() * 90) + 10)}0 ${String(Math.floor(rng() * 900) + 100)}${String(Math.floor(rng() * 90) + 10)}`, country: 'Kenya' },
        update: {},
      });
      guests.push(g);
    }

    const types = await prisma.roomType.findMany({ include: { rooms: true, ratePlans: true } });
    const TYPE_WEIGHTS = [0.5, 0.32, 0.18]; // garden, valley, signature
    const pickType = () => {
      const r = rng();
      return r < TYPE_WEIGHTS[0] ? types[0] : r < TYPE_WEIGHTS[0] + TYPE_WEIGHTS[1] ? types[1] : types[2];
    };
    const iso = (d) => d.toISOString().slice(0, 10);
    const addDaysLocal = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
    const hundred = (n) => Math.round(n / 10000) * 10000;

    let created = 0;
    const target = 34;
    for (let i = 0; created < target && i < 200; i += 1) {
      const type = pickType();
      const guest = pick(guests);
      const dayOffset = Math.floor(rng() * 110) - 40; // -40..+70 days from today
      const checkIn = addDaysLocal(T, dayOffset);
      const nights = 1 + Math.floor(rng() * 4);
      const checkOut = addDaysLocal(checkIn, nights);
      const plan = pick(type.ratePlans);
      const base = hundred(Math.round(type.fromPriceMinor * plan.multiplier));
      const nightly = hundred(Math.round(base * (pick([1, 1, 1, 1.25]))));
      const subtotal = nightly * nights;
      const serviceCharge = Math.round(subtotal * 0.10);
      const tourismLevy = Math.round(subtotal * 0.02);
      const vat = Math.round(subtotal * 0.16);
      const total = subtotal + serviceCharge + tourismLevy + vat;

      const todayUTC = new Date(Date.UTC(T.getUTCFullYear(), T.getUTCMonth(), T.getUTCDate()));
      const status = checkOut < todayUTC ? 'checked_out' : checkIn <= todayUTC && checkOut > todayUTC ? 'checked_in' : rng() < 0.85 ? 'confirmed' : 'cancelled';
      const desiredRooms = 1;
      const rooms = type.rooms.slice().sort((a, b) => a.number.localeCompare(b.number));
      let placed = null;
      if (status !== 'cancelled') {
        for (const room of rooms) {
          try {
            const existing = await prisma.$queryRaw`
              SELECT 1 FROM room_allocation
              WHERE room_id = ${room.id} AND state = 'occupying'
                AND check_in < ${iso(checkOut)}::date AND check_out > ${iso(checkIn)}::date
              LIMIT 1`;
            if (existing.length) continue;
            placed = room;
            break;
          } catch { /* try next room */ }
        }
        if (!placed) continue; // fully blocked for these dates; skip this fixture
      }

      const reservation = await prisma.reservation.create({
        data: {
          reference: `STL-${T.getUTCFullYear()}-S${String(10000 + i).slice(1)}${String(Math.floor(rng() * 90) + 10)}`,
          guestId: guest.id,
          roomTypeId: type.id,
          ratePlanId: plan.id,
          status,
          checkIn,
          checkOut,
          nights,
          adults: 2,
          children: 0,
          rooms: desiredRooms,
          nightlyMinor: nightly,
          subtotalMinor: subtotal,
          serviceChargeMinor: serviceCharge,
          tourismLevyMinor: tourismLevy,
          vatMinor: vat,
          totalMinor: total,
          source: 'web',
          idempotencyKey: `seed-${i}`,
          confirmedAt: status === 'checked_out' || status === 'checked_in' || status === 'confirmed' ? new Date(checkIn.getTime() - 3 * 86400000) : null,
          checkedInAt: status === 'checked_in' || status === 'checked_out' ? checkIn : null,
          checkedOutAt: status === 'checked_out' ? checkOut : null,
          createdAt: new Date(checkIn.getTime() - Math.floor(rng() * 20 + 5) * 86400000),
        },
      });
      if (placed) {
        await prisma.$executeRaw`
          INSERT INTO room_allocation (room_id, check_in, check_out, kind, state, source_type, source_id, updated_at)
          VALUES (${String(placed.id)}::bigint, ${iso(checkIn)}::date, ${iso(checkOut)}::date,
                  'reservation'::"AllocationKind", 'occupying'::"AllocationState", 'reservation', ${String(reservation.id)}::bigint, now())`;
        await prisma.reservationRoom.create({ data: { reservationId: reservation.id, roomId: placed.id } });
      }
      if (status === 'confirmed' || status === 'checked_in' || status === 'checked_out') {
        const payment = await prisma.payment.create({
          data: { reservationId: reservation.id, provider: 'manual', providerReference: `SEED-${reservation.id}`, amountMinor: total, status: 'succeeded', capturedAt: new Date(checkIn.getTime() - 2 * 86400000) },
        });
        await prisma.paymentAttempt.create({ data: { reservationId: reservation.id, paymentId: payment.id, provider: 'manual', providerReference: payment.providerReference, amountMinor: total, currency: 'KES', status: 'succeeded', verified: true, rawPayload: { seed: true } } });
      }
      created += 1;
    }
    console.log(`Seeded ${created} reservations across the diary.`);
  }

  const counts = { roomTypes: await prisma.roomType.count(), rooms: await prisma.room.count(), rateCards: await prisma.rateCard.count(), users: await prisma.user.count() };
  console.log('Seed complete:', JSON.stringify(counts));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
