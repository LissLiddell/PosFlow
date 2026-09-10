<script setup lang="ts">
import { ref, watch } from "vue";
import { centsToMoneyInput, moneyInputToCents } from "../lib/money";
import type { Register } from "../types";

const props = defineProps<{ registers: Register[]; busy?: boolean }>();
const emit = defineEmits<{
  save: [id: string, input: { cashLimitCents: number; closingToleranceCents: number; supervisorCanManageBundles: boolean; supervisorCanApproveClosures: boolean; active: boolean }];
}>();

type Draft = { limit: string; tolerance: string; supervisorCanManageBundles: boolean; supervisorCanApproveClosures: boolean; active: boolean; error: string };
const drafts = ref<Record<string, Draft>>({});

watch(() => props.registers, (registers) => {
  drafts.value = Object.fromEntries(registers.map((register) => [register.id, {
    limit: centsToMoneyInput(register.cashLimitCents),
    tolerance: centsToMoneyInput(register.closingToleranceCents),
    supervisorCanManageBundles: register.supervisorCanManageBundles,
    supervisorCanApproveClosures: register.supervisorCanApproveClosures,
    active: register.active,
    error: ""
  }]));
}, { immediate: true });

function submit(register: Register) {
  const draft = drafts.value[register.id];
  if (!draft) return;
  const cashLimitCents = moneyInputToCents(draft.limit);
  const closingToleranceCents = moneyInputToCents(draft.tolerance);
  draft.error = "";
  if (cashLimitCents === null || cashLimitCents < 100_000) {
    draft.error = "El límite mínimo del cajón es $1,000.00.";
    return;
  }
  if (closingToleranceCents === null || closingToleranceCents < 0) {
    draft.error = "Ingresa una tolerancia válida.";
    return;
  }
  emit("save", register.id, {
    cashLimitCents,
    closingToleranceCents,
    supervisorCanManageBundles: draft.supervisorCanManageBundles,
    supervisorCanApproveClosures: draft.supervisorCanApproveClosures,
    active: draft.active
  });
}
</script>

<template>
  <section class="admin-page">
    <header class="page-heading">
      <div><p class="eyebrow">Control operativo</p><h1>Límites por caja</h1><p>Define cuándo debe retirarse efectivo y qué diferencia necesita revisión humana.</p></div>
      <span class="admin-seal">Sólo administrador</span>
    </header>
    <div class="control-principles">
      <article><span>01</span><div><strong>Máximo en cajón</strong><p>La venta que rebase este importe se bloquea hasta sellar una fajilla.</p></div></article>
      <article><span>02</span><div><strong>Tolerancia de cierre</strong><p>Una diferencia mayor pasa al supervisor sin modificar el conteo original.</p></div></article>
    </div>
    <div class="settings-list">
      <form v-for="register in registers" :key="register.id" class="setting-card" @submit.prevent="submit(register)">
        <div class="setting-title"><div><small>{{ register.store.code }} · {{ register.code }}</small><h2>{{ register.name }}</h2><p>{{ register.store.name }}</p></div><label class="switch"><input v-model="drafts[register.id].active" type="checkbox" /><span></span><b>{{ drafts[register.id].active ? 'Activa' : 'Inactiva' }}</b></label></div>
        <div class="setting-fields">
          <label>Límite de efectivo<div class="money-input"><span>$</span><input v-model="drafts[register.id].limit" inputmode="decimal" required /></div><small>Bloquea la siguiente venta si el saldo proyectado lo rebasa.</small></label>
          <label>Tolerancia de diferencia<div class="money-input"><span>$</span><input v-model="drafts[register.id].tolerance" inputmode="decimal" required /></div><small>Por encima de este monto, el corte espera aprobación.</small></label>
        </div>
        <fieldset class="delegation-settings">
          <legend>Delegación al supervisor</legend>
          <label class="permission-check"><input v-model="drafts[register.id].supervisorCanManageBundles" type="checkbox" /><span><strong>Gestionar fajillas</strong><small>Puede crear, llenar, editar borradores y sellar fajillas.</small></span></label>
          <label class="permission-check"><input v-model="drafts[register.id].supervisorCanApproveClosures" type="checkbox" /><span><strong>Aprobar diferencias de cierre</strong><small>Puede revisar cortes fuera de tolerancia y aprobar el conteo original.</small></span></label>
        </fieldset>
        <p v-if="drafts[register.id].error" class="form-error" role="alert">{{ drafts[register.id].error }}</p>
        <button type="submit" :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar controles' }}</button>
      </form>
    </div>
  </section>
</template>
