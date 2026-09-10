import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../lib/api";
import type { Advance, AdvanceInput, CashBundle, CashLine, Category, FinanceOverview, PendingShift, Product, ProductInput, ReconciliationReport, Register, Remittance, RemittanceSendInput, Shift, StoreSummary } from "../types";

export const useOperationsStore = defineStore("operations", () => {
  const registers = ref<Register[]>([]);
  const products = ref<Product[]>([]);
  const shift = ref<Shift | null>(null);
  const report = ref<ReconciliationReport | null>(null);
  const categories = ref<Category[]>([]);
  const settingsRegisters = ref<Register[]>([]);
  const pendingReviews = ref<PendingShift[]>([]);
  const remittances = ref<Remittance[]>([]);
  const remittanceStores = ref<StoreSummary[]>([]);
  const advances = ref<Advance[]>([]);
  const advanceStores = ref<StoreSummary[]>([]);
  const financeOverview = ref<FinanceOverview | null>(null);
  const loading = ref(false);
  const error = ref("");

  async function bootstrap() {
    loading.value = true;
    error.value = "";
    try {
      const [registerResult, productResult, shiftResult, remittanceResult, destinationResult, advanceResult, advanceStoreResult] = await Promise.all([
        api<{ registers: Register[] }>("/catalog/registers"),
        api<{ products: Product[] }>("/catalog/products"),
        api<{ shift: Shift | null }>("/shifts/current"),
        api<{ remittances: Remittance[] }>("/remittances"),
        api<{ stores: StoreSummary[] }>("/remittances/destinations"),
        api<{ advances: Advance[] }>("/advances"),
        api<{ stores: StoreSummary[] }>("/advances/stores")
      ]);
      registers.value = registerResult.registers;
      products.value = productResult.products;
      shift.value = shiftResult.shift;
      remittances.value = remittanceResult.remittances;
      remittanceStores.value = destinationResult.stores;
      advances.value = advanceResult.advances;
      advanceStores.value = advanceStoreResult.stores;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "No pudimos cargar la operación.";
    } finally {
      loading.value = false;
    }
  }

  async function refreshShift() {
    shift.value = (await api<{ shift: Shift | null }>("/shifts/current")).shift;
  }

  async function loadAdminData() {
    const [categoryResult, registerResult] = await Promise.all([
      api<{ categories: Category[] }>("/catalog/categories"),
      api<{ registers: Register[] }>("/settings/registers")
    ]);
    categories.value = categoryResult.categories;
    settingsRegisters.value = registerResult.registers;
  }

  async function loadFinanceOverview() {
    financeOverview.value = (await api<{ overview: FinanceOverview }>("/finance/overview")).overview;
  }

  async function loadExceptions() {
    pendingReviews.value = (await api<{ shifts: PendingShift[] }>("/shifts/pending-review")).shifts;
  }

  async function openShift(registerId: string, openingFloatCents: number) {
    await api("/shifts/open", { method: "POST", body: JSON.stringify({ registerId, openingFloatCents }) });
    await refreshShift();
  }

  async function completeSale(items: Array<{ productId: string; quantity: number }>, cashReceivedCents: number) {
    if (!shift.value) throw new Error("Abre una caja antes de vender.");
    const result = await api<{ sale: { receiptNumber: string; totalCents: number }; changeCents: number }>("/sales", {
      method: "POST",
      body: JSON.stringify({ shiftId: shift.value.id, items, cashReceivedCents })
    });
    await bootstrap();
    return result;
  }

  async function createBundle(lines: CashLine[]) {
    if (!shift.value) throw new Error("No existe un turno abierto.");
    const result = await api<{ bundle: CashBundle }>("/cash-bundles", {
      method: "POST",
      body: JSON.stringify({ shiftId: shift.value.id, lines })
    });
    await refreshShift();
    return result.bundle;
  }

  async function updateBundle(id: string, lines: CashLine[]) {
    const result = await api<{ bundle: CashBundle }>(`/cash-bundles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ lines })
    });
    await refreshShift();
    return result.bundle;
  }

  async function sealBundle(id: string) {
    await api(`/cash-bundles/${id}/seal`, { method: "POST" });
    await refreshShift();
  }

  async function sendRemittance(input: RemittanceSendInput) {
    if (!shift.value) throw new Error("Abre una caja antes de enviar una remesa.");
    const result = await api<{ remittance: Remittance }>("/remittances/send", {
      method: "POST",
      body: JSON.stringify({ ...input, shiftId: shift.value.id })
    });
    await bootstrap();
    return result.remittance;
  }

  async function payRemittance(reference: string, beneficiaryDocumentCode: string) {
    if (!shift.value) throw new Error("Abre una caja antes de pagar una remesa.");
    const result = await api<{ remittance: Remittance }>(`/remittances/${encodeURIComponent(reference.trim())}/pay`, {
      method: "POST",
      body: JSON.stringify({ shiftId: shift.value.id, beneficiaryDocumentCode })
    });
    await bootstrap();
    return result.remittance;
  }

  async function createAdvance(input: AdvanceInput) {
    const result = await api<{ advance: Advance }>("/advances", {
      method: "POST",
      body: JSON.stringify(input)
    });
    await bootstrap();
    return result.advance;
  }

  async function issueAdvance(id: string) {
    if (!shift.value) throw new Error("Abre una caja antes de entregar un anticipo.");
    const result = await api<{ advance: Advance }>(`/advances/${id}/issue`, {
      method: "POST",
      body: JSON.stringify({ shiftId: shift.value.id })
    });
    await bootstrap();
    return result.advance;
  }

  async function proveAdvance(id: string, amountCents: number, description: string) {
    const result = await api<{ advance: Advance }>(`/advances/${id}/proof`, {
      method: "POST",
      body: JSON.stringify({ amountCents, description })
    });
    await bootstrap();
    return result.advance;
  }

  async function returnAdvanceCash(id: string, amountCents: number, description: string) {
    if (!shift.value) throw new Error("Abre una caja antes de recibir una devolución.");
    const result = await api<{ advance: Advance }>(`/advances/${id}/return`, {
      method: "POST",
      body: JSON.stringify({ shiftId: shift.value.id, amountCents, description })
    });
    await bootstrap();
    return result.advance;
  }

  async function closeShift(lines: CashLine[]) {
    if (!shift.value) throw new Error("No existe un turno abierto.");
    const shiftId = shift.value.id;
    const result = await api<{ shift: Shift; requiresApproval: boolean }>(`/shifts/${shiftId}/close`, {
      method: "POST",
      body: JSON.stringify({ lines })
    });
    if (result.requiresApproval) {
      await refreshShift();
    } else {
      report.value = (await api<{ report: ReconciliationReport }>(`/reports/shifts/${shiftId}/reconciliation`)).report;
      shift.value = null;
    }
    return result;
  }

  async function approveClose(id: string) {
    await api(`/shifts/${id}/approve-close`, { method: "POST" });
    const [shiftResult, pendingResult, reportResult] = await Promise.all([
      api<{ shift: Shift | null }>("/shifts/current"),
      api<{ shifts: PendingShift[] }>("/shifts/pending-review"),
      api<{ report: ReconciliationReport }>(`/reports/shifts/${id}/reconciliation`)
    ]);
    shift.value = shiftResult.shift;
    pendingReviews.value = pendingResult.shifts;
    report.value = reportResult.report;
  }

  async function saveRegisterSettings(id: string, input: { cashLimitCents: number; closingToleranceCents: number; supervisorCanManageBundles: boolean; supervisorCanApproveClosures: boolean; active: boolean }) {
    await api(`/settings/registers/${id}`, { method: "PATCH", body: JSON.stringify(input) });
    await Promise.all([bootstrap(), loadAdminData()]);
  }

  async function saveProduct(input: ProductInput, id?: string) {
    await api(id ? `/catalog/products/${id}` : "/catalog/products", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(input)
    });
    await bootstrap();
  }

  function reset() {
    registers.value = [];
    products.value = [];
    shift.value = null;
    report.value = null;
    categories.value = [];
    settingsRegisters.value = [];
    pendingReviews.value = [];
    remittances.value = [];
    remittanceStores.value = [];
    advances.value = [];
    advanceStores.value = [];
    financeOverview.value = null;
    error.value = "";
  }

  function clearReport() {
    report.value = null;
  }

  return {
    registers,
    products,
    shift,
    report,
    categories,
    settingsRegisters,
    pendingReviews,
    remittances,
    remittanceStores,
    advances,
    advanceStores,
    financeOverview,
    loading,
    error,
    bootstrap,
    refreshShift,
    loadAdminData,
    loadFinanceOverview,
    loadExceptions,
    openShift,
    completeSale,
    createBundle,
    updateBundle,
    sealBundle,
    sendRemittance,
    payRemittance,
    createAdvance,
    issueAdvance,
    proveAdvance,
    returnAdvanceCash,
    closeShift,
    approveClose,
    saveRegisterSettings,
    saveProduct,
    clearReport,
    reset
  };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useOperationsStore, import.meta.hot));
