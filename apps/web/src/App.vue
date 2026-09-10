<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import AdvanceCashPanel from "./components/AdvanceCashPanel.vue";
import AdvanceFinancePanel from "./components/AdvanceFinancePanel.vue";
import CashBundlePanel from "./components/CashBundlePanel.vue";
import CatalogAdminPanel from "./components/CatalogAdminPanel.vue";
import ClosePanel from "./components/ClosePanel.vue";
import ExceptionsPanel from "./components/ExceptionsPanel.vue";
import FinanceDashboardPanel from "./components/FinanceDashboardPanel.vue";
import OpeningPanel from "./components/OpeningPanel.vue";
import RemittancePanel from "./components/RemittancePanel.vue";
import ReportPanel from "./components/ReportPanel.vue";
import SalePanel from "./components/SalePanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import { formatCurrency } from "./lib/money";
import { useOperationsStore } from "./stores/operations";
import { useSessionStore } from "./stores/session";
import type { DemoStoreCode } from "./stores/session";
import type { AdvanceInput, CashLine, ProductInput, RemittanceSendInput, Role } from "./types";

type View = "sale" | "remittances" | "advances" | "bundles" | "close" | "exceptions" | "catalog" | "settings" | "finance" | "finance-advances";

const session = useSessionStore();
const operations = useOperationsStore();
const selectedRole = ref<Role>("CASHIER");
const selectedStoreCode = ref<DemoStoreCode>("ROMA");
const view = ref<View>("sale");
const busy = ref(false);
const error = ref("");
const toast = ref("");
const saleResetKey = ref(0);
const bundleResetKey = ref(0);
const catalogResetKey = ref(0);
const remittanceResetKey = ref(0);
const advanceResetKey = ref(0);

const roleLabel: Record<Role, string> = {
  ADMIN: "Administrador",
  FINANCE: "Finanzas",
  SUPERVISOR: "Supervisor",
  CASHIER: "Cajero"
};

const canOpenAndClose = computed(() => session.user?.role === "CASHIER" || session.user?.role === "SUPERVISOR");
const canManageBundles = computed(() => session.user?.role === "ADMIN" || (session.user?.role === "SUPERVISOR" && operations.shift?.register.supervisorCanManageBundles === true));
const canReviewClosures = computed(() => session.user?.role === "ADMIN" || (session.user?.role === "SUPERVISOR" && operations.registers.some((register) => register.supervisorCanApproveClosures)));
const canSell = computed(() => session.user?.role === "CASHIER" || session.user?.role === "SUPERVISOR");
const canOperateRemittances = computed(() => canSell.value);
const canOperateAdvances = computed(() => canSell.value);
const canManageAdvances = computed(() => session.user?.role === "FINANCE" || session.user?.role === "ADMIN");
const cashSalesCents = computed(() => operations.shift?.ledgerEntries.filter((entry) => entry.type === "CASH_SALE").reduce((sum, entry) => sum + entry.amountCents, 0) ?? 0);
const sealedBundleCents = computed(() => operations.shift?.cashBundles.filter((bundle) => bundle.status !== "DRAFT" && bundle.status !== "CANCELLED").reduce((sum, bundle) => sum + bundle.totalCents, 0) ?? 0);
const drawerPercent = computed(() => operations.shift ? Math.round((operations.shift.expectedCashCents / operations.shift.register.cashLimitCents) * 100) : 0);

function defaultView(role: Role): View {
  if (role === "ADMIN") return "settings";
  if (role === "FINANCE") return "finance";
  return "sale";
}

async function focusPageTop(targetId: "login-content" | "main-content") {
  await nextTick();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.getElementById(targetId)?.focus({ preventScroll: true });
}

onMounted(() => session.restore());
watch(() => session.user, async (user, previousUser) => {
  if (!user) {
    operations.reset();
    if (previousUser) await focusPageTop("login-content");
    return;
  }
  view.value = defaultView(user.role);
  await operations.bootstrap();
  if (user.role === "ADMIN") await Promise.all([operations.loadAdminData(), operations.loadFinanceOverview()]);
  if (user.role === "FINANCE") await operations.loadFinanceOverview();
  if (user.role === "SUPERVISOR" || user.role === "ADMIN") {
    await operations.loadExceptions();
    if (operations.shift?.status === "PENDING_REVIEW") view.value = "exceptions";
  }
  await focusPageTop("main-content");
}, { immediate: true });

watch(view, () => {
  if (session.user) void focusPageTop("main-content");
});

function notify(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 4200);
}

async function perform(action: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "No pudimos completar la operación.";
  } finally {
    busy.value = false;
  }
}

async function openShift(registerId: string, openingFloatCents: number) {
  await perform(async () => {
    await operations.openShift(registerId, openingFloatCents);
    view.value = "sale";
    notify(`Caja abierta con ${formatCurrency(openingFloatCents)}.`);
  });
}

async function completeSale(items: Array<{ productId: string; quantity: number }>, cashReceivedCents: number) {
  await perform(async () => {
    const result = await operations.completeSale(items, cashReceivedCents);
    saleResetKey.value += 1;
    notify(`Venta ${result.sale.receiptNumber} registrada · Cambio ${formatCurrency(result.changeCents)}.`);
  });
}

async function createBundle(lines: CashLine[]) {
  await perform(async () => {
    const bundle = await operations.createBundle(lines);
    bundleResetKey.value += 1;
    notify(`Fajilla ${bundle.reference} guardada como borrador.`);
  });
}

async function updateBundle(id: string, lines: CashLine[]) {
  await perform(async () => {
    const bundle = await operations.updateBundle(id, lines);
    bundleResetKey.value += 1;
    notify(`Fajilla ${bundle.reference} actualizada.`);
  });
}

async function sealBundle(id: string) {
  await perform(async () => {
    await operations.sealBundle(id);
    notify("Fajilla sellada. El efectivo salió del cajón y quedó protegido para edición.");
  });
}

async function sendRemittance(input: RemittanceSendInput) {
  await perform(async () => {
    const remittance = await operations.sendRemittance(input);
    remittanceResetKey.value += 1;
    notify(`Remesa ${remittance.reference} disponible · Total recibido ${formatCurrency(remittance.totalCollectedCents)}.`);
  });
}

async function payRemittance(reference: string, beneficiaryDocumentCode: string) {
  await perform(async () => {
    const remittance = await operations.payRemittance(reference, beneficiaryDocumentCode);
    remittanceResetKey.value += 1;
    notify(`Remesa ${remittance.reference} pagada · Entrega ${formatCurrency(remittance.amountCents)}.`);
  });
}

async function createAdvance(input: AdvanceInput) {
  await perform(async () => {
    const advance = await operations.createAdvance(input);
    await operations.loadFinanceOverview();
    advanceResetKey.value += 1;
    notify(`Anticipo ${advance.reference} autorizado para ${advance.recipientName}.`);
  });
}

async function issueAdvance(id: string) {
  await perform(async () => {
    const advance = await operations.issueAdvance(id);
    advanceResetKey.value += 1;
    notify(`Anticipo ${advance.reference} entregado · ${formatCurrency(advance.amountCents)} salió del cajón.`);
  });
}

async function proveAdvance(id: string, amountCents: number, description: string) {
  await perform(async () => {
    const advance = await operations.proveAdvance(id, amountCents, description);
    await operations.loadFinanceOverview();
    advanceResetKey.value += 1;
    notify(`Comprobación aplicada a ${advance.reference} · pendiente ${formatCurrency(advance.amountCents - advance.proofCents - advance.returnedCents)}.`);
  });
}

async function returnAdvanceCash(id: string, amountCents: number, description: string) {
  await perform(async () => {
    const advance = await operations.returnAdvanceCash(id, amountCents, description);
    advanceResetKey.value += 1;
    notify(`Devolución aplicada a ${advance.reference} · ${formatCurrency(amountCents)} entró al cajón.`);
  });
}

async function closeShift(lines: CashLine[]) {
  await perform(async () => {
    const result = await operations.closeShift(lines);
    if (result.requiresApproval) {
      notify("Cierre enviado a revisión por diferencia de efectivo.");
      view.value = "close";
    } else {
      notify("Turno conciliado y cerrado correctamente.");
    }
  });
}

async function approveClose(id: string) {
  await perform(async () => {
    await operations.approveClose(id);
    notify("Cierre aprobado. El conteo original quedó conservado en el historial.");
  });
}

async function saveRegisterSettings(id: string, input: { cashLimitCents: number; closingToleranceCents: number; supervisorCanManageBundles: boolean; supervisorCanApproveClosures: boolean; active: boolean }) {
  await perform(async () => {
    await operations.saveRegisterSettings(id, input);
    notify("Controles operativos actualizados.");
  });
}

async function saveProduct(input: ProductInput, id?: string) {
  await perform(async () => {
    await operations.saveProduct(input, id);
    catalogResetKey.value += 1;
    notify(id ? "Producto actualizado." : "Producto creado y listo para el catálogo.");
  });
}

async function startNextShift() {
  operations.clearReport();
  await operations.bootstrap();
  view.value = "sale";
}

function goHome() {
  if (session.user) {
    view.value = defaultView(session.user.role);
    void focusPageTop("main-content");
  }
}

async function refreshFinance() {
  await perform(async () => {
    await operations.loadFinanceOverview();
    notify("Vista financiera actualizada.");
  });
}

function signOut() {
  operations.reset();
  session.logout();
  view.value = "sale";
}
</script>

<template>
  <a class="skip-link" :href="session.user ? '#main-content' : '#login-content'">Saltar al contenido principal</a>
  <section v-if="!session.user" class="login-page">
    <main id="login-content" class="login-main" tabindex="-1">
      <div class="posflow-logo dark"><span>POS</span><b>FLOW</b></div>
      <p class="eyebrow">Demostración ficticia · Control de efectivo</p>
      <h1>La operación corre.<br /><em>El dinero cuadra.</em></h1>
      <p class="login-copy">Venta, custodia y conciliación conectadas en un mismo libro operativo.</p>
      <fieldset class="role-picker">
        <legend>Explorar responsabilidades</legend>
        <button v-for="role in (['CASHIER', 'SUPERVISOR', 'ADMIN', 'FINANCE'] as Role[])" :key="role" type="button" :class="{ selected: selectedRole === role }" :aria-pressed="selectedRole === role" @click="selectedRole = role"><b>{{ roleLabel[role] }}</b><small>{{ role === 'CASHIER' ? 'Abre, vende y cierra' : role === 'SUPERVISOR' ? 'Opera y resuelve' : role === 'ADMIN' ? 'Configura y custodia' : 'Concilia saldos' }}</small></button>
      </fieldset>
      <fieldset v-if="selectedRole === 'CASHIER' || selectedRole === 'SUPERVISOR'" class="store-picker">
        <legend>Selecciona la sucursal operativa</legend>
        <button type="button" :class="{ selected: selectedStoreCode === 'ROMA' }" :aria-pressed="selectedStoreCode === 'ROMA'" @click="selectedStoreCode = 'ROMA'"><b>Lucerna Roma</b><small>{{ selectedRole === 'CASHIER' ? 'Luz Navarro · 2 cajas' : 'Mateo Santos · Supervisor' }}</small></button>
        <button type="button" :class="{ selected: selectedStoreCode === 'CENTRO' }" :aria-pressed="selectedStoreCode === 'CENTRO'" @click="selectedStoreCode = 'CENTRO'"><b>Lucerna Centro</b><small>{{ selectedRole === 'CASHIER' ? 'Camila Vega · 1 caja' : 'Diego Serrano · Supervisor' }}</small></button>
      </fieldset>
      <button class="primary wide" :disabled="session.loading" @click="session.demoLogin(selectedRole, selectedStoreCode)">{{ session.loading ? "Abriendo PosFlow…" : `Entrar como ${roleLabel[selectedRole].toLowerCase()}` }} <span>→</span></button>
      <p v-if="session.error" class="form-error" role="alert">{{ session.error }}</p>
      <small class="demo-note">Sin registro · Sin dinero real · Datos ficticios</small>
    </main>
    <div class="login-visual" aria-hidden="true">
      <div class="visual-top"><span>ROMA / CAJA 01</span><b>EN OPERACIÓN</b></div>
      <div class="visual-number">02<span>24</span></div>
      <div class="receipt-card"><p>ÚLTIMA VENTA</p><strong>$642.00</strong><small>ROMA-CAJA-01-000128</small><div><span>EFECTIVO</span><b>+$642.00</b></div></div>
      <div class="balance-card"><small>EFECTIVO EN CAJÓN</small><strong>$4,892</strong><div><i style="width: 72%"></i></div><span>72% del límite</span></div>
      <div class="bundle-card"><span>▰</span><div><small>RETIRO SELLADO</small><strong>FJ-8A42C19D</strong></div><b>−$2,000</b></div>
      <p class="visual-caption">Cada movimiento deja rastro.<br />Ningún ajuste ocurre en silencio.</p>
    </div>
  </section>

  <div v-else class="app-shell">
    <header class="topbar">
      <button class="posflow-logo logo-button" aria-label="Ir al inicio del rol" @click="goHome"><span>POS</span><b>FLOW</b></button>
      <div class="location-chip"><small>{{ session.user.store ? 'TIENDA ACTUAL' : 'OPERACIÓN GLOBAL' }}</small><strong>{{ session.user.store?.name || session.user.business.name }}</strong></div>
      <nav class="topnav" aria-label="Navegación principal">
        <button v-if="canSell && operations.shift?.status === 'OPEN'" type="button" :class="{ active: view === 'sale' }" :aria-current="view === 'sale' ? 'page' : undefined" @click="view = 'sale'">Venta</button>
        <button v-if="canOperateRemittances && operations.shift?.status === 'OPEN'" type="button" :class="{ active: view === 'remittances' }" :aria-current="view === 'remittances' ? 'page' : undefined" @click="view = 'remittances'">Remesas <b>{{ operations.remittances.filter(item => item.status === 'AVAILABLE' && item.destinationStore.id === operations.shift?.register.store.id).length }}</b></button>
        <button v-if="canOperateAdvances && operations.shift?.status === 'OPEN'" type="button" :class="{ active: view === 'advances' }" :aria-current="view === 'advances' ? 'page' : undefined" @click="view = 'advances'">Anticipos <b>{{ operations.advances.filter(item => item.store.id === operations.shift?.register.store.id && ['AUTHORIZED', 'OPEN', 'PARTIALLY_SETTLED'].includes(item.status)).length }}</b></button>
        <button v-if="canManageBundles && operations.shift?.status === 'OPEN'" type="button" :class="{ active: view === 'bundles' }" :aria-current="view === 'bundles' ? 'page' : undefined" @click="view = 'bundles'">Fajillas <b>{{ operations.shift.cashBundles.length }}</b></button>
        <button v-if="canReviewClosures" type="button" :class="{ active: view === 'exceptions' }" :aria-current="view === 'exceptions' ? 'page' : undefined" @click="view = 'exceptions'; operations.loadExceptions()">Excepciones <b v-if="operations.pendingReviews.length">{{ operations.pendingReviews.length }}</b></button>
        <button v-if="canOpenAndClose && operations.shift" type="button" :class="{ active: view === 'close' }" :aria-current="view === 'close' ? 'page' : undefined" @click="view = 'close'">Corte</button>
        <button v-if="session.user.role === 'ADMIN'" type="button" :class="{ active: view === 'catalog' }" :aria-current="view === 'catalog' ? 'page' : undefined" @click="view = 'catalog'">Productos</button>
        <button v-if="session.user.role === 'ADMIN'" type="button" :class="{ active: view === 'settings' }" :aria-current="view === 'settings' ? 'page' : undefined" @click="view = 'settings'">Controles</button>
        <button v-if="canManageAdvances" type="button" :class="{ active: view === 'finance' }" :aria-current="view === 'finance' ? 'page' : undefined" @click="view = 'finance'; operations.loadFinanceOverview()">Finanzas</button>
        <button v-if="canManageAdvances" type="button" :class="{ active: view === 'finance-advances' }" :aria-current="view === 'finance-advances' ? 'page' : undefined" @click="view = 'finance-advances'">Anticipos <b>{{ operations.financeOverview?.totals.openAdvanceCount || 0 }}</b></button>
      </nav>
      <button class="profile" type="button" :aria-label="`Cerrar sesión. Usuario ${session.user.name}`" @click="signOut"><span class="avatar">{{ session.user.name.split(' ').map((name) => name[0]).join('') }}</span><span><strong>{{ session.user.name }}</strong><small>{{ roleLabel[session.user.role] }} · Cambiar rol</small></span><b>↗</b></button>
    </header>

    <main id="main-content" tabindex="-1">
      <div v-if="operations.loading" class="loading-screen" role="status"><span></span><p>Preparando la operación…</p></div>
      <div v-else-if="operations.error" class="error-screen" role="alert"><span>!</span><h1>No pudimos cargar PosFlow</h1><p>{{ operations.error }}</p><button @click="operations.bootstrap">Intentar de nuevo</button></div>
      <ReportPanel v-else-if="operations.report" :report="operations.report" :can-open-next="canOpenAndClose" @next="startNextShift" />
      <FinanceDashboardPanel v-else-if="view === 'finance' && canManageAdvances && operations.financeOverview" :overview="operations.financeOverview" :busy="busy" @refresh="refreshFinance" @advances="view = 'finance-advances'" />
      <div v-else-if="view === 'finance' && canManageAdvances" class="loading-screen" role="status"><span></span><p>Consolidando saldos financieros…</p></div>
      <AdvanceFinancePanel v-else-if="view === 'finance-advances' && canManageAdvances" :advances="operations.advances" :stores="operations.advanceStores" :busy="busy" :reset-key="advanceResetKey" @create="createAdvance" @proof="proveAdvance" />
      <CatalogAdminPanel v-else-if="view === 'catalog' && session.user.role === 'ADMIN'" :products="operations.products" :categories="operations.categories" :busy="busy" :reset-key="catalogResetKey" @save="saveProduct" />
      <SettingsPanel v-else-if="view === 'settings' && session.user.role === 'ADMIN'" :registers="operations.settingsRegisters" :busy="busy" @save="saveRegisterSettings" />
      <ExceptionsPanel v-else-if="view === 'exceptions' && canReviewClosures" :shifts="operations.pendingReviews" :active-shift="operations.shift" :can-manage-bundles="canManageBundles" :busy="busy" @approve="approveClose" @bundles="view = 'bundles'" />
      <OpeningPanel v-else-if="canOpenAndClose && !operations.shift" :registers="operations.registers" :busy="busy" @open="openShift" />
      <template v-else-if="operations.shift">
        <header class="operation-header">
          <div><p class="eyebrow">{{ operations.shift.register.store.name }} / {{ operations.shift.register.code }}</p><h1>{{ view === 'sale' ? 'Punto de venta' : view === 'remittances' ? 'Servicio de remesas' : view === 'advances' ? 'Control de anticipos' : view === 'bundles' ? 'Custodia de efectivo' : 'Cierre de caja' }}</h1><p>Turno abierto por {{ operations.shift.cashier.name }} · {{ new Date(operations.shift.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }}</p><p v-if="operations.shift.cashier.id !== session.user.id" class="operator-note">Operando ahora: {{ session.user.name }} · {{ roleLabel[session.user.role] }}</p></div>
          <div class="shift-controls"><span class="shift-status" :class="{ review: operations.shift.status === 'PENDING_REVIEW' }"><i></i>{{ operations.shift.status === 'PENDING_REVIEW' ? 'Pendiente de revisión' : 'Turno abierto' }}</span><span class="drawer-chip" :class="{ warning: drawerPercent >= 80 }">Cajón {{ drawerPercent }}%</span></div>
        </header>
        <section class="cash-strip" aria-label="Resumen del turno"><article><small>Fondo inicial</small><strong>{{ formatCurrency(operations.shift.openingFloatCents) }}</strong></article><article><small>Ventas en efectivo</small><strong>{{ formatCurrency(cashSalesCents) }}</strong></article><article><small>Fajillas selladas</small><strong>−{{ formatCurrency(sealedBundleCents) }}</strong></article><article class="expected"><small>Efectivo / límite</small><strong>{{ formatCurrency(operations.shift.expectedCashCents) }}</strong><span>{{ formatCurrency(operations.shift.register.cashLimitCents) }}</span></article></section>
        <SalePanel v-if="view === 'sale' && canSell && operations.shift.status === 'OPEN'" :products="operations.products.filter(product => product.active)" :busy="busy" :reset-key="saleResetKey" :expected-cash-cents="operations.shift.expectedCashCents" :cash-limit-cents="operations.shift.register.cashLimitCents" :can-manage-bundles="canManageBundles" @checkout="completeSale" @bundles="view = 'bundles'" />
        <RemittancePanel v-else-if="view === 'remittances' && canOperateRemittances && operations.shift.status === 'OPEN'" :current-store-id="operations.shift.register.store.id" :destinations="operations.remittanceStores" :remittances="operations.remittances" :busy="busy" :reset-key="remittanceResetKey" @send="sendRemittance" @pay="payRemittance" />
        <AdvanceCashPanel v-else-if="view === 'advances' && canOperateAdvances && operations.shift.status === 'OPEN'" :advances="operations.advances" :current-store-id="operations.shift.register.store.id" :expected-cash-cents="operations.shift.expectedCashCents" :user-role="session.user.role" :busy="busy" :reset-key="advanceResetKey" @issue="issueAdvance" @cash-return="returnAdvanceCash" />
        <CashBundlePanel v-else-if="view === 'bundles' && canManageBundles && operations.shift.status === 'OPEN'" :bundles="operations.shift.cashBundles" :expected-cash-cents="operations.shift.expectedCashCents" :busy="busy" :reset-key="bundleResetKey" @create="createBundle" @update="updateBundle" @seal="sealBundle" />
        <ClosePanel v-else-if="view === 'close' && canOpenAndClose" :busy="busy" :pending-review="operations.shift.status === 'PENDING_REVIEW'" @close="closeShift" />
      </template>
    </main>

    <p v-if="error" class="toast error-toast" role="alert"><span>!</span>{{ error }}<button aria-label="Cerrar alerta" @click="error = ''">×</button></p>
    <p v-if="toast" class="toast success-toast" role="status" aria-live="polite"><span>✓</span>{{ toast }}</p>
  </div>
</template>
