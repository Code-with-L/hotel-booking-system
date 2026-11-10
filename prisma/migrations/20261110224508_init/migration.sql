-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('active', 'out_of_service');

-- CreateEnum
CREATE TYPE "RatePlanStatus" AS ENUM ('active', 'scheduled', 'inactive');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('mpesa', 'manual', 'card');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('web', 'admin', 'phone');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "AllocationKind" AS ENUM ('hold', 'reservation', 'block');

-- CreateEnum
CREATE TYPE "AllocationState" AS ENUM ('occupying', 'released', 'expired');

-- CreateTable
CREATE TABLE "Hotel" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "coordinates" JSONB,
    "policies" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_type" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT[],
    "sizeSqm" INTEGER NOT NULL,
    "maxAdults" INTEGER NOT NULL,
    "maxChildren" INTEGER NOT NULL DEFAULT 1,
    "bed" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "fromPriceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "unitCount" INTEGER NOT NULL,
    "amenities" TEXT[],
    "features" TEXT[],

    CONSTRAINT "room_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" BIGSERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "floor" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_plan" (
    "id" SERIAL NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "cancellationSummary" TEXT NOT NULL,
    "cancellationPolicy" JSONB NOT NULL,
    "refundable" BOOLEAN NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_card" (
    "id" SERIAL NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "ratePlanId" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "nightlyMinor" INTEGER NOT NULL,
    "status" "RatePlanStatus" NOT NULL DEFAULT 'active',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "notes" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "guestId" INTEGER,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "session" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiryAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "guestId" INTEGER NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "ratePlanId" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'pending',
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "nightlyMinor" INTEGER NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "serviceChargeMinor" INTEGER NOT NULL,
    "tourismLevyMinor" INTEGER NOT NULL,
    "vatMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "specialRequests" TEXT,
    "source" "ReservationSource" NOT NULL DEFAULT 'web',
    "idempotencyKey" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelFeeMinor" INTEGER,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_room" (
    "id" SERIAL NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "roomId" BIGINT NOT NULL,

    CONSTRAINT "reservation_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_allocation" (
    "id" BIGSERIAL NOT NULL,
    "room_id" BIGINT NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "kind" "AllocationKind" NOT NULL,
    "state" "AllocationState" NOT NULL DEFAULT 'occupying',
    "source_type" TEXT NOT NULL,
    "source_id" BIGINT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_block" (
    "id" BIGSERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'maintenance',
    "reason" TEXT,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" SERIAL NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerReference" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "capturedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempt" (
    "id" SERIAL NOT NULL,
    "reservationId" INTEGER,
    "paymentId" INTEGER,
    "provider" "PaymentProvider" NOT NULL,
    "providerReference" TEXT,
    "amountMinor" INTEGER,
    "currency" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "rawPayload" JSONB,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "actorUserId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" INTEGER,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_type_slug_key" ON "room_type"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "room_roomTypeId_number_key" ON "room"("roomTypeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plan_roomTypeId_key_key" ON "rate_plan"("roomTypeId", "key");

-- CreateIndex
CREATE INDEX "rate_card_ratePlanId_validFrom_validTo_status_idx" ON "rate_card"("ratePlanId", "validFrom", "validTo", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rate_card_roomTypeId_ratePlanId_season_validFrom_key" ON "rate_card"("roomTypeId", "ratePlanId", "season", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "guest_email_key" ON "guest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_guestId_key" ON "user"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "session_tokenHash_key" ON "session"("tokenHash");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_tokenHash_key" ON "password_reset_token"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_reference_key" ON "reservation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_idempotencyKey_key" ON "reservation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reservation_status_checkIn_idx" ON "reservation"("status", "checkIn");

-- CreateIndex
CREATE INDEX "reservation_guestId_idx" ON "reservation"("guestId");

-- CreateIndex
CREATE INDEX "reservation_checkIn_checkOut_idx" ON "reservation"("checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "reservation_room_roomId_idx" ON "reservation_room"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_room_reservationId_roomId_key" ON "reservation_room"("reservationId", "roomId");

-- CreateIndex
CREATE INDEX "room_allocation_check_in_check_out_idx" ON "room_allocation"("check_in", "check_out");

-- CreateIndex
CREATE INDEX "room_allocation_source_type_source_id_idx" ON "room_allocation"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "inventory_block_roomId_checkIn_checkOut_idx" ON "inventory_block"("roomId", "checkIn", "checkOut");

-- CreateIndex
CREATE UNIQUE INDEX "payment_providerReference_key" ON "payment"("providerReference");

-- CreateIndex
CREATE INDEX "payment_reservationId_idx" ON "payment"("reservationId");

-- CreateIndex
CREATE INDEX "payment_attempt_providerReference_idx" ON "payment_attempt"("providerReference");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card" ADD CONSTRAINT "rate_card_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card" ADD CONSTRAINT "rate_card_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "rate_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "rate_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_room" ADD CONSTRAINT "reservation_room_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_room" ADD CONSTRAINT "reservation_room_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_allocation" ADD CONSTRAINT "room_allocation_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_block" ADD CONSTRAINT "inventory_block_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_block" ADD CONSTRAINT "inventory_block_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extensions (custom additions, not representable in Prisma schema)
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "guest" ALTER COLUMN "email" SET DATA TYPE citext;
ALTER TABLE "user" ALTER COLUMN "email" SET DATA TYPE citext;

-- Integrity backstop: no two occupying allocations may overlap for the same room.
-- Half-open daterange so checkout day is free for the next guest.
ALTER TABLE "room_allocation" ADD CONSTRAINT "room_allocation_no_overlap" EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out, '[)') WITH &&) WHERE (state = 'occupying');

-- Reservation sanity checks
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_dates_ordered" CHECK ("checkOut" > "checkIn");
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_occupancy_valid" CHECK ("adults" >= 1 AND "children" >= 0 AND "rooms" >= 1);
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_amounts_nonnegative" CHECK ("subtotalMinor" >= 0 AND "totalMinor" >= 0);
ALTER TABLE "room_allocation" ADD CONSTRAINT "allocation_dates_valid" CHECK ("check_out" > "check_in");
ALTER TABLE "rate_card" ADD CONSTRAINT "rate_card_dates_valid" CHECK ("validTo" >= "validFrom");
ALTER TABLE "inventory_block" ADD CONSTRAINT "inventory_block_dates_valid" CHECK ("checkOut" > "checkIn");
