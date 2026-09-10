<script setup lang="ts">
import { computed } from "vue";
import { fundingPosition, signedCurrencyAmount } from "../lib/finance";
import { formatCurrency } from "../lib/money";
import type { FinanceOverview, Role } from "../types";

const props = defineProps<{ overview: FinanceOverview; busy?: boolean }>();
defineEmits<{ refresh: []; advances: [] }>();

const funding = computed(() => fundingPosition(props.overview.totals));

function signedMoney(value: number) {
  return signedCurrencyAmount(value, formatCurrency);
}

function activityAmount(item: FinanceOverview["activity"][number]) {
  if (item.amountCents === 0) return "Sin movimiento de efectivo";
  return signedMoney(item.amountCents);
}

function activityTone(item: FinanceOverview["activity"][number]) {
  if (item.amountCents === 0) return "neutral";
  return item.amountCents > 0 ? "incoming" : "outgoing";
}

function activityCode(kind: string) {
  if (kind === "REMITTANCE_SEND") return "ENV";
  if (kind === "REMITTANCE_PAYOUT") return "PAG";
  if (kind === "ADVANCE_ISSUED") return "ANT";
  if (kind === "CASH_RETURN") return "DEV";
  return "COM";
}

function roleName(role: Role) {
  return ({ ADMIN: "Administrador", FINANCE: "Finanzas", SUPERVISOR: "Supervisor", CASHIER: "Cajero" } as const)[role];
}
</script>

<template>
  <section class="finance-dashboard">
    <header class="finance-overview-head">
      <div>
        <p class="eyebrow">Finanzas · Vista consolidada</p>
        <h1>Todo el dinero.<br /><em>Sin mezclar saldos.</em></h1>
        <p>Caja física, custodia, fondeo, remesas y anticipos en una sola lectura operativa.</p>
      </div>
      <div class="finance-head-actions">
        <span><i></i> ACTUALIZADO {{ new Date(overview.generatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }}</span>
        <button class="secondary" type="button" :disabled="busy" @click="$emit('refresh')">Actualizar datos ↻</button>
      </div>
    </header>

    <section class="finance-kpis" aria-label="Indicadores financieros">
      <article class="cash-kpi">
        <small>EFECTIVO CONTROLADO</small>
        <strong>{{ formatCurrency(overview.totals.controlledCashCents) }}</strong>
        <dl><div><dt>En cajas activas</dt><dd>{{ formatCurrency(overview.totals.activeDrawerCashCents) }}</dd></div><div><dt>En custodia</dt><dd>{{ formatCurrency(overview.totals.custodyCashCents) }}</dd></div></dl>
      </article>
      <article class="funding-kpi" :class="funding.tone">
        <small>POSICIÓN DE FONDEO</small>
        <strong>{{ formatCurrency(funding.valueCents) }}</strong>
        <p>{{ funding.label }}</p>
        <span>Libro de compensación de remesas</span>
      </article>
      <article>
        <small>COMISIONES GENERADAS</small>
        <strong>{{ formatCurrency(overview.totals.commissionCents) }}</strong>
        <p>{{ overview.totals.paidRemittanceCount }} remesas ya pagadas</p>
        <span>Ingreso separado del principal enviado</span>
      </article>
      <article class="remittance-kpi">
        <small>REMESAS POR PAGAR</small>
        <strong>{{ formatCurrency(overview.totals.availableRemittanceCents) }}</strong>
        <p>{{ overview.totals.availableRemittanceCount }} disponibles en la red</p>
        <span>Compromiso, no efectivo adicional</span>
      </article>
    </section>

    <section class="finance-controls" aria-label="Pendientes de control">
      <article :class="{ warning: overview.totals.overdueAdvanceCount > 0 }">
        <span class="control-number">01</span>
        <div><small>ANTICIPOS ABIERTOS</small><strong>{{ formatCurrency(overview.totals.advanceOutstandingCents) }}</strong><p>{{ overview.totals.openAdvanceCount }} en rendición · {{ formatCurrency(overview.totals.advanceAuthorizedCents) }} autorizados por entregar</p></div>
        <b v-if="overview.totals.overdueAdvanceCount">{{ overview.totals.overdueAdvanceCount }} vencido{{ overview.totals.overdueAdvanceCount === 1 ? '' : 's' }}</b>
        <button type="button" @click="$emit('advances')">Gestionar →</button>
      </article>
      <article :class="{ warning: overview.totals.pendingReviewCount > 0 }">
        <span class="control-number">02</span>
        <div><small>CIERRES POR REVISAR</small><strong>{{ overview.totals.pendingReviewCount }}</strong><p>Diferencias de caja que todavía requieren una decisión autorizada.</p></div>
        <b v-if="overview.totals.pendingReviewCount">Atención</b>
      </article>
      <article class="ledger-rule">
        <span class="control-number">≠</span>
        <div><small>REGLA DE CONTROL</small><strong>Dos libros, una lectura</strong><p>El efectivo responde “¿dónde está el dinero?”; el fondeo responde “¿quién debe compensarlo?”.</p></div>
      </article>
    </section>

    <div class="finance-detail-grid">
      <section class="panel-card store-exposure">
        <div class="section-head"><div><p class="eyebrow">Exposición por sucursal</p><h2>Mapa de dinero</h2></div><span>{{ overview.stores.length }} TIENDAS</span></div>
        <div class="finance-table-wrap">
          <table>
            <caption class="sr-only">Saldos operativos por sucursal</caption>
            <thead><tr><th scope="col">Sucursal</th><th scope="col">Caja activa</th><th scope="col">Custodia</th><th scope="col">Fondeo</th><th scope="col">Anticipos</th><th scope="col">Remesas por pagar</th></tr></thead>
            <tbody>
              <tr v-for="store in overview.stores" :key="store.id">
                <th scope="row"><strong>{{ store.name }}</strong><small>{{ store.code }}{{ store.city ? ` · ${store.city}` : '' }}</small></th>
                <td>{{ formatCurrency(store.activeDrawerCashCents) }}</td>
                <td>{{ formatCurrency(store.custodyCashCents) }}</td>
                <td :class="{ negative: store.fundingBalanceCents < 0, positive: store.fundingBalanceCents > 0 }">{{ signedMoney(store.fundingBalanceCents) }}</td>
                <td>{{ formatCurrency(store.advanceOutstandingCents) }}</td>
                <td>{{ formatCurrency(store.availableIncomingCents) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer><span><i class="negative-dot"></i> Negativo: la tienda debe fondeo</span><span><i class="positive-dot"></i> Positivo: la red debe a la tienda</span></footer>
      </section>

      <section class="panel-card finance-activity">
        <div class="section-head"><div><p class="eyebrow">Trazabilidad</p><h2>Actividad reciente</h2></div><span>ÚLTIMOS {{ overview.activity.length }}</span></div>
        <div v-if="overview.activity.length" class="activity-list">
          <article v-for="item in overview.activity" :key="item.id">
            <span class="activity-code">{{ activityCode(item.kind) }}</span>
            <div><strong>{{ item.label }}</strong><small>{{ item.detail }}</small><span v-if="item.actor" class="activity-actor">{{ item.actor.name }} · {{ roleName(item.actor.role) }}</span><time :datetime="item.occurredAt">{{ new Date(item.occurredAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</time></div>
            <b :class="activityTone(item)">{{ activityAmount(item) }}</b>
          </article>
        </div>
        <div v-else class="list-empty"><span>✓</span><h3>Sin movimientos recientes</h3><p>Los envíos, pagos y anticipos aparecerán aquí.</p></div>
      </section>
    </div>
  </section>
</template>
