"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Wine } from "lucide-react";
import { PRODUCTS, CATEGORIES } from "@/data/catalog";
import { Topbar } from "@/components/Topbar";
import { QtyStepper } from "@/components/ProductCard";
import { formatMoney, unitPrice } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const product = PRODUCTS.find((p) => p.id === params.id);
  const { add } = useStore();

  // chosen variant + qty being added
  const [variantId, setVariantId] = useState<string | undefined>(
    product?.variants && product.variants.length > 1 ? product.variants[0].id : undefined,
  );
  const [qty, setQtyLocal] = useState(1);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <>
        <Topbar back title="Товар" />
        <div className="empty">
          <div className="big">🤔</div>
          <div className="t">Товар не найден</div>
        </div>
      </>
    );
  }

  const hasOptions = (product.variants?.length ?? 0) > 1;
  const chosenVariant = hasOptions ? variantId : undefined;
  const price = formatMoney(unitPrice(product, chosenVariant));

  const addToCart = () => {
    add(product.id, chosenVariant, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <>
      <Topbar back title="Товар" />
      <div style={{ background: "var(--bg-accent)" }}>
        <div
          style={{
            aspectRatio: "1 / 1",
            background: "linear-gradient(145deg,#eef6fb,#e6eef4)",
            display: "grid",
            placeItems: "center",
            color: "#9cc5dd",
          }}
        >
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={product.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Wine size={120} strokeWidth={1.1} />
          )}
        </div>
      </div>

      <div style={{ padding: "16px var(--content-pad)" }}>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>
          {CATEGORIES.find((c) => c.id === product.category)?.title ?? "Каталог"}
        </div>
        <h1 style={{ fontSize: 21, margin: 0 }}>{product.title}</h1>
        {product.subtitle && (
          <div style={{ color: "var(--text-2)", marginTop: 2 }}>{product.subtitle}</div>
        )}

        {product.measure && (
          <div style={{ marginTop: 10 }}>
            <span
              style={{
                display: "inline-block",
                background: "var(--bg-pill)",
                borderRadius: 8,
                padding: "5px 10px",
                fontSize: 13,
                color: "var(--text-2)",
              }}
            >
              📏 {product.measure}
            </span>
          </div>
        )}

        {product.description && (
          <p style={{ fontSize: 15, lineHeight: 1.5, color: "var(--text-2)", margin: "12px 0 0" }}>
            {product.description}
          </p>
        )}

        {hasOptions && (
          <div style={{ marginTop: 16 }}>
            <div className="muted" style={{ marginBottom: 8, fontWeight: 600 }}>
              Вариант
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {product.variants!.map((v) => (
                <label key={v.id} className="seg-opt" style={{ cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="variant"
                    checked={variantId === v.id}
                    onChange={() => {
                      setVariantId(v.id);
                      setAdded(false);
                    }}
                  />
                  <span style={{ flex: 1 }}>{v.label}</span>
                  <span style={{ fontWeight: 700 }}>{formatMoney(v.priceMinor)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="row2 mt" style={{ alignItems: "flex-end", marginTop: 18 }}>
          <div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
              Количество
            </div>
            <QtyStepper
              value={qty}
              onInc={() => {
                setQtyLocal((v) => v + 1);
                setAdded(false);
              }}
              onDec={() => setQtyLocal((v) => Math.max(1, v - 1))}
            />
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{price}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              за {hasOptions ? "вариант" : "шт."}
            </div>
          </div>
        </div>

        <div style={{ height: 18 }} />
        <button
          className="btn"
          onClick={addToCart}
          style={added ? { background: "var(--green)" } : undefined}
        >
          {added ? "✓ Добавлено" : hasOptions ? "В корзину" : "В корзину"}
        </button>
      </div>
    </>
  );
}
