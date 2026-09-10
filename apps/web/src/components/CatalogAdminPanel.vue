<script setup lang="ts">
import { ref, watch } from "vue";
import { centsToMoneyInput, formatCurrency, moneyInputToCents } from "../lib/money";
import type { Category, Product, ProductInput } from "../types";

const props = defineProps<{ products: Product[]; categories: Category[]; busy?: boolean; resetKey: number }>();
const emit = defineEmits<{ save: [input: ProductInput, id?: string] }>();

const editingId = ref("");
const sku = ref("");
const name = ref("");
const categoryId = ref("");
const price = ref("");
const stock = ref("0");
const active = ref(true);
const error = ref("");

watch(() => props.categories, (categories) => {
  if (!categoryId.value && categories[0]) categoryId.value = categories[0].id;
}, { immediate: true });
watch(() => props.resetKey, () => reset());

function reset() {
  editingId.value = "";
  sku.value = "";
  name.value = "";
  categoryId.value = props.categories[0]?.id ?? "";
  price.value = "";
  stock.value = "0";
  active.value = true;
  error.value = "";
}

function edit(product: Product) {
  editingId.value = product.id;
  sku.value = product.sku;
  name.value = product.name;
  categoryId.value = product.category.id;
  price.value = centsToMoneyInput(product.priceCents);
  stock.value = String(product.stockQuantity);
  active.value = product.active;
  error.value = "";
  document.querySelector(".product-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function submit() {
  const priceCents = moneyInputToCents(price.value);
  const stockQuantity = Number(stock.value);
  error.value = "";
  if (!sku.value.trim() || !name.value.trim() || !categoryId.value) error.value = "Completa SKU, nombre y categoría.";
  else if (priceCents === null || priceCents <= 0) error.value = "Ingresa un precio mayor a cero.";
  else if (!Number.isInteger(stockQuantity) || stockQuantity < 0) error.value = "Ingresa existencias válidas.";
  else emit("save", { categoryId: categoryId.value, sku: sku.value.trim(), name: name.value.trim(), priceCents, stockQuantity, active: active.value }, editingId.value || undefined);
}
</script>

<template>
  <section class="catalog-admin">
    <header class="page-heading"><div><p class="eyebrow">Catálogo maestro</p><h1>Productos listos para vender</h1><p>Altas y cambios controlados desde el perfil administrador.</p></div><span class="admin-seal">{{ products.length }} productos</span></header>
    <div class="catalog-admin-grid">
      <form class="product-editor panel-card" @submit.prevent="submit">
        <div class="section-head"><div><p class="eyebrow">{{ editingId ? 'Edición' : 'Nuevo registro' }}</p><h2>{{ editingId ? 'Actualizar producto' : 'Dar de alta producto' }}</h2></div><button v-if="editingId" type="button" class="text-button" @click="reset">Cancelar</button></div>
        <div class="editor-fields">
          <label>SKU<input v-model="sku" maxlength="32" autocomplete="off" required /></label>
          <label>Nombre<input v-model="name" maxlength="100" required /></label>
          <label>Categoría<select v-model="categoryId" required><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
          <label>Precio<div class="money-input"><span>$</span><input v-model="price" inputmode="decimal" required /></div></label>
          <label>Existencias<input v-model="stock" type="number" min="0" max="1000000" inputmode="numeric" required /></label>
          <label class="check-field"><input v-model="active" type="checkbox" /><span>Disponible para venta</span></label>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="submit" :disabled="busy">{{ busy ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear producto' }}</button>
      </form>
      <div class="product-table panel-card" role="table" aria-label="Catálogo de productos">
        <div class="product-table-head" role="row"><span role="columnheader">Producto</span><span role="columnheader">Precio</span><span role="columnheader">Stock</span><span role="columnheader">Estado</span><span role="columnheader">Acciones</span></div>
        <article v-for="product in products" :key="product.id" role="row">
          <div class="product-cell" role="cell"><i :style="{ background: product.category.color || '#355cff' }" aria-hidden="true">{{ product.name.slice(0, 2).toUpperCase() }}</i><span><strong>{{ product.name }}</strong><small>{{ product.sku }} · {{ product.category.name }}</small></span></div>
          <b role="cell">{{ formatCurrency(product.priceCents) }}</b><span role="cell">{{ product.stockQuantity }}</span><span role="cell" class="status-pill" :class="{ inactive: !product.active }">{{ product.active ? 'Activo' : 'Inactivo' }}</span><button type="button" class="table-edit" :aria-label="`Editar ${product.name}`" @click="edit(product)">Editar</button>
        </article>
      </div>
    </div>
  </section>
</template>
