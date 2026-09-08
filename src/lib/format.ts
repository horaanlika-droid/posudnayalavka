import { env } from "@/lib/env";
import type { Money, Product } from "@/lib/types";

const SYMBOLS: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  KZT: "₸",
  UAH: "₴",
};

/** Format minor units (kopecks) into a human string, e.g. 1990 -> "19,90 ₽". */
export function formatMoney(minor: Money): string {
  const code = env.currency;
  const major = minor / 100;
  const hasMinor = !Number.isInteger(major) || Math.round(major) !== major;
  const locale = code === "RUB" ? "ru-RU" : "en-US";
  const str = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasMinor ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(major);
  return `${str} ${SYMBOLS[code] ?? code}`;
}

/** Resolve unit price for a product + optional variant, in minor units. */
export function unitPrice(product: Product, variantId?: string): Money {
  if (variantId && product.variants) {
    const v = product.variants.find((x) => x.id === variantId);
    if (v) return v.priceMinor;
  }
  if (product.priceMinor != null) return product.priceMinor;
  // Fallback: cheapest variant.
  if (product.variants && product.variants.length) {
    return Math.min(...product.variants.map((v) => v.priceMinor));
  }
  return 0;
}

/** Resolve a human label for a variant. */
export function variantLabel(product: Product, variantId?: string): string | undefined {
  if (variantId && product.variants) {
    return product.variants.find((x) => x.id === variantId)?.label;
  }
  return undefined;
}
