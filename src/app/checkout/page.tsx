"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { useStore } from "@/lib/store";
import { PRODUCTS } from "@/data/catalog";
import { unitPrice, formatMoney } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

export default function CheckoutPage() {
  const { cart, clear } = useStore();
  const router = useRouter();

  const valid = cart.filter((l) => PRODUCTS.some((p) => p.id === l.productId));
  const total = valid.reduce(
    (s, l) => s + unitPrice(PRODUCTS.find((p) => p.id === l.productId)!, l.variantId) * l.qty,
    0,
  );

  // customer fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState("");
  const [comment, setComment] = useState("");
  const [isLegal, setIsLegal] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgInn, setOrgInn] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("invoice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const payMethods: { id: PaymentMethod; label: string; sub: string }[] = [
    { id: "gram", label: "GRAM", sub: "Оплата крипто-кошельком GRAM" },
    { id: "yookassa", label: "Банковской картой", sub: "ЮKassa · Visa, MC, МИР, СБП" },
    { id: "invoice", label: "Счёт для юр.лица", sub: "Выставим счёт с реквизитами" },
  ];

  const totalItems = valid.reduce((s, l) => s + l.qty, 0);

  if (valid.length === 0) {
    return (
      <>
        <Topbar back title="Оформление" />
        <div className="empty">
          <div className="big">🧺</div>
          <div className="t">Корзина пуста</div>
        </div>
      </>
    );
  }

  const submit = async () => {
    setError("");
    if (!name.trim() || !phone.trim()) {
      setError("Укажите имя и телефон для связи.");
      return;
    }
    if (isLegal && (!orgName.trim() || !orgInn.trim())) {
      setError("Для юр.лица укажите название и ИНН организации.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: valid.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })),
          customer: {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            delivery: delivery.trim() || undefined,
            comment: comment.trim() || undefined,
            isLegalEntity: isLegal,
            orgDetails: isLegal
              ? { name: orgName.trim(), inn: orgInn.trim(), email: orgEmail.trim() || undefined }
              : undefined,
          },
          paymentMethod: method,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.order) {
        setError(data.error ?? "Не удалось оформить заказ. Попробуйте ещё раз.");
        return;
      }
      clear();
      const order = data.order;
      if (method === "invoice" || !data.payUrl) {
        router.push(`/order/${order.id}`);
      } else {
        // go to provider page
        window.location.href = data.payUrl;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Topbar back title="Оформление заказа" />

      {/* summary */}
      <div className="section" style={{ marginTop: 12, padding: "12px var(--content-pad)" }}>
        <div className="amount-row">
          <span className="muted">Товары ({totalItems})</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="amount-row total">
          <span>К оплате</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>

      {/* contacts */}
      <div className="section" style={{ marginTop: 10, padding: "14px var(--content-pad)" }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Контактные данные</div>
        <div className="field" style={{ marginBottom: 10 }}>
          <input placeholder="Имя и фамилия *" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <input placeholder="Телефон *" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <input placeholder="Email (необязательно)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <input placeholder="Адрес / самовывоз (необязательно)" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        </div>
        <div className="field">
          <textarea
            rows={2}
            placeholder="Комментарий к заказу"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>

      {/* legal toggle */}
      <label className="section" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, padding: "14px var(--content-pad)", cursor: "pointer" }}>
        <input type="checkbox" checked={isLegal} onChange={(e) => { setIsLegal(e.target.checked); if (e.target.checked) setMethod("invoice"); }} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
        <div>
          <div style={{ fontWeight: 600 }}>Я юридическое лицо</div>
          <div className="muted" style={{ fontSize: 13 }}>Выставим счёт с реквизитами</div>
        </div>
      </label>

      {isLegal && (
        <div className="section" style={{ marginTop: 10, padding: "14px var(--content-pad)" }}>
          <div className="field" style={{ marginBottom: 10 }}>
            <input placeholder="Название организации *" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <input placeholder="ИНН *" value={orgInn} onChange={(e) => setOrgInn(e.target.value)} />
          </div>
          <div className="field">
            <input placeholder="Email для счёта" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} />
          </div>
        </div>
      )}

      {/* payment */}
      <div className="section" style={{ marginTop: 10, padding: "14px var(--content-pad)" }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>Способ оплаты</div>
        <div className="seg">
          {payMethods.map((m) => (
            <label key={m.id} className="seg-opt" style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="pay"
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{m.label}</div>
                <div className="muted" style={{ fontSize: 13 }}>{m.sub}</div>
              </div>
            </label>
          ))}
        </div>
        {isLegal && (
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Для юридического лица доступен счёт с реквизитами.
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: "var(--red)", padding: "8px var(--content-pad)", fontSize: 14 }}>{error}</div>
      )}

      <div className="block-pad mt">
        <button className="btn green" disabled={busy} onClick={submit}>
          {busy ? "Оформляем…" : method === "invoice" ? "Оформить счёт" : `Перейти к оплате · ${formatMoney(total)}`}
        </button>
      </div>
      <div style={{ height: 20 }} />
    </>
  );
}
