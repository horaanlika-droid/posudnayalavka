"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import { CATEGORIES, PRODUCTS } from "@/data/catalog";
import { ProductCard } from "@/components/ProductCard";
import { Topbar } from "@/components/Topbar";

export default function HomePage() {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    let list = cat === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === cat);
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          (p.subtitle ?? "").toLowerCase().includes(term) ||
          (p.description ?? "").toLowerCase().includes(term),
      );
    }
    return list;
  }, [cat, q]);

  return (
    <>
      <Topbar
        title="Посудная лавка"
        avatar="П"
        right={<Store size={20} style={{ color: "var(--text-2)" }} />}
      />

      <div className="searchbox">
        <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={cat === c.id ? "chip active" : "chip"}
            onClick={() => setCat(c.id)}
          >
            {c.emoji} {c.title}
          </button>
        ))}
      </div>

      <div style={{ height: 6 }} />

      {items.length === 0 ? (
        <div className="empty">
          <div className="big">🍷</div>
          <div className="t">Ничего не найдено</div>
          <div>Попробуйте изменить запрос</div>
        </div>
      ) : (
        <div className="grid">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </>
  );
}
