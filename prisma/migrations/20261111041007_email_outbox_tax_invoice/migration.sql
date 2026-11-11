-- CreateTable
CREATE TABLE "email_outbox" (
    "id" SERIAL NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "relatedType" TEXT,
    "relatedId" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_invoice" (
    "id" SERIAL NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'skipped',
    "receiptType" TEXT NOT NULL DEFAULT 'S',
    "receiptNumber" INTEGER,
    "customerPin" TEXT,
    "customerName" TEXT,
    "totalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "etimsInvoiceNumber" TEXT,
    "etimsReceiptSignature" TEXT,
    "etimsInternalData" TEXT,
    "etimsResponseRaw" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMP(3),

    CONSTRAINT "tax_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_dedupeKey_key" ON "email_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "email_outbox_status_createdAt_idx" ON "email_outbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "tax_invoice_reservationId_idx" ON "tax_invoice"("reservationId");

-- CreateIndex
CREATE INDEX "tax_invoice_status_idx" ON "tax_invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoice_receiptType_receiptNumber_key" ON "tax_invoice"("receiptType", "receiptNumber");

-- AddForeignKey
ALTER TABLE "tax_invoice" ADD CONSTRAINT "tax_invoice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
