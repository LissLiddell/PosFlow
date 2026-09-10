<script setup lang="ts">
import { computed } from "vue";
import { formatCurrency } from "../lib/money";
import type { ReconciliationReport } from "../types";

const props = defineProps<{ report: ReconciliationReport; canOpenNext?: boolean }>();
defineEmits<{ next: [] }>();

const hasDiscrepancy = computed(() => Boolean(props.report.summary.discrepancyCents));
const approvedWithDifference = computed(() => hasDiscrepancy.value && Boolean(props.report.shift.approvedBy));

const typeLabel: Record<string, string> = {
  OPENING_FLOAT: "Fondo inicial",
  CASH_SALE: "Venta en efectivo",
  CASH_BUNDLE_SEALED: "Fajilla sellada",
  CASH_IN: "Entrada autorizada",
  CASH_OUT: "Salida autorizada",
  ADVANCE_ISSUED: "Anticipo entregado",
  ADVANCE_RETURNED: "Devolución de anticipo",
  REMITTANCE_SEND: "Envío de remesa",
  REMITTANCE_PAYOUT: "Pago de remesa"
};
</script>

<template>
  <section class="report-page">
    <header class="report-hero"><div><p class="eyebrow">{{ approvedWithDifference ? 'Excepción conciliada' : 'Turno conciliado' }}</p><h1>{{ approvedWithDifference ? 'La diferencia quedó explicada.' : 'Cada peso tiene una explicación.' }}</h1><p>{{ report.shift.register.store.name }} · {{ report.shift.register.name }} · {{ report.shift.cashier.name }}</p></div><div class="report-actions"><span class="closed-stamp" :class="{ exception: approvedWithDifference }">✓ {{ approvedWithDifference ? 'Aprobado con diferencia' : 'Cerrado' }}</span><button v-if="canOpenNext" type="button" @click="$emit('next')">Abrir siguiente turno →</button></div></header>
    <div class="report-metrics">
      <article><small>Efectivo esperado</small><strong>{{ formatCurrency(report.summary.expectedCashCents) }}</strong><span>Según movimientos</span></article>
      <article><small>Efectivo contado</small><strong>{{ formatCurrency(report.summary.countedCashCents || 0) }}</strong><span>Conteo físico</span></article>
      <article :class="{ discrepancy: hasDiscrepancy }"><small>Diferencia</small><strong>{{ formatCurrency(report.summary.discrepancyCents || 0) }}</strong><span>{{ approvedWithDifference ? "Diferencia aprobada" : hasDiscrepancy ? "Requiere seguimiento" : "Caja cuadrada" }}</span></article>
      <article><small>Fajillas selladas</small><strong>{{ formatCurrency(report.summary.sealedBundleCents) }}</strong><span>Fuera del cajón</span></article>
    </div>
    <div class="report-grid">
      <article class="panel-card ledger-table"><div class="section-head"><div><p class="eyebrow">Trazabilidad</p><h2>Libro del turno</h2></div><span>{{ report.ledgerEntries.length }} movimientos</span></div><div class="ledger-head"><span>Movimiento</span><span>Hora</span><span>Importe</span></div><div v-for="entry in report.ledgerEntries" :key="entry.id" class="ledger-row"><div><i :class="{ out: entry.amountCents < 0 }">{{ entry.amountCents < 0 ? '↓' : '↑' }}</i><span><strong>{{ typeLabel[entry.type] || entry.type }}</strong><small>{{ entry.description }}</small></span></div><time>{{ new Date(entry.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }}</time><b :class="{ negative: entry.amountCents < 0 }">{{ entry.amountCents > 0 ? '+' : '' }}{{ formatCurrency(entry.amountCents) }}</b></div></article>
      <aside class="panel-card report-summary"><p class="eyebrow">Resumen operativo</p><h2>{{ report.summary.saleCount }} ventas</h2><dl><div><dt>Venta total</dt><dd>{{ formatCurrency(report.summary.salesCents) }}</dd></div><div><dt>Fajillas</dt><dd>{{ report.cashBundles.filter(item => item.status !== 'DRAFT').length }}</dd></div><div><dt>Aprobado por</dt><dd>{{ report.shift.approvedBy?.name || 'Cierre automático' }}</dd></div><div><dt>Finalizado</dt><dd>{{ report.shift.closedAt ? new Date(report.shift.closedAt).toLocaleString('es-MX') : '—' }}</dd></div></dl><div class="integrity-note"><span>✦</span><p><strong>Historial protegido</strong>Este turno ya no puede editarse. Las correcciones futuras deberán dejar un movimiento inverso.</p></div></aside>
    </div>
  </section>
</template>
