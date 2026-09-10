import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: "../../.env" });
loadEnv();

const prisma = new PrismaClient();
const password = process.env.DEMO_USER_PASSWORD;
if (!password) throw new Error("DEMO_USER_PASSWORD is required before seeding demo users.");

const productSeed = [
  ["BEB-001", "Agua mineral", 2400, 48, "Bebidas"],
  ["BEB-002", "Té cítrico", 3200, 36, "Bebidas"],
  ["BEB-003", "Cold brew", 5800, 24, "Bebidas"],
  ["PAN-001", "Croissant mantequilla", 4200, 18, "Panadería"],
  ["PAN-002", "Rol de canela", 4600, 16, "Panadería"],
  ["DES-001", "Galleta de chocolate", 2800, 30, "Snacks"],
  ["DES-002", "Barra de avena", 3500, 25, "Snacks"],
  ["HOG-001", "Vela cedro", 18900, 12, "Hogar"],
  ["HOG-002", "Bolsa reutilizable", 7500, 20, "Hogar"],
  ["CUI-001", "Bálsamo herbal", 12500, 14, "Cuidado"],
  ["CUI-002", "Jabón de lavanda", 8900, 22, "Cuidado"],
  ["REG-001", "Tarjeta de regalo", 25000, 40, "Regalos"]
] as const;

async function main() {
  const business = await prisma.business.upsert({
    where: { slug: "mercado-lucerna" },
    update: { name: "Mercado Lucerna" },
    create: { name: "Mercado Lucerna", slug: "mercado-lucerna" }
  });

  await prisma.advanceSettlement.deleteMany({ where: { businessId: business.id } });
  await prisma.advance.deleteMany({ where: { businessId: business.id } });
  await prisma.fundingEntry.deleteMany({ where: { businessId: business.id } });
  await prisma.remittance.deleteMany({ where: { businessId: business.id } });
  await prisma.auditEvent.deleteMany({ where: { businessId: business.id } });
  await prisma.cashCount.deleteMany({ where: { businessId: business.id } });
  await prisma.ledgerEntry.deleteMany({ where: { businessId: business.id } });
  await prisma.cashBundle.deleteMany({ where: { businessId: business.id } });
  await prisma.sale.deleteMany({ where: { businessId: business.id } });
  await prisma.shift.deleteMany({ where: { register: { store: { businessId: business.id } } } });

  const store = await prisma.store.upsert({
    where: { businessId_code: { businessId: business.id, code: "ROMA" } },
    update: { name: "Lucerna Roma", city: "Ciudad de México" },
    create: { businessId: business.id, code: "ROMA", name: "Lucerna Roma", city: "Ciudad de México" }
  });

  await prisma.register.upsert({
    where: { storeId_code: { storeId: store.id, code: "CAJA-01" } },
    update: { name: "Caja principal", active: true, receiptSequence: 0, cashLimitCents: 500000, closingToleranceCents: 100, supervisorCanManageBundles: true, supervisorCanApproveClosures: true },
    create: { storeId: store.id, code: "CAJA-01", name: "Caja principal", cashLimitCents: 500000, closingToleranceCents: 100, supervisorCanManageBundles: true, supervisorCanApproveClosures: true }
  });
  await prisma.register.upsert({
    where: { storeId_code: { storeId: store.id, code: "CAJA-02" } },
    update: { name: "Caja auxiliar", active: true, receiptSequence: 0, cashLimitCents: 350000, closingToleranceCents: 100, supervisorCanManageBundles: true, supervisorCanApproveClosures: true },
    create: { storeId: store.id, code: "CAJA-02", name: "Caja auxiliar", cashLimitCents: 350000, closingToleranceCents: 100, supervisorCanManageBundles: true, supervisorCanApproveClosures: true }
  });

  const passwordHash = await hash(password, 12);
  const users = [
    { email: "ines@lucerna.demo", name: "Inés Ortega", role: Role.ADMIN, storeId: null },
    { email: "valeria@lucerna.demo", name: "Valeria Cruz", role: Role.FINANCE, storeId: null },
    { email: "mateo@lucerna.demo", name: "Mateo Santos", role: Role.SUPERVISOR, storeId: store.id },
    { email: "luz@lucerna.demo", name: "Luz Navarro", role: Role.CASHIER, storeId: store.id }
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { ...user, businessId: business.id, passwordHash, active: true },
      create: { ...user, businessId: business.id, passwordHash }
    });
  }

  const colors: Record<string, string> = {
    Bebidas: "#4f8f83",
    "Panadería": "#d49a5b",
    Snacks: "#d27161",
    Hogar: "#8c7aab",
    Cuidado: "#68a0ae",
    Regalos: "#bd7f96"
  };
  const categoryIds = new Map<string, string>();
  for (const name of Object.keys(colors)) {
    const category = await prisma.category.upsert({
      where: { businessId_name: { businessId: business.id, name } },
      update: { color: colors[name] },
      create: { businessId: business.id, name, color: colors[name] }
    });
    categoryIds.set(name, category.id);
  }

  for (const [sku, name, priceCents, stockQuantity, categoryName] of productSeed) {
    await prisma.product.upsert({
      where: { businessId_sku: { businessId: business.id, sku } },
      update: { name, priceCents, stockQuantity, categoryId: categoryIds.get(categoryName)!, active: true },
      create: { businessId: business.id, sku, name, priceCents, stockQuantity, categoryId: categoryIds.get(categoryName)! }
    });
  }

  console.log(`Seeded ${business.name}. Demo cashier: luz@lucerna.demo. Password loaded from DEMO_USER_PASSWORD.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
