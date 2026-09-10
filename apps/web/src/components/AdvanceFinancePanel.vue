<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { advanceOutstandingCents, advanceProgressPercent } from "../lib/advances";
import { formatCurrency, moneyInputToCents } from "../lib/money";
import type { Advance, AdvanceInput, Role, StoreSummary } from "../types";

const props = defineProps<{ advances: Advance[]; stores: StoreSummary[]; busy?: boolean; resetKey: number }>();
const emit = defineEmits<{
  create: [input: AdvanceInput];
  proof: [id: string, amountCents: number, description: string];
}>();

const storeId = ref("");
const recipientType = ref<"EMPLOYEE" | "VENDOR">("EMPLOYEE");
const recipientName = ref("");
const purpose = ref("");
const amount = ref("");
const dueDate = ref("");
const proofAdvanceId = ref("");
const proofAmount = ref("");
const proofDescription = ref("");
const error = ref("");

const today = new Date().toISOString().slice(0, 10);
const active = computed(() => props.advances.filter((item) => item.status !== "CANCELLED"));
const authorizedCount = computed(() => active.value.filter((item) => item.status === "AUTHORIZED").length);
const outstandingCents = computed(() => active.value.reduce((sum, item) => sum + advanceOutstandingCents(item), 0));
const overdueCount = computed(() => active.value.filter((item) => ["OPEN", "PARTIALLY_SETTLED"].includes(item.status) && new Date(item.dueDate).getTime() < Date.now()).length);

watch(() => props.stores, (stores) => {
  if (storeId.value && !stores.some((store) => store.id === storeId.value)) storeId.value = "";
}, { immediate: true });

watch(() => props.resetKey, () => {
  recipientName.value = "";
  purpose.value = "";
  amount.value = "";
  dueDate.value = "";
  proofAdvanceId.value = "";
  proofAmount.value = "";
  proofDescription.value = "";
  error.value = "";
});

function outstanding(item: Advance) {
  return advanceOutstandingCents(item);
}

function statusLabel(status: Advance["status"]) {
  return ({ AUTHORIZED: "Autorizado", OPEN: "Abierto", PARTIALLY_SETTLED: "Parcial", SETTLED: "Liquidado", CANCELLED: "Cancelado" } as const)[status];
}

function roleName(role: Role) {
  return ({ ADMIN: "Administrador", FINANCE: "Finanzas", SUPERVISOR: "Supervisor", CASHIER: "Cajero" } as const)[role];
}

function authorize() {
  const amountCents = moneyInputToCents(amount.value);
  error.value = "";
  if (!storeId.value) error.value = "Selecciona la tienda responsable de entregar el efectivo.";
  else if (recipientName.value.trim().length < 2) error.value = "Ingresa el nombre de quien recibirá el anticipo.";
  else if (purpose.value.trim().length < 8) error.value = "Describe el propósito operativo del anticipo.";
  else if (amountCents === null || amountCents <= 0) error.value = "Ingresa un importe válido.";
  else if (!dueDate.value || dueDate.value < today) error.value = "Selecciona una fecha límite válida.";
  else emit("create", {
    storeId: storeId.value,
    recipientType: recipientType.value,
    recipientName: recipientName.value.trim(),
    purpose: purpose.value.trim(),
    amountCents,
    dueDate: new Date(`${dueDate.value}T12:00:00`).toISOString()
  });
}

function registerProof() {
  const amountCents = moneyInputToCents(proofAmount.value);
  const selected = props.advances.find((item) => item.id === proofAdvanceId.value);
  error.value = "";
  if (!selected) error.value = "Selecciona el anticipo que vas a comprobar.";
  else if (amountCents === null || amountCents <= 0) error.value = "Ingresa el importe comprobado.";
  else if (amountCents > outstanding(selected)) error.value = "La comprobación no puede superar el saldo pendiente.";
  else if (proofDescription.value.trim().length < 3) error.value = "Describe el comprobante o gasto respaldado.";
  else emit("proof", selected.id, amountCents, proofDescription.value.trim());
}
</script>

<template>
  <section class="advance-finance-page">
    <header class="finance-command-head">
      <div><p class="eyebrow">Finanzas · Control de anticipos</p><h1>Autorizar no es perder el rastro.</h1><p>Cada peso entregado termina respaldado por comprobantes, una devolución de efectivo o ambos.</p></div>
      <div class="advance-metrics"><article><small>POR ENTREGAR</small><strong>{{ authorizedCount }}</strong></article><article><small>SALDO PENDIENTE</small><strong>{{ formatCurrency(outstandingCents) }}</strong></article><article :class="{ warning: overdueCount }"><small>VENCIDOS</small><strong>{{ overdueCount }}</strong></article></div>
    </header>

    <div class="advance-finance-layout">
      <form class="panel-card advance-authorize-form" @submit.prevent="authorize">
        <div class="section-head"><div><p class="eyebrow">Nueva autorización</p><h2>Preparar anticipo</h2></div><span class="network-pill">SIN MOVIMIENTO DE CAJA</span></div>
        <p class="muted">Finanzas autoriza el monto; el efectivo sólo cambia cuando una caja lo entrega.</p>
        <div class="form-grid two">
          <label>Tipo de receptor<select v-model="recipientType"><option value="EMPLOYEE">Empleado</option><option value="VENDOR">Proveedor</option></select></label>
          <label>Receptor<input v-model="recipientName" required maxlength="100" placeholder="Nombre completo o razón social" /></label>
          <label>Tienda que entregará<select v-model="storeId" required><option disabled value="">Selecciona tienda</option><option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }} · {{ store.city }}</option></select><small class="field-hint">La caja sólo verá anticipos de su propia sucursal. Para probar con Luz Navarro, selecciona Lucerna Roma.</small></label>
          <label>Importe<div class="money-input"><span>$</span><input v-model="amount" required inputmode="decimal" placeholder="0.00" /></div></label>
          <label class="span-two">Propósito<textarea v-model="purpose" required maxlength="240" rows="3" placeholder="¿Para qué operación se entrega este dinero?"></textarea></label>
          <label>Fecha límite<input v-model="dueDate" required type="date" :min="today" /></label>
        </div>
        <p v-if="error && !proofAdvanceId" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" type="submit" :disabled="busy">{{ busy ? 'Autorizando…' : 'Autorizar anticipo →' }}</button>
      </form>

      <section class="panel-card advance-tracker">
        <div class="section-head"><div><p class="eyebrow">Seguimiento</p><h2>Expedientes activos</h2></div><span>{{ active.length }}</span></div>
        <div class="advance-legend" aria-label="Leyenda de estados"><span class="advance-status authorized">Autorizado</span><span class="advance-status open">Abierto</span><span class="advance-status partially_settled">Parcial</span><span class="advance-status settled">Liquidado</span></div>
        <div v-if="active.length" class="advance-rows">
          <article v-for="item in active" :key="item.id" :class="{ selected: proofAdvanceId === item.id }">
            <div class="advance-row-head"><div><strong>{{ item.reference }}</strong><small>{{ item.store.name }} ({{ item.store.code }}) · {{ item.recipientType === 'EMPLOYEE' ? 'Empleado' : 'Proveedor' }}</small></div><span class="advance-status" :class="item.status.toLowerCase()">{{ statusLabel(item.status) }}</span></div>
            <h3>{{ item.recipientName }}</h3><p>{{ item.purpose }}</p>
            <div class="advance-progress" role="progressbar" :aria-label="`Progreso de liquidación del anticipo ${item.reference}`" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="advanceProgressPercent(item)"><i :style="{ width: `${advanceProgressPercent(item)}%` }"></i></div>
            <dl><div><dt>Autorizado</dt><dd>{{ formatCurrency(item.amountCents) }}</dd></div><div><dt>Comprobado</dt><dd>{{ formatCurrency(item.proofCents) }}</dd></div><div><dt>Devuelto</dt><dd>{{ formatCurrency(item.returnedCents) }}</dd></div><div><dt>Pendiente</dt><dd>{{ formatCurrency(outstanding(item)) }}</dd></div></dl>
            <small class="advance-due">Límite {{ new Date(item.dueDate).toLocaleDateString('es-MX') }} · autorizado por {{ item.authorizedBy.name }}</small>
            <button v-if="['OPEN', 'PARTIALLY_SETTLED'].includes(item.status)" class="secondary proof-toggle proof-register-toggle" type="button" @click="proofAdvanceId = proofAdvanceId === item.id ? '' : item.id; error = ''">{{ proofAdvanceId === item.id ? 'Cancelar comprobación' : 'Registrar comprobación →' }}</button>
            <form v-if="proofAdvanceId === item.id" class="proof-form" @submit.prevent="registerProof"><label>Importe comprobado<div class="money-input"><span>$</span><input v-model="proofAmount" inputmode="decimal" placeholder="0.00" /></div></label><label>Documento o gasto<input v-model="proofDescription" maxlength="240" placeholder="Factura de insumos F-1842" /></label><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="primary" type="submit" :disabled="busy">Aplicar comprobación</button></form>
            <div v-if="item.settlements.length" class="settlement-history"><small v-for="entry in item.settlements.slice(0, 3)" :key="entry.id" :class="entry.type === 'EXPENSE_PROOF' ? 'proof-entry' : 'return-entry'"><span><b>{{ entry.type === 'EXPENSE_PROOF' ? 'COMPROBANTE' : 'DEVOLUCIÓN' }}</b><strong>{{ formatCurrency(entry.amountCents) }}</strong></span><span>{{ entry.description }} · {{ entry.createdBy.name }} ({{ roleName(entry.createdBy.role) }}) · {{ new Date(entry.createdAt).toLocaleDateString('es-MX') }}</span></small></div>
          </article>
        </div>
        <div v-else class="list-empty"><span>✓</span><h3>Sin anticipos</h3><p>Autoriza el primero para iniciar su seguimiento.</p></div>
      </section>
    </div>
  </section>
</template>
