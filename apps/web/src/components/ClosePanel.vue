<script setup lang="ts">
import { computed, ref } from "vue";
import { DENOMINATIONS, formatCurrency } from "../lib/money";
import type { CashLine } from "../types";

const props = defineProps<{ busy?: boolean; pendingReview?: boolean }>();
const emit = defineEmits<{ close: [lines: CashLine[]] }>();

const quantities = ref<Record<number, number>>({});
const confirmed = ref(false);
const error = ref("");
const lines = computed(() => DENOMINATIONS.map((denominationCents) => ({ denominationCents, quantity: quantities.value[denominationCents] ?? 0 })).filter((line) => line.quantity > 0));
const countedCents = computed(() => lines.value.reduce((sum, line) => sum + line.denominationCents * line.quantity, 0));

function submit() {
  error.value = "";
  if (!confirmed.value) error.value = "Confirma que terminaste el conteo ciego.";
  else emit("close", lines.value);
}
</script>

<template>
  <section class="close-layout">
    <article class="blind-banner"><span>◎</span><div><p class="eyebrow">Conteo ciego</p><h2>Cuenta lo que existe, no lo que esperabas encontrar.</h2><p>PosFlow revelará el saldo esperado y la diferencia únicamente después de enviar el conteo.</p></div></article>
    <div v-if="pendingReview" class="review-card"><span>!</span><div><h2>Cierre enviado a revisión</h2><p>La diferencia supera la tolerancia permitida. Un supervisor deberá revisar y aprobar el cierre sin alterar tu conteo.</p></div></div>
    <form v-else class="close-card panel-card" @submit.prevent="submit">
      <div class="section-head"><div><p class="eyebrow">Cierre del turno</p><h2>Efectivo contado</h2></div><strong>{{ formatCurrency(countedCents) }}</strong></div>
      <p class="count-help"><strong>Captura cantidades, no importes.</strong> Por ejemplo: escribe 4 en la casilla de $1,000 para contar $4,000. El total puede quedar por encima o por debajo del efectivo esperado.</p>
      <div class="denomination-grid closing">
        <label v-for="denomination in DENOMINATIONS" :key="denomination"><span>{{ formatCurrency(denomination) }}</span><input v-model.number="quantities[denomination]" type="number" min="0" max="1000" inputmode="numeric" placeholder="Piezas" :aria-label="`Cantidad de piezas de ${formatCurrency(denomination)}`" /><small>{{ formatCurrency(denomination * (quantities[denomination] || 0)) }}</small></label>
      </div>
      <label class="confirm-check"><input v-model="confirmed" type="checkbox" /><span><strong>Terminé el conteo físico</strong><small>Entiendo que el registro quedará bloqueado al completar el cierre.</small></span></label>
      <p v-if="confirmed && countedCents === 0" class="zero-count-note" role="status"><span>✓</span><strong>Cajón vacío confirmado</strong><small>Se enviará un conteo físico de $0.00 y PosFlow calculará cualquier diferencia.</small></p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="close-button" type="submit" :disabled="busy">{{ busy ? "Conciliando…" : "Conciliar y cerrar turno" }}</button>
    </form>
  </section>
</template>
