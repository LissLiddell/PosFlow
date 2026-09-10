export type SaleQuantityInput = { productId: string; quantity: number };

export function consolidateSaleQuantities(items: readonly SaleQuantityInput[]) {
  if (items.length === 0) throw new Error("EMPTY_SALE");
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("INVALID_ITEM_QUANTITY");
    const consolidated = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (consolidated > 99) throw new Error("INVALID_ITEM_QUANTITY");
    quantities.set(item.productId, consolidated);
  }
  return quantities;
}

export function saleTenderDecision(totalCents: number, cashReceivedCents: number) {
  if (!Number.isInteger(totalCents) || totalCents <= 0 || !Number.isInteger(cashReceivedCents) || cashReceivedCents <= 0) {
    throw new Error("INVALID_TENDER_TOTALS");
  }
  return {
    sufficient: cashReceivedCents >= totalCents,
    changeCents: Math.max(0, cashReceivedCents - totalCents)
  };
}

export function inventoryDecision(stockQuantity: number, requestedQuantity: number) {
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || !Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error("INVALID_INVENTORY_TOTALS");
  }
  return {
    available: stockQuantity >= requestedQuantity,
    remainingQuantity: Math.max(0, stockQuantity - requestedQuantity)
  };
}
