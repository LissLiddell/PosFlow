import { AdvanceRecipientType, FundingEntryType, PrismaClient, RemittanceStatus, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: "../../.env" });
loadEnv();

const prisma = new PrismaClient();
const demoPassword = process.env.DEMO_USER_PASSWORD;
if (!demoPassword) throw new Error("DEMO_USER_PASSWORD is required before seeding demo users.");

async function main() {
  const business = await prisma.business.findUniqueOrThrow({ where: { slug: "mercado-lucerna" } });
  const roma = await prisma.store.findUniqueOrThrow({ where: { businessId_code: { businessId: business.id, code: "ROMA" } } });
  const centro = await prisma.store.upsert({
    where: { businessId_code: { businessId: business.id, code: "CENTRO" } },
    update: { name: "Lucerna Centro", city: "Ciudad de México" },
    create: { businessId: business.id, code: "CENTRO", name: "Lucerna Centro", city: "Ciudad de México" }
  });
  await prisma.register.upsert({
    where: { storeId_code: { storeId: centro.id, code: "CAJA-01" } },
    update: { name: "Caja principal", active: true },
    create: { storeId: centro.id, code: "CAJA-01", name: "Caja principal", cashLimitCents: 500_000, closingToleranceCents: 100 }
  });

  const passwordHash = await hash(demoPassword, 12);
  const centroOperators = [
    { email: "diego@lucerna.demo", name: "Diego Serrano", role: Role.SUPERVISOR },
    { email: "camila@lucerna.demo", name: "Camila Vega", role: Role.CASHIER }
  ];
  for (const operator of centroOperators) {
    await prisma.user.upsert({
      where: { email: operator.email },
      update: { ...operator, businessId: business.id, storeId: centro.id, passwordHash, active: true },
      create: { ...operator, businessId: business.id, storeId: centro.id, passwordHash }
    });
  }

  const finance = await prisma.user.findFirstOrThrow({ where: { businessId: business.id, role: "FINANCE" } });
  const incoming = await prisma.remittance.upsert({
    where: { businessId_reference: { businessId: business.id, reference: "RM-DEMO2026" } },
    update: {
      originStoreId: centro.id,
      destinationStoreId: roma.id,
      senderName: "Elena Torres",
      senderPhone: "+52 55 0101 2026",
      beneficiaryName: "Daniel Reyes",
      beneficiaryDocumentCode: "4821",
      amountCents: 85_000,
      feeCents: 2_550,
      totalCollectedCents: 87_550
    },
    create: {
      businessId: business.id,
      reference: "RM-DEMO2026",
      status: RemittanceStatus.AVAILABLE,
      originStoreId: centro.id,
      destinationStoreId: roma.id,
      senderName: "Elena Torres",
      senderPhone: "+52 55 0101 2026",
      beneficiaryName: "Daniel Reyes",
      beneficiaryDocumentCode: "4821",
      amountCents: 85_000,
      feeCents: 2_550,
      totalCollectedCents: 87_550
    }
  });

  const existingFunding = await prisma.fundingEntry.findFirst({
    where: { remittanceId: incoming.id, type: FundingEntryType.REMITTANCE_SEND }
  });
  if (!existingFunding) {
    await prisma.fundingEntry.create({
      data: {
        businessId: business.id,
        storeId: centro.id,
        remittanceId: incoming.id,
        type: FundingEntryType.REMITTANCE_SEND,
        amountCents: -incoming.amountCents,
        description: `Obligación de pago por ${incoming.reference}`,
        createdById: finance.id
      }
    });
  }

  let demoAdvance = await prisma.advance.findUnique({
    where: { businessId_reference: { businessId: business.id, reference: "AV-DEMO2026" } }
  });
  if (!demoAdvance) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    demoAdvance = await prisma.advance.create({
      data: {
        businessId: business.id,
        storeId: roma.id,
        reference: "AV-DEMO2026",
        recipientType: AdvanceRecipientType.EMPLOYEE,
        recipientName: "Mariana López",
        purpose: "Compra urgente de insumos para la sucursal",
        amountCents: 60_000,
        dueDate,
        createdById: finance.id,
        authorizedById: finance.id
      }
    });
  }

  console.log(`Stage 2 ready. Remittance ${incoming.reference} is ${incoming.status}; advance ${demoAdvance.reference} is ${demoAdvance.status}; Centro operators are active.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
