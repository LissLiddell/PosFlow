CREATE TYPE "AdvanceStatus" AS ENUM ('AUTHORIZED', 'OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');
CREATE TYPE "AdvanceRecipientType" AS ENUM ('EMPLOYEE', 'VENDOR');
CREATE TYPE "AdvanceSettlementType" AS ENUM ('EXPENSE_PROOF', 'CASH_RETURN');

CREATE TABLE "Advance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'AUTHORIZED',
    "recipientType" "AdvanceRecipientType" NOT NULL,
    "recipientName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "proofCents" INTEGER NOT NULL DEFAULT 0,
    "returnedCents" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "authorizedById" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedShiftId" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvanceSettlement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "type" "AdvanceSettlementType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "shiftId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdvanceSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Advance_businessId_reference_key" ON "Advance"("businessId", "reference");
CREATE INDEX "Advance_businessId_status_dueDate_idx" ON "Advance"("businessId", "status", "dueDate");
CREATE INDEX "Advance_storeId_status_idx" ON "Advance"("storeId", "status");
CREATE INDEX "Advance_issuedShiftId_idx" ON "Advance"("issuedShiftId");
CREATE INDEX "AdvanceSettlement_advanceId_createdAt_idx" ON "AdvanceSettlement"("advanceId", "createdAt");
CREATE INDEX "AdvanceSettlement_shiftId_idx" ON "AdvanceSettlement"("shiftId");
CREATE INDEX "AdvanceSettlement_businessId_type_idx" ON "AdvanceSettlement"("businessId", "type");

ALTER TABLE "Advance" ADD CONSTRAINT "Advance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_issuedShiftId_fkey" FOREIGN KEY ("issuedShiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdvanceSettlement" ADD CONSTRAINT "AdvanceSettlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdvanceSettlement" ADD CONSTRAINT "AdvanceSettlement_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "Advance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdvanceSettlement" ADD CONSTRAINT "AdvanceSettlement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdvanceSettlement" ADD CONSTRAINT "AdvanceSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
