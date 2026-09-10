<script setup lang="ts">
import { ref, watch } from "vue";
import { moneyInputToCents } from "../lib/money";
import type { Register } from "../types";

const props = defineProps<{ registers: Register[]; busy?: boolean }>();
const emit = defineEmits<{ open: [registerId: string, openingFloatCents: number] }>();

const registerId = ref("");
const amount = ref("2000.00");
const error = ref("");

watch(() => props.registers, (items) => {
  const available = items.find((item) => !item.currentShift);
  if ((!registerId.value || items.find((item) => item.id === registerId.value)?.currentShift) && available) registerId.value = available.id;
}, { immediate: true });

function submit() {
  const cents = moneyInputToCents(amount.value);
  error.value = "";
  if (!registerId.value) error.value = "Selecciona una caja disponible.";
  else if (cents === null || cents < 0) error.value = "Ingresa un fondo inicial válido.";
  else emit("open", registerId.value, cents);
}
</script>

<template>
  <section class="opening-layout">
    <article class="opening-copy">
      <p class="eyebrow">Inicio de operación</p>
      <h1>Abre la caja con un punto de partida confiable.</h1>
      <p>El fondo inicial será el primer movimiento del turno. A partir de aquí, cada peso deberá poder explicarse.</p>
      <div class="opening-rule"><span>01</span><div><strong>Una caja, un turno activo</strong><small>PosFlow bloquea aperturas duplicadas para proteger la conciliación.</small></div></div>
      <div class="opening-rule"><span>02</span><div><strong>Sin ventas fuera de turno</strong><small>Ninguna operación de dinero puede quedar huérfana.</small></div></div>
    </article>
    <form class="opening-card" @submit.prevent="submit">
      <div class="live-dot"><i></i> Preparar turno</div>
      <h2>Declaración de apertura</h2>
      <label>Caja asignada
        <select v-model="registerId" required>
          <option disabled value="">Selecciona una caja</option>
          <option v-for="register in registers" :key="register.id" :value="register.id" :disabled="Boolean(register.currentShift)">{{ register.store.name }} · {{ register.name }}{{ register.currentShift ? ` — ocupada por ${register.currentShift.cashier.name}` : '' }}</option>
        </select>
      </label>
      <label>Fondo inicial
        <div class="money-input"><span>$</span><input v-model="amount" inputmode="decimal" pattern="[0-9,]+([.][0-9]{1,2})?" aria-describedby="opening-help" required /></div>
      </label>
      <small id="opening-help">Importe en pesos mexicanos. Se almacenará en centavos exactos.</small>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="busy || !registers.some(register => !register.currentShift)">{{ busy ? "Abriendo…" : "Abrir turno →" }}</button>
      <p v-if="registers.length && !registers.some(register => !register.currentShift)" class="form-error" role="status">Todas las cajas tienen un turno activo. El supervisor puede revisar quién las está operando.</p>
    </form>
  </section>
</template>
