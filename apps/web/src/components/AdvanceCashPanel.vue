<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { advanceOutstandingCents } from "../lib/advances";
import { formatCurrency, moneyInputToCents } from "../lib/money";
import type { Advance, Role } from "../types";

const props = defineProps<{ advances: Advance[]; currentStoreId: string; expectedCashCents: number; userRole: Role; busy?: boolean; resetKey: number }>();
const emit = defineEmits<{
  issue: [id: string];
  cashReturn: [id: string, amountCents: number, description: string];
}>();

const returnAdvanceId = ref("");
const returnAmount = ref("");
const returnDescription = ref("");
const error = ref("");
const localAdvances = computed(() => props.advances.filter((item) => item.store.id === props.currentStoreId));
const authorized = computed(() => localAdvances.value.filter((item) => item.status === "AUTHORIZED"));
const accountable = computed(() => localAdvances.value.filter((item) => ["OPEN", "PARTIALLY_SETTLED", "SETTLED"].includes(item.status)));

watch(() => props.resetKey, () => {
  returnAdvanceId.value = "";
  returnAmount.value = "";
  returnDescription.value = "";
  error.value = "";
});

function outstanding(item: Advance) {
  return advanceOutstandingCents(item);
}

function roleName(role: Role) {
  return ({ ADMIN: "Administrador", FINANCE: "Finanzas", SUPERVISOR: "Supervisor", CASHIER: "Cajero" } as const)[role];
}

function registerReturn(item: Advance) {
  const amountCents = moneyInputToCents(returnAmount.value);
  error.value = "";
  if (amountCents === null || amountCents <= 0) error.value = "Ingresa el efectivo que regresa al cajón.";
  else if (amountCents > outstanding(item)) error.value = "La devolución supera el saldo pendiente.";
  else if (returnDescription.value.trim().length < 3) error.value = "Describe por qué regresa el efectivo.";
  else emit("cashReturn", item.id, amountCents, returnDescription.value.trim());
}
</script>

<template>
  <section class="advance-cash-page">
    <div class="advance-cash-intro"><div><p class="eyebrow">Anticipos autorizados</p><h2>El efectivo sale con propósito y vuelve con evidencia.</h2><p>Caja entrega únicamente autorizaciones de Finanzas. Las comprobaciones no cambian el cajón; las devoluciones en efectivo sí.</p></div><div class="advance-flow"><span>1 · AUTORIZA</span><i>→</i><span>2 · ENTREGA</span><i>→</i><span>3 · LIQUIDA</span></div></div>
    <div class="advance-cash-layout">
      <section class="panel-card authorized-advances"><div class="section-head"><div><p class="eyebrow">Lista para entrega</p><h2>Autorizaciones</h2></div><span>{{ authorized.length }}</span></div>
        <div v-if="authorized.length" class="cash-advance-rows"><article v-for="item in authorized" :key="item.id"><div class="advance-row-head"><div><strong>{{ item.reference }}</strong><small>{{ item.recipientType === 'EMPLOYEE' ? 'Empleado' : 'Proveedor' }}</small></div><span class="advance-status authorized">Autorizado</span></div><h3>{{ item.recipientName }}</h3><p>{{ item.purpose }}</p><div class="authorized-total"><span>Entregar desde el cajón</span><strong>{{ formatCurrency(item.amountCents) }}</strong></div><small>Fecha límite {{ new Date(item.dueDate).toLocaleDateString('es-MX') }} · {{ item.authorizedBy.name }}</small><p v-if="item.amountCents > expectedCashCents" class="cash-warning">Efectivo esperado insuficiente: hay {{ formatCurrency(expectedCashCents) }}.</p><button class="primary wide" type="button" :disabled="busy || item.amountCents > expectedCashCents" @click="$emit('issue', item.id)">Entregar anticipo →</button></article></div>
        <div v-else class="list-empty"><span>✓</span><h3>Sin entregas pendientes</h3><p>Finanzas aún no ha autorizado nuevos anticipos.</p></div>
      </section>
      <section class="panel-card accountable-advances"><div class="section-head"><div><p class="eyebrow">Rendición</p><h2>Seguimiento y devoluciones</h2></div><span>{{ accountable.length }}</span></div>
        <div v-if="accountable.length" class="cash-advance-rows"><article v-for="item in accountable" :key="item.id"><div class="advance-row-head"><div><strong>{{ item.reference }}</strong><small>{{ item.recipientName }}</small></div><span class="advance-status" :class="item.status.toLowerCase()">{{ item.status === 'SETTLED' ? 'Liquidado' : item.status === 'PARTIALLY_SETTLED' ? 'Parcial' : 'Abierto' }}</span></div><p>{{ item.purpose }}</p><dl><div><dt>Entregado</dt><dd>{{ formatCurrency(item.amountCents) }}</dd></div><div><dt>Comprobado</dt><dd>{{ formatCurrency(item.proofCents) }}</dd></div><div><dt>Devuelto</dt><dd>{{ formatCurrency(item.returnedCents) }}</dd></div><div><dt>Pendiente</dt><dd>{{ formatCurrency(outstanding(item)) }}</dd></div></dl><button v-if="item.status !== 'SETTLED'" class="secondary proof-toggle cash-return-toggle" type="button" @click="returnAdvanceId = returnAdvanceId === item.id ? '' : item.id; error = ''">{{ returnAdvanceId === item.id ? 'Cancelar devolución' : userRole === 'SUPERVISOR' ? 'Cuadrar devolución con caja →' : 'Recibir efectivo sobrante →' }}</button><form v-if="returnAdvanceId === item.id" class="proof-form" @submit.prevent="registerReturn(item)"><label>Efectivo devuelto<div class="money-input"><span>$</span><input v-model="returnAmount" inputmode="decimal" placeholder="0.00" /></div></label><label>Motivo<input v-model="returnDescription" maxlength="240" placeholder="Sobrante de compra" /></label><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="primary" type="submit" :disabled="busy">{{ userRole === 'SUPERVISOR' ? 'Confirmar cuadre' : 'Ingresar al cajón' }}</button></form><div v-if="item.settlements.length" class="settlement-history"><small v-for="entry in item.settlements.slice(0, 3)" :key="entry.id" :class="entry.type === 'EXPENSE_PROOF' ? 'proof-entry' : 'return-entry'"><span><b>{{ entry.type === 'EXPENSE_PROOF' ? 'COMPROBANTE' : 'DEVOLUCIÓN' }}</b><strong>{{ formatCurrency(entry.amountCents) }}</strong></span><span>{{ entry.description }} · {{ entry.createdBy.name }} ({{ roleName(entry.createdBy.role) }}) · {{ new Date(entry.createdAt).toLocaleDateString('es-MX') }}</span></small></div></article></div>
        <div v-else class="list-empty"><span>↙</span><h3>Sin anticipos entregados</h3><p>Cuando Caja entregue uno aparecerá aquí.</p></div>
      </section>
    </div>
  </section>
</template>
