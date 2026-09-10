<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { DENOMINATIONS, formatCurrency } from "../lib/money";
import type { CashBundle, CashLine } from "../types";

const props = defineProps<{ bundles: CashBundle[]; expectedCashCents: number; busy?: boolean; resetKey: number }>();
const emit = defineEmits<{
  create: [lines: CashLine[]];
  update: [id: string, lines: CashLine[]];
  seal: [id: string];
}>();

const quantities = ref<Record<number, number>>({});
const editingId = ref("");
const error = ref("");
const lines = computed(() => DENOMINATIONS.map((denominationCents) => ({ denominationCents, quantity: quantities.value[denominationCents] ?? 0 })).filter((line) => line.quantity > 0));
const totalCents = computed(() => lines.value.reduce((sum, line) => sum + line.denominationCents * line.quantity, 0));

watch(() => props.resetKey, reset);

function reset() {
  quantities.value = {};
  editingId.value = "";
  error.value = "";
}

function edit(bundle: CashBundle) {
  quantities.value = Object.fromEntries(bundle.lines.map((line) => [line.denominationCents, line.quantity]));
  editingId.value = bundle.id;
  error.value = "";
  document.querySelector(".bundle-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function submit() {
  error.value = "";
  if (!lines.value.length) error.value = "Agrega al menos una denominación.";
  else if (totalCents.value > props.expectedCashCents) error.value = "La fajilla supera el efectivo esperado del cajón.";
  else if (editingId.value) emit("update", editingId.value, lines.value);
  else emit("create", lines.value);
}

const statusLabel: Record<CashBundle["status"], string> = {
  DRAFT: "Borrador",
  SEALED: "Sellada",
  IN_SAFE_CUSTODY: "Custodia segura",
  TRANSFERRED: "Transferida",
  CANCELLED: "Cancelada"
};
</script>

<template>
  <section class="bundle-layout">
    <form class="bundle-form panel-card" @submit.prevent="submit">
      <div class="section-head"><div><p class="eyebrow">Custodia de efectivo</p><h2>{{ editingId ? "Editar fajilla" : "Preparar fajilla" }}</h2></div><span class="draft-pill">{{ editingId ? "Editando" : "Borrador" }}</span></div>
      <p class="muted">Cuenta el efectivo por denominación. El total se calcula solo y aún podrás corregirlo antes de sellar.</p>
      <div class="denomination-grid">
        <label v-for="denomination in DENOMINATIONS" :key="denomination"><span>{{ formatCurrency(denomination) }}</span><input v-model.number="quantities[denomination]" type="number" min="0" max="1000" inputmode="numeric" placeholder="0" :aria-label="`Cantidad de piezas de ${formatCurrency(denomination)} para fajilla`" /><small>{{ formatCurrency(denomination * (quantities[denomination] || 0)) }}</small></label>
      </div>
      <div class="bundle-total"><span>Total de la fajilla</span><strong>{{ formatCurrency(totalCents) }}</strong></div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="form-actions"><button v-if="editingId" type="button" class="secondary" @click="reset">Cancelar edición</button><button type="submit" :disabled="busy">{{ busy ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar borrador" }}</button></div>
    </form>

    <div class="bundle-list panel-card">
      <div class="section-head"><div><p class="eyebrow">Fajillas del turno</p><h2>Custodia preparada</h2></div><span>{{ bundles.length }}</span></div>
      <div v-if="bundles.length" class="bundle-rows">
        <article v-for="bundle in bundles" :key="bundle.id">
          <div class="bundle-icon" aria-hidden="true">▰</div>
          <div><strong>{{ bundle.reference }}</strong><small>{{ bundle.lines.length }} denominaciones · {{ bundle.preparedBy?.name || "Cajero actual" }}</small></div>
          <b>{{ formatCurrency(bundle.totalCents) }}</b>
          <span class="status-pill" :class="bundle.status.toLowerCase()">{{ statusLabel[bundle.status] }}</span>
          <div v-if="bundle.status === 'DRAFT'" class="row-actions"><button type="button" class="text-button" :aria-label="`Editar fajilla ${bundle.reference}`" @click="edit(bundle)">Editar</button><button type="button" class="seal-button" :aria-label="`Sellar fajilla ${bundle.reference}`" :disabled="busy" @click="$emit('seal', bundle.id)">Sellar</button></div>
          <small v-else class="immutable-note">Bloqueada para edición</small>
        </article>
      </div>
      <div v-else class="list-empty"><span>▱</span><h3>Aún no hay fajillas</h3><p>Los borradores aparecerán aquí antes de pasar a custodia.</p></div>
    </div>
  </section>
</template>
