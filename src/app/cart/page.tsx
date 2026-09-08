"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PRODUCTS } from "@/data/catalog";
import { Topbar } from "@/components/Topbar";
import { CartLineRow } from "@/components/CartLineRow";
import { useStore } from "@/lib/store";
import { unitPrice } from "@/lib/format";
import { formatMoney } from "@/lib/format";

export default function CartPage() {
  const { cart, clear } = useStore();
  const router = useRouter();

  const valid = cart.filter((l) => PRODUCTS.some((p) => p.id === l.productId));
  const total = valid.reduce(
    (s, l) => s + unitPrice(PRODUCTS.find((p) => p.id === l.productId)!, l.variantId) * l.qty,
    0,
  );

  if (valid.length === 0) {
    return (
      <>
        <Topbar title="Корзина" />
        <div className="empty">
          <div className="big">🧺</div>
          <div className="t">Корзина пуста</div>
          <div>Добавьте бокалы из каталога</div>
          <div style={{ height: 16 }} />
          <Link href="/" className="btn" style={{ display: "inline-block", width: "auto", padding: "12px 24px" }}>
            Перейти в каталог
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Корзина"
        right={
          <button
            onClick={clear}
            style={{ background: "none", border: "none", color: "var(--red)", fontSize: 14 }}
          >
            Очистить
          </button>
        }
      />

      <div className="section" style={{ marginTop: 12 }}>
        {valid.map((l) => (
          <CartLineRow key={l.productId + (l.variantId ?? "")} line={l} />
        ))}
      </div>

      <div style={{ height: 8 }} />

      <div className="section" style={{ padding: "14px var(--content-pad)" }}>
        <div className="amount-row">
          <span className="muted">Товары ({valid.reduce((s, l) => s + l.qty, 0)})</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="amount-row total">
          <span>Итого</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>

      <div className="block-pad mt">
        <button className="btn" onClick={() => router.push("/checkout")}>
          Оформить заказ
        </button>
      </div>
    </>
  );
}
