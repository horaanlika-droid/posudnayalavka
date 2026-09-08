"use client";

import type { CartLine } from "@/lib/types";
import { PRODUCTS } from "@/data/catalog";
import { unitPrice, variantLabel, formatMoney } from "@/lib/format";
import { QtyStepper } from "@/components/ProductCard";
import { useStore } from "@/lib/store";
import { Wine } from "lucide-react";

export function CartLineRow({ line }: { line: CartLine }) {
  const product = PRODUCTS.find((p) => p.id === line.productId);
  const { setQty, remove } = useStore();
  if (!product) return null;

  const price = unitPrice(product, line.variantId);
  const label = variantLabel(product, line.variantId);

  return (
    <div className="list-item">
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 10,
          flex: "none",
          background: "linear-gradient(145deg,#eef6fb,#e6eef4)",
          display: "grid",
          placeItems: "center",
          color: "#9cc5dd",
          overflow: "hidden",
        }}
      >
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Wine size={28} strokeWidth={1.4} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
          {product.title}
        </div>
        {label && <div className="muted" style={{ fontSize: 13 }}>{label}</div>}
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {formatMoney(price)} / шт
        </div>
        <div style={{ marginTop: 6 }}>
          <QtyStepper
            value={line.qty}
            onInc={() => setQty(product.id, line.variantId, line.qty + 1)}
            onDec={() => {
              if (line.qty <= 1) remove(product.id, line.variantId);
              else setQty(product.id, line.variantId, line.qty - 1);
            }}
          />
        </div>
      </div>

      <div style={{ textAlign: "right", alignSelf: "flex-start" }}>
        <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>
          {formatMoney(price * line.qty)}
        </div>
      </div>
    </div>
  );
}
