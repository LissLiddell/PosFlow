<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { centsToMoneyInput, formatCurrency, moneyInputToCents } from "../lib/money";
import type { Product } from "../types";

const props = defineProps<{ products: Product[]; busy?: boolean; resetKey: number; expectedCashCents: number; cashLimitCents: number; canManageBundles?: boolean }>();
const emit = defineEmits<{ checkout: [items: Array<{ productId: string; quantity: number }>, cashReceivedCents: number]; bundles: [] }>();

const query = ref("");
const category = ref("Todos");
const quantities = ref<Record<string, number>>({});
const cashReceived = ref("");
const error = ref("");

const categories = computed(() => ["Todos", ...new Set(props.products.map((product) => product.category.name))]);
const filteredProducts = computed(() => props.products.filter((product) => {
  const matchesCategory = category.value === "Todos" || product.category.name === category.value;
  const term = query.value.trim().toLowerCase();
  return matchesCategory && (!term || product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term));
}));
const cart = computed(() => props.products.filter((product) => (quantities.value[product.id] ?? 0) > 0).map((product) => ({ ...product, quantity: quantities.value[product.id]! })));
const itemCount = computed(() => cart.value.reduce((sum, item) => sum + item.quantity, 0));
const totalCents = computed(() => cart.value.reduce((sum, item) => sum + item.priceCents * item.quantity, 0));
const projectedCashCents = computed(() => props.expectedCashCents + totalCents.value);
const exceedsCashLimit = computed(() => totalCents.value > 0 && projectedCashCents.value > props.cashLimitCents);
const drawerPercent = computed(() => Math.min(100, Math.round((props.expectedCashCents / props.cashLimitCents) * 100)));

watch(() => props.resetKey, () => {
  quantities.value = {};
  cashReceived.value = "";
  error.value = "";
});

function change(product: Product, delta: number) {
  const next = Math.max(0, Math.min(product.stockQuantity, (quantities.value[product.id] ?? 0) + delta));
  quantities.value = { ...quantities.value, [product.id]: next };
}

function exactCash() {
  cashReceived.value = centsToMoneyInput(totalCents.value);
}

function checkout() {
  const received = moneyInputToCents(cashReceived.value);
  error.value = "";
  if (!cart.value.length) error.value = "Agrega al menos un producto al carrito.";
  else if (exceedsCashLimit.value) error.value = "La venta rebasa el límite del cajón. Se necesita una fajilla antes de continuar.";
  else if (received === null) error.value = "Ingresa un importe recibido válido.";
  else if (received < totalCents.value) error.value = "El efectivo recibido no cubre el total.";
  else emit("checkout", cart.value.map((item) => ({ productId: item.id, quantity: item.quantity })), received);
}
</script>

<template>
  <section class="pos-layout">
    <div class="catalog-panel">
      <div class="drawer-limit" :class="{ warning: drawerPercent >= 80 }"><div><span>EFECTIVO EN CAJÓN</span><strong>{{ formatCurrency(expectedCashCents) }} / {{ formatCurrency(cashLimitCents) }}</strong></div><div class="limit-track" role="progressbar" aria-label="Porcentaje del límite de efectivo utilizado" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="drawerPercent"><i :style="{ width: `${drawerPercent}%` }"></i></div><b>{{ drawerPercent }}%</b></div>
      <div class="section-head"><div><p class="eyebrow">Venta rápida</p><h2>Catálogo</h2></div><label class="search"><span aria-hidden="true">⌕</span><input v-model="query" type="search" placeholder="Buscar producto o SKU" aria-label="Buscar productos" /></label></div>
      <div class="category-row" role="group" aria-label="Filtrar por categoría">
        <button v-for="item in categories" :key="item" type="button" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
      </div>
      <div class="product-grid">
        <button v-for="product in filteredProducts" :key="product.id" type="button" class="product-card" :disabled="product.stockQuantity === 0" :aria-pressed="Boolean(quantities[product.id])" @click="change(product, 1)">
          <span class="product-art" :style="{ '--category-color': product.category.color || '#ff6b3d' }"><i>{{ product.name.slice(0, 2).toUpperCase() }}</i><small>{{ product.category.name }}</small></span>
          <span class="product-info"><strong>{{ product.name }}</strong><small>{{ product.sku }} · {{ product.stockQuantity }} disponibles</small><b>{{ formatCurrency(product.priceCents) }}</b></span>
          <span v-if="quantities[product.id]" class="product-count">{{ quantities[product.id] }}</span>
        </button>
      </div>
      <p v-if="!filteredProducts.length" class="empty">No encontramos productos con ese filtro.</p>
    </div>

    <aside class="cart-panel">
      <div class="cart-title"><div><p class="eyebrow">Ticket actual</p><h2>{{ itemCount }} {{ itemCount === 1 ? "artículo" : "artículos" }}</h2></div><span class="cart-badge">En caja</span></div>
      <div v-if="cart.length" class="cart-lines">
        <article v-for="item in cart" :key="item.id">
          <div><strong>{{ item.name }}</strong><small>{{ formatCurrency(item.priceCents) }} c/u</small></div>
          <div class="stepper"><button type="button" :aria-label="`Quitar una unidad de ${item.name}`" @click="change(item, -1)">−</button><span aria-live="polite">{{ item.quantity }}</span><button type="button" :aria-label="`Agregar una unidad de ${item.name}`" @click="change(item, 1)">+</button></div>
          <b>{{ formatCurrency(item.priceCents * item.quantity) }}</b>
        </article>
      </div>
      <div v-else class="cart-empty"><span>＋</span><h3>El ticket está vacío</h3><p>Selecciona productos para comenzar la venta.</p></div>
      <div class="checkout-box">
        <div class="total-line" aria-live="polite"><span>Total</span><strong>{{ formatCurrency(totalCents) }}</strong></div>
        <label>Efectivo recibido
          <div class="money-input"><span>$</span><input v-model="cashReceived" inputmode="decimal" placeholder="0.00" /></div>
        </label>
        <button type="button" class="text-button" :disabled="!totalCents" @click="exactCash">Usar importe exacto</button>
        <div v-if="exceedsCashLimit" class="limit-block" role="alert"><span>!</span><p><strong>Retiro requerido</strong>Esta venta llevaría el cajón a {{ formatCurrency(projectedCashCents) }}.</p><button v-if="canManageBundles" type="button" @click="$emit('bundles')">Ir a fajillas</button><small v-else>Solicita apoyo de un supervisor o administrador.</small></div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="button" class="checkout-button" :disabled="busy || !cart.length || exceedsCashLimit" @click="checkout">{{ busy ? "Procesando…" : "Cobrar en efectivo" }} <span>→</span></button>
      </div>
    </aside>
  </section>
</template>
