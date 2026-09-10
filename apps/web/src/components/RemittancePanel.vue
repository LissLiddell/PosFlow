<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { formatCurrency, moneyInputToCents } from "../lib/money";
import { calculateRemittanceFeePreview } from "../lib/remittances";
import type { Remittance, RemittanceSendInput, StoreSummary } from "../types";

const props = defineProps<{
  currentStoreId: string;
  destinations: StoreSummary[];
  remittances: Remittance[];
  busy?: boolean;
  resetKey: number;
}>();
const emit = defineEmits<{
  send: [input: RemittanceSendInput];
  pay: [reference: string, beneficiaryDocumentCode: string];
}>();

const mode = ref<"send" | "pay">("send");
const destinationStoreId = ref("");
const senderName = ref("");
const senderPhone = ref("");
const beneficiaryName = ref("");
const beneficiaryDocumentCode = ref("");
const amount = ref("");
const payoutReference = ref("");
const payoutCode = ref("");
const error = ref("");

const amountCents = computed(() => moneyInputToCents(amount.value) ?? 0);
const feeCents = computed(() => calculateRemittanceFeePreview(amountCents.value));
const totalCents = computed(() => amountCents.value + feeCents.value);
const incoming = computed(() => props.remittances.filter((item) => item.destinationStore.id === props.currentStoreId && item.status === "AVAILABLE"));
const demoIncoming = computed(() => incoming.value.find((item) => item.reference === "RM-DEMO2026"));

watch(() => props.destinations, (stores) => {
  if (!stores.some((store) => store.id === destinationStoreId.value)) destinationStoreId.value = stores[0]?.id ?? "";
}, { immediate: true });

watch(() => props.resetKey, () => {
  senderName.value = "";
  senderPhone.value = "";
  beneficiaryName.value = "";
  beneficiaryDocumentCode.value = "";
  amount.value = "";
  payoutReference.value = "";
  payoutCode.value = "";
  error.value = "";
});

function send() {
  const cents = moneyInputToCents(amount.value);
  error.value = "";
  if (!destinationStoreId.value) error.value = "Selecciona la sucursal donde se cobrará la remesa.";
  else if (senderName.value.trim().length < 2) error.value = "Ingresa el nombre del remitente.";
  else if (senderPhone.value && !/^[0-9+() -]{7,20}$/.test(senderPhone.value)) error.value = "Ingresa un teléfono válido.";
  else if (beneficiaryName.value.trim().length < 2) error.value = "Ingresa el nombre del beneficiario.";
  else if (!/^\d{4}$/.test(beneficiaryDocumentCode.value)) error.value = "La validación del beneficiario debe contener 4 dígitos.";
  else if (cents === null || cents < 10_000 || cents > 2_000_000) error.value = "El importe debe estar entre $100 y $20,000.";
  else emit("send", {
    destinationStoreId: destinationStoreId.value,
    senderName: senderName.value.trim(),
    senderPhone: senderPhone.value.trim(),
    beneficiaryName: beneficiaryName.value.trim(),
    beneficiaryDocumentCode: beneficiaryDocumentCode.value,
    amountCents: cents
  });
}

function pay() {
  error.value = "";
  if (!payoutReference.value.trim()) error.value = "Ingresa la referencia de la remesa.";
  else if (!/^\d{4}$/.test(payoutCode.value)) error.value = "La validación del beneficiario debe contener 4 dígitos.";
  else emit("pay", payoutReference.value.trim().toUpperCase(), payoutCode.value);
}

async function selectTab(nextMode: "send" | "pay", moveFocus = false) {
  mode.value = nextMode;
  error.value = "";
  if (moveFocus) {
    await nextTick();
    document.getElementById(`remittance-tab-${nextMode}`)?.focus();
  }
}
</script>

<template>
  <section class="remittance-page">
    <div class="remittance-intro">
      <div><p class="eyebrow">Red de remesas</p><h2>Enviar y pagar sin mezclar el fondeo con el cajón.</h2><p>El efectivo físico y la liquidación de la red dejan movimientos independientes dentro de la misma operación.</p></div>
      <div class="remittance-tabs" role="tablist" aria-label="Tipo de operación de remesa"><button id="remittance-tab-send" type="button" role="tab" :class="{ active: mode === 'send' }" :aria-selected="mode === 'send'" aria-controls="remittance-panel-send" :tabindex="mode === 'send' ? 0 : -1" @click="selectTab('send')" @keydown.right.prevent="selectTab('pay', true)" @keydown.left.prevent="selectTab('pay', true)">Enviar dinero</button><button id="remittance-tab-pay" type="button" role="tab" :class="{ active: mode === 'pay' }" :aria-selected="mode === 'pay'" aria-controls="remittance-panel-pay" :tabindex="mode === 'pay' ? 0 : -1" @click="selectTab('pay')" @keydown.right.prevent="selectTab('send', true)" @keydown.left.prevent="selectTab('send', true)">Pagar remesa <b>{{ incoming.length }}</b></button></div>
    </div>

    <div class="remittance-layout">
      <form v-if="mode === 'send'" id="remittance-panel-send" class="panel-card remittance-form" role="tabpanel" aria-labelledby="remittance-tab-send" @submit.prevent="send">
        <div class="section-head"><div><p class="eyebrow">Nueva operación</p><h2>Envío de remesa</h2></div><span class="network-pill">ENTRADA DE CAJA</span></div>
        <div class="form-grid two">
          <label>Remitente<input v-model="senderName" required maxlength="80" placeholder="Nombre completo" /></label>
          <label>Teléfono<input v-model="senderPhone" inputmode="tel" maxlength="20" placeholder="55 0000 0000" @input="senderPhone = senderPhone.replace(/[^0-9+() -]/g, '').slice(0, 20)" /></label>
          <label>Beneficiario<input v-model="beneficiaryName" required maxlength="80" placeholder="Nombre completo" /></label>
          <label>Últimos 4 de identificación<input v-model="beneficiaryDocumentCode" required inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="0000" @input="beneficiaryDocumentCode = beneficiaryDocumentCode.replace(/\D/g, '').slice(0, 4)" /></label>
          <label>Sucursal de pago<select v-model="destinationStoreId" required><option disabled value="">Selecciona destino</option><option v-for="store in destinations" :key="store.id" :value="store.id">{{ store.name }} · {{ store.city }}</option></select></label>
          <label>Importe a enviar<div class="money-input"><span>$</span><input v-model="amount" required inputmode="decimal" placeholder="0.00" /></div></label>
        </div>
        <div class="remittance-quote"><div><small>Principal</small><strong>{{ formatCurrency(amountCents) }}</strong></div><span>+</span><div><small>Comisión</small><strong>{{ formatCurrency(feeCents) }}</strong></div><span>=</span><div class="total"><small>Total a recibir</small><strong>{{ formatCurrency(totalCents) }}</strong></div></div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" type="submit" :disabled="busy || !destinations.length">{{ busy ? 'Registrando…' : 'Recibir efectivo y generar referencia →' }}</button>
      </form>

      <form v-else id="remittance-panel-pay" class="panel-card remittance-form" role="tabpanel" aria-labelledby="remittance-tab-pay" @submit.prevent="pay">
        <div class="section-head"><div><p class="eyebrow">Entrega protegida</p><h2>Pago al beneficiario</h2></div><span class="network-pill payout">SALIDA DE CAJA</span></div>
        <p class="muted">La referencia sólo puede pagarse una vez y debe pertenecer a esta sucursal.</p>
        <label>Referencia<input v-model="payoutReference" required maxlength="40" placeholder="RM-XXXXXXXXXX" /></label>
        <label>Últimos 4 de identificación<input v-model="payoutCode" required inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="0000" @input="payoutCode = payoutCode.replace(/\D/g, '').slice(0, 4)" /></label>
        <div v-if="demoIncoming" class="demo-credential"><span>DEMO</span><p><strong>Remesa entrante lista</strong>Referencia <b>{{ demoIncoming.reference }}</b> · código <b>4821</b> · {{ formatCurrency(demoIncoming.amountCents) }}</p><button type="button" @click="payoutReference = demoIncoming.reference; payoutCode = '4821'">Usar datos</button></div>
        <div v-else class="demo-credential complete"><span>✓</span><p><strong>La remesa demo ya fue pagada</strong>El segundo intento queda bloqueado y la trazabilidad conserva su estado final.</p></div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" type="submit" :disabled="busy">{{ busy ? 'Validando…' : 'Validar identidad y pagar →' }}</button>
      </form>

      <aside class="panel-card remittance-history">
        <div class="section-head"><div><p class="eyebrow">Trazabilidad</p><h2>Operaciones recientes</h2></div><span>{{ remittances.length }}</span></div>
        <div v-if="remittances.length" class="remittance-rows">
          <article v-for="item in remittances" :key="item.id">
            <div><strong>{{ item.reference }}</strong><small>{{ item.originStore.code }} → {{ item.destinationStore.code }}</small></div>
            <div><span>{{ item.beneficiaryName }}</span><small>{{ item.status === 'PAID' ? 'Pagada' : item.status === 'AVAILABLE' ? 'Disponible' : item.status }}</small></div>
            <b>{{ formatCurrency(item.amountCents) }}</b>
          </article>
        </div>
        <div v-else class="list-empty"><span>↗</span><h3>Sin operaciones</h3><p>Los envíos y pagos aparecerán aquí.</p></div>
      </aside>
    </div>
  </section>
</template>
