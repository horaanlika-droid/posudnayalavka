import { genId, readStore, updateStore } from "@/lib/db";
import { PRODUCTS } from "@/data/catalog";
import { unitPrice, variantLabel } from "@/lib/format";
import type {
  CartLine,
  Customer,
  Order,
  OrderItemView,
  OrderStatus,
} from "@/lib/types";

export function buildOrderItems(cart: CartLine[]): OrderItemView[] {
  const items: OrderItemView[] = [];
  for (const line of cart) {
    const product = PRODUCTS.find((p) => p.id === line.productId);
    if (!product || line.qty <= 0) continue;
    items.push({
      productId: product.id,
      title: product.title,
      variantLabel: variantLabel(product, line.variantId),
      qty: line.qty,
      priceMinor: unitPrice(product, line.variantId),
    });
  }
  return items;
}

export function cartAmountMinor(cart: CartLine[]): number {
  return buildOrderItems(cart).reduce((s, i) => s + i.priceMinor * i.qty, 0);
}

export async function createOrder(cart: CartLine[], customer: Customer, paymentMethod: Order["paymentMethod"]): Promise<Order> {
  const items = buildOrderItems(cart);
  const amountMinor = items.reduce((s, i) => s + i.priceMinor * i.qty, 0);
  return updateStore<Order>((doc) => {
    doc.counters.order += 1;
    const order: Order = {
      id: genId(),
      number: doc.counters.order,
      status: "new",
      paymentMethod,
      paymentStatus: paymentMethod === "invoice" ? "invoice" : "pending",
      items,
      amountMinor,
      customer,
      createdAt: new Date().toISOString(),
    };
    doc.orders[order.id] = order;
    return order;
  });
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const doc = await readStore();
  return (doc.orders[orderId] as Order) ?? null;
}

export async function listOrders(): Promise<Order[]> {
  const doc = await readStore();
  return Object.values(doc.orders as Record<string, Order>).sort(
    (a, b) => (b.createdAt < a.createdAt ? -1 : 1),
  );
}

export async function updateOrder(orderId: string, patch: Partial<Order>): Promise<Order | null> {
  return updateStore<Order | null>((doc) => {
    const order = doc.orders[orderId] as Order | undefined;
    if (!order) return null;
    Object.assign(order, patch);
    return order;
  });
}

export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  return updateStore<Order | null>((doc) => {
    const order = doc.orders[orderId] as Order | undefined;
    if (!order) return null;
    order.status = status;
    return order;
  });
}
