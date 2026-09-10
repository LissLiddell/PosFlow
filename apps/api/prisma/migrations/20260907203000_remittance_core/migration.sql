-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('AVAILABLE', 'PAID', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "FundingEntryType" AS ENUM ('REMITTANCE_SEND', 'REMITTANCE_PAYOUT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "originStoreId" TEXT NOT NULL,
    "destinationStoreId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryDocumentCode" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "totalCollectedCents" INTEGER NOT NULL,
    "sentShiftId" TEXT,
    "sentById" TEXT,
    "paidShiftId" TEXT,
    "paidById" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "remittanceId" TEXT,
    "type" "FundingEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Remittance_businessId_reference_key" ON "Remittance"("businessId", "reference");
CREATE INDEX "Remittance_businessId_status_createdAt_idx" ON "Remittance"("businessId", "status", "createdAt");
CREATE INDEX "Remittance_destinationStoreId_status_idx" ON "Remittance"("destinationStoreId", "status");
CREATE INDEX "Remittance_sentShiftId_idx" ON "Remittance"("sentShiftId");
CREATE INDEX "Remittance_paidShiftId_idx" ON "Remittance"("paidShiftId");
CREATE INDEX "FundingEntry_businessId_createdAt_idx" ON "FundingEntry"("businessId", "createdAt");
CREATE INDEX "FundingEntry_storeId_createdAt_idx" ON "FundingEntry"("storeId", "createdAt");
CREATE INDEX "FundingEntry_remittanceId_idx" ON "FundingEntry"("remittanceId");

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_originStoreId_fkey" FOREIGN KEY ("originStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_destinationStoreId_fkey" FOREIGN KEY ("destinationStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_sentShiftId_fkey" FOREIGN KEY ("sentShiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_paidShiftId_fkey" FOREIGN KEY ("paidShiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundingEntry" ADD CONSTRAINT "FundingEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundingEntry" ADD CONSTRAINT "FundingEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundingEntry" ADD CONSTRAINT "FundingEntry_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "Remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundingEntry" ADD CONSTRAINT "FundingEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
