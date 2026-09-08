"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { formatMoney } from "@/lib/format";
import type { Order } from "@/lib/types";

const STATUS_TEXT: Record<string, string> = {
  new: "Принят в обработку",
  confirmed: "Подтверждён",
  paid: "Оплачен",
  shipped: "Передан в доставку",
  completed: "Завершён",
  cancelled: "Отменён",
};

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${params.id}`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok && data.order) setOrder(data.order);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <>
        <Topbar back title="Заказ" />
        <div className="empty"><div className="big">⏳</div></div>
      </>
    );
  }

  if (notFound || !order) {
    return (
      <>
        <Topbar back title="Заказ" />
        <div className="empty">
          <div className="big">🤔</div>
          <div className="t">Заказ не найден</div>
        </div>
      </>
    );
  }

  const paid = order.paymentStatus === "paid";
  const needsPay = order.paymentStatus === "pending";

  return (
    <>
      <Topbar back title={`Заказ №${order.number}`} />

      {/* status banner */}
      <div className="section" style={{ marginTop: 12, padding: "16px var(--content-pad)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 30 }}>{order.status === "paid" ? "✅" : order.status === "cancelled" ? "❌" : "📦"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{STATUS_TEXT[order.status] ?? order.status}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {paid
                ? "Оплата получена. Мы свяжемся с вами."
                : order.status === "cancelled"
                ? "Заказ отменён."
                : "Статус обновим, как только появится новость."}
            </div>
          </div>
        </div>
      </div>

      {needsPay && (
        <div className="block-pad mt">
          <button className="btn blue" onClick={() => {
            // If we still have a pay url the order stores it; re-open checkout if none.
            if (order.payUrl) window.location.href = order.payUrl;
            else alert("Ссылка на оплату устарела — обратитесь в поддержку, мы пришлём новую.");
          }}>
            Перейти к оплате · {formatMoney(order.amountMinor)}
          </button>
        </div>
      )}

      {/* items */}
      <div className="section" style={{ marginTop: 12, padding: "14px var(--content-pad)" }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Состав заказа</div>
        {order.items.map((it, i) => (
          <div key={i} className="amount-row">
            <span style={{ flex: 1 }}>
              {it.title}
              {it.variantLabel ? ` · ${it.variantLabel}` : ""}
              <span className="muted"> × {it.qty}</span>
            </span>
            <span style={{ fontWeight: 600 }}>{formatMoney(it.priceMinor * it.qty)}</span>
          </div>
        ))}
        <div className="amount-row total">
          <span>Итого</span>
          <span>{formatMoney(order.amountMinor)}</span>
        </div>
      </div>

      {/* payment & customer */}
      <div className="section" style={{ marginTop: 10, padding: "14px var(--content-pad)" }}>
        <div className="amount-row">
          <span className="muted">Оплата</span>
          <span style={{ fontWeight: 600 }}>
            {order.paymentMethod === "gram" ? "GRAM" : order.paymentMethod === "yookassa" ? "Карта" : "Счёт для юр.лица"}
          </span>
        </div>
        <div className="amount-row">
          <span className="muted">Статус оплаты</span>
          <span style={{ fontWeight: 600 }}>{paid ? "Оплачено ✅" : order.paymentMethod === "invoice" ? "Ждём оплату счёта" : "Ожидание оплаты"}</span>
        </div>
      </div>

      {/* invoice download for legal entity */}
      {order.paymentMethod === "invoice" && order.paymentStatus === "invoice" && (
        <div className="block-pad mt">
          <a className="btn" href={`/api/orders/${order.id}/invoice`} target="_blank" rel="noreferrer">
            Скачать счёт для оплаты
          </a>
        </div>
      )}

      <div className="block-pad mt">
        <Link href="/support?order=1" className="btn" style={{ background: "var(--bg-accent)", color: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--line)", display: "block", textAlign: "center" }}>
          💬 Есть вопрос? Написать в поддержку
        </Link>
      </div>
    </>
  );
}
