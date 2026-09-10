import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const businessSlug = "posflow-e2e";

export async function cleanE2EDatabase() {
  const business = await prisma.business.findUnique({ where: { slug: businessSlug } });
  if (!business) return;

  const businessId = business.id;
  await prisma.$transaction([
    prisma.advanceSettlement.deleteMany({ where: { businessId } }),
    prisma.advance.deleteMany({ where: { businessId } }),
    prisma.fundingEntry.deleteMany({ where: { businessId } }),
    prisma.remittance.deleteMany({ where: { businessId } }),
    prisma.auditEvent.deleteMany({ where: { businessId } }),
    prisma.cashCount.deleteMany({ where: { businessId } }),
    prisma.ledgerEntry.deleteMany({ where: { businessId } }),
    prisma.cashBundle.deleteMany({ where: { businessId } }),
    prisma.sale.deleteMany({ where: { businessId } })
  ]);
  await prisma.shift.deleteMany({ where: { register: { store: { businessId } } } });
  await prisma.product.deleteMany({ where: { businessId } });
  await prisma.category.deleteMany({ where: { businessId } });
  await prisma.register.deleteMany({ where: { store: { businessId } } });
  await prisma.user.deleteMany({ where: { businessId } });
  await prisma.store.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });
}

export async function resetE2EDatabase() {
  await cleanE2EDatabase();

  const demoPassword = process.env.DEMO_USER_PASSWORD;
  if (!demoPassword) throw new Error("DEMO_USER_PASSWORD is required for E2E fixtures.");

  const business = await prisma.business.create({
    data: { name: "Mercado Lucerna E2E", slug: businessSlug }
  });
  const [roma, centro] = await Promise.all([
    prisma.store.create({ data: { businessId: business.id, code: "ROMA", name: "Lucerna Roma", city: "Ciudad de México" } }),
    prisma.store.create({ data: { businessId: business.id, code: "CENTRO", name: "Lucerna Centro", city: "Ciudad de México" } })
  ]);

  await Promise.all([
    prisma.register.create({
      data: {
        storeId: roma.id,
        code: "CAJA-01",
        name: "Caja principal",
        cashLimitCents: 500_000,
        closingToleranceCents: 100,
        supervisorCanManageBundles: true,
        supervisorCanApproveClosures: true
      }
    }),
    prisma.register.create({
      data: {
        storeId: centro.id,
        code: "CAJA-01",
        name: "Caja principal",
        cashLimitCents: 500_000,
        closingToleranceCents: 100,
        supervisorCanManageBundles: true,
        supervisorCanApproveClosures: true
      }
    })
  ]);

  const passwordHash = await hash(demoPassword, 4);
  const users = [
    { email: "ines@lucerna.demo", name: "Inés Ortega", role: Role.ADMIN, storeId: null },
    { email: "valeria@lucerna.demo", name: "Valeria Cruz", role: Role.FINANCE, storeId: null },
    { email: "mateo@lucerna.demo", name: "Mateo Santos", role: Role.SUPERVISOR, storeId: roma.id },
    { email: "luz@lucerna.demo", name: "Luz Navarro", role: Role.CASHIER, storeId: roma.id },
    { email: "diego@lucerna.demo", name: "Diego Serrano", role: Role.SUPERVISOR, storeId: centro.id },
    { email: "camila@lucerna.demo", name: "Camila Vega", role: Role.CASHIER, storeId: centro.id }
  ];
  await Promise.all(users.map((user) => prisma.user.create({
    data: { ...user, businessId: business.id, passwordHash, active: true }
  })));

  const category = await prisma.category.create({
    data: { businessId: business.id, name: "Regalos", color: "#bd7f96" }
  });
  await prisma.product.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      sku: "REG-E2E-001",
      name: "Tarjeta de regalo",
      priceCents: 25_000,
      stockQuantity: 40,
      active: true
    }
  });
}

export async function disconnectE2EDatabase() {
  await prisma.$disconnect();
}
