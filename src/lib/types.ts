// ---- Shared domain types -------------------------------------------------

/** Money in minor units (e.g. kopecks for RUB). */
export type Money = number;

export interface ProductVariant {
  id: string;
  label: string; // e.g. "300 мл", "Набор 2 шт"
  priceMinor: Money;
  stockNote?: string;
}

export interface Product {
  id: string;
  category: string; // category key, e.g. "wine"
  title: string;
  subtitle?: string;
  description?: string;
  image?: string; // URL or "/img/…"
  /** dimensions/volume that matter for glassware, e.g. "250 мл · h 22 см" */
  measure?: string;
  variants?: ProductVariant[]; // optional multiple price options
  priceMinor?: Money; // used when no variants
  featured?: boolean;
}

export interface Category {
  id: string;
  title: string;
  emoji?: string;
}

export interface CartLine {
  productId: string;
  variantId?: string;
  qty: number;
}

export interface OrderItemView {
  productId: string;
  title: string;
  variantLabel?: string;
  qty: number;
  priceMinor: Money;
}

export type PaymentMethod = "gram" | "yookassa" | "invoice";

export interface Customer {
  name: string;
  phone: string;
  email?: string;
  delivery?: string; // note / адрес / самовывоз
  comment?: string;
  isLegalEntity?: boolean;
  orgDetails?: {
    name?: string;
    inn?: string;
    email?: string;
  };
}

export type OrderStatus =
  | "new"
  | "confirmed"
  | "paid"
  | "shipped"
  | "completed"
  | "cancelled";

export interface Order {
  id: string;
  number: number; // human readable
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: "pending" | "paid" | "failed" | "invoice";
  items: OrderItemView[];
  amountMinor: Money;
  customer: Customer;
  createdAt: string;
  /** yookassa payment id / gram ref / null for invoice */
  paymentRef?: string;
  /** link user should open to pay (yookassa confirmation_url / gram pay url) */
  payUrl?: string;
}

export type SupportActor = "user" | "admin" | "system";

export interface SupportThread {
  id: string; // conversation id (uuid)
  userName?: string;
  customerName?: string;
  phone?: string;
  orderId?: string;
  lastActivity: string;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  actor: SupportActor;
  senderName?: string;
  text: string;
  createdAt: string;
}
