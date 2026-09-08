"use client";

import Link from "next/link";
import { useState } from "react";
import { Topbar } from "@/components/Topbar";
import { CATEGORIES, PRODUCTS } from "@/data/catalog";
import { useStore } from "@/lib/store";

export default function AccountPage() {
  const { cart, clear } = useStore();
  const [ok, setOk] = useState(false);

  return (
    <>
      <Topbar title="Ещё" />

      <div className="section" style={{ marginTop: 12 }}>
        <Link href="/" className="list-item">
          <span className="emoji-tile">🛍️</span>
          <div>
            <div style={{ fontWeight: 600 }}>Магазин</div>
          </div>
          <span className="caret">›</span>
        </Link>
        <Link href="/support" className="list-item">
          <span className="emoji-tile">💬</span>
          <div>
            <div style={{ fontWeight: 600 }}>Поддержка</div>
            <div className="muted" style={{ fontSize: 13 }}>Чат с оператором</div>
          </div>
          <span className="caret">›</span>
        </Link>
        <Link href="/cart" className="list-item">
          <span className="emoji-tile">🧺</span>
          <div>
            <div style={{ fontWeight: 600 }}>Корзина</div>
            {cart.length > 0 && <div className="muted" style={{ fontSize: 13 }}>{cart.reduce((s, l) => s + l.qty, 0)} шт</div>}
          </div>
          <span className="caret">›</span>
        </Link>
      </div>

      <div className="section" style={{ marginTop: 10 }}>
        <div className="list-item" style={{ cursor: "pointer" }} onClick={() => {
          clear();
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}>
          <span className="emoji-tile">🗑️</span>
          <div>
            <div style={{ fontWeight: 600, color: "var(--red)" }}>{ok ? "Корзина очищена" : "Очистить корзину"}</div>
          </div>
          <span className="caret">›</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="section" style={{ padding: "14px var(--content-pad)" }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>О магазине</div>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          «Посудная лавка» — посуда, бокалы и стаканы. Товаров в каталоге: {PRODUCTS.length}, категорий: {CATEGORIES.length - 1}.
        </p>
      </div>

      <p className="muted center" style={{ fontSize: 12, marginTop: 18 }}>
        © {new Date().getFullYear()} Посудная лавка
      </p>
    </>
  );
}
