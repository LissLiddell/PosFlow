<script setup lang="ts">
import { computed } from "vue";
import { formatCurrency } from "../lib/money";
import type { PendingShift, Shift } from "../types";

const props = defineProps<{ shifts: PendingShift[]; activeShift?: Shift | null; canManageBundles: boolean; busy?: boolean }>();
const emit = defineEmits<{ approve: [id: string]; bundles: [] }>();
const drawerPercent = computed(() => props.activeShift ? Math.round((props.activeShift.expectedCashCents / props.activeShift.register.cashLimitCents) * 100) : 0);
</script>

<template>
  <section class="exceptions-page">
    <header class="page-heading"><div><p class="eyebrow">Mesa de control</p><h1>Excepciones operativas</h1><p>Administración define la política; los roles autorizados resuelven desvíos sin reescribir el historial.</p></div><span class="supervisor-seal">Admin / Supervisor</span></header>
    <div class="exception-kinds" :class="{ single: !canManageBundles }">
      <article v-if="canManageBundles" :class="{ warning: activeShift && drawerPercent >= 80 }"><span>▰</span><div><small>Límite del cajón</small><strong>{{ activeShift ? `${drawerPercent}% utilizado` : 'Sin turno activo' }}</strong><p>Cuando la siguiente venta rebasa el máximo, debe sellarse una fajilla.</p></div><button v-if="activeShift" type="button" @click="emit('bundles')">Gestionar fajilla</button></article>
      <article :class="{ warning: shifts.length }"><span>±</span><div><small>Diferencias de cierre</small><strong>{{ shifts.length ? `${shifts.length} por revisar` : 'Sin pendientes' }}</strong><p>El conteo original se conserva y la aprobación queda firmada.</p></div></article>
    </div>
    <div class="review-queue panel-card">
      <div class="section-head"><div><p class="eyebrow">Cola de revisión</p><h2>Cierres pendientes</h2></div><span>{{ shifts.length }}</span></div>
      <div v-if="shifts.length" class="review-list">
        <article v-for="shift in shifts" :key="shift.id">
          <div><small>{{ shift.register.store.name }} · {{ shift.register.code }}</small><strong>{{ shift.cashier.name }}</strong><time :datetime="shift.closeRequestedAt">{{ new Date(shift.closeRequestedAt).toLocaleString('es-MX') }}</time></div>
          <dl><div><dt>Esperado</dt><dd>{{ formatCurrency(shift.expectedCashCents) }}</dd></div><div><dt>Contado</dt><dd>{{ formatCurrency(shift.countedCashCents) }}</dd></div><div class="difference"><dt>Diferencia</dt><dd>{{ formatCurrency(shift.discrepancyCents) }}</dd></div></dl>
          <button type="button" :aria-label="`Aprobar cierre de ${shift.cashier.name} en ${shift.register.store.name}`" :disabled="busy" @click="emit('approve', shift.id)">{{ busy ? 'Aprobando…' : 'Aprobar cierre' }}</button>
        </article>
      </div>
      <div v-else class="clean-state"><span>✓</span><h3>Todo está bajo control</h3><p>No existen cierres fuera de tolerancia esperando aprobación.</p></div>
    </div>
  </section>
</template>
