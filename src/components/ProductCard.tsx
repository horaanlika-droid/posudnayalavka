"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Minus, Wine } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatMoney, unitPrice } from "@/lib/format";
import { useStore } from "@/lib/store";

export function ProductCard({ product }: { product: Product }) {
  const { cart, add, setQty } = useStore();
  const line = cart.find(
    (l) => l.productId === product.id && !l.variantId && (product.variants?.length ?? 0) <= 1,
  );
  // Default qty counted across lines of this product.
  const inCart = cart.filter((l) => l.productId === product.id).reduce((s, l) => s + l.qty, 0);
  const hasOptions = (product.variants?.length ?? 0) > 1;
  const price = formatMoney(unitPrice(product));
  const thumb = product.image || null;

  const [q, setQ] = useState(inCart);

  if (hasOptions) {
    // Options chosen on the product detail page.
    return (
      <Link href={`/product/${product.id}`} className="card">
        <Thumb src={thumb} title={product.title} />
        <div className="body">
          <div className="name">{product.title}</div>
          {product.subtitle && <div className="meta">{product.subtitle}</div>}
          <div className="foot">
            <span className="price">от {price}</span>
            {inCart > 0 && <span className="meta">{inCart} шт</span>}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="card">
      <Link href={`/product/${product.id}`}>
        <Thumb src={thumb} title={product.title} />
      </Link>
      <div className="body">
        <Link href={`/product/${product.id}`}>
          <div className="name">{product.title}</div>
          {product.subtitle && <div className="meta">{product.subtitle}</div>}
        </Link>
        <div className="foot">
          <span className="price">{price}</span>
          {inCart === 0 ? (
            <button
              className="addbtn"
              aria-label="Добавить"
              onClick={() => add(product.id, undefined, 1)}
            >
              <Plus size={18} />
            </button>
          ) : (
            <QtyStepper
              value={line?.qty ?? inCart}
              onInc={() => add(product.id, undefined, 1)}
              onDec={() => setQty(product.id, undefined, (line?.qty ?? inCart) - 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Thumb({ src, title }: { src: string | null; title: string }) {
  return (
    <div className="thumb" style={{ position: "relative" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} loading="lazy" />
      ) : (
        <Wine size={54} strokeWidth={1.3} />
      )}
    </div>
  );
}

export function QtyStepper({
  value,
  onInc,
  onDec,
}: {
  value: number;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button className="addbtn" onClick={onDec} aria-label="Меньше" style={{ fontSize: 18 }}>
        <Minus size={16} />
      </button>
      <span style={{ fontWeight: 700, fontSize: 15, minWidth: 18, textAlign: "center" }}>{value}</span>
      <button className="addbtn" onClick={onInc} aria-label="Больше">
        <Plus size={16} />
      </button>
    </div>
  );
}
