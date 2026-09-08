"use client";

// Client-side cart, persisted to localStorage.
// A "client key" is generated per browser so orders are attributable
// (and support chat / order lookups are scoped to the same browser).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartLine } from "@/lib/types";

const KEY = "posudnayalavka.cart.v1";
const CID = "posudnayalavka.clientId";

export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem(CID);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(CID, id);
  }
  return id;
}

interface StoreCtx {
  cart: CartLine[];
  add: (productId: string, variantId?: string, qty?: number) => void;
  setQty: (productId: string, variantId: string | undefined, qty: number) => void;
  remove: (productId: string, variantId?: string) => void;
  clear: () => void;
  count: number;
  clientId: string;
}

const Ctx = createContext<StoreCtx | null>(null);

function sameKey(a: CartLine, productId: string, variantId?: string) {
  return a.productId === productId && a.variantId === variantId;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {}
    setClientId(getClientId());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  const add = useCallback((productId: string, variantId?: string, qty = 1) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => sameKey(l, productId, variantId));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [...prev, { productId, variantId, qty }];
    });
  }, []);

  const setQty = useCallback((productId: string, variantId: string | undefined, qty: number) => {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => !sameKey(l, productId, variantId))
        : prev.map((l) => (sameKey(l, productId, variantId) ? { ...l, qty } : l)),
    );
  }, []);

  const remove = useCallback((productId: string, variantId?: string) => {
    setCart((prev) => prev.filter((l) => !sameKey(l, productId, variantId)));
  }, []);

  const clear = useCallback(() => setCart([]), []);

  const count = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);

  const value = useMemo(
    () => ({ cart, add, setQty, remove, clear, count, clientId }),
    [cart, add, setQty, remove, clear, count, clientId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be inside StoreProvider");
  return ctx;
}
