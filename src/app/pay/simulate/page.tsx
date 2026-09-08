"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function SimulateInner() {
  const params = useSearchParams();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    const ref = params.get("ref") ?? params.get("orderId") ?? params.get("order");
    if (!ref || done.current) return;
    done.current = true;
    (async () => {
      await fetch(`/api/orders/${encodeURIComponent(ref)}/mark-paid`, { method: "POST" });
      router.replace(`/order/${encodeURIComponent(ref)}?paid=1`);
    })();
  }, [params, router]);

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", textAlign: "center", padding: 30 }}>
      <div>
        <div style={{ fontSize: 60 }}>🧪</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginTop: 8 }}>Демо-режим оплаты</div>
        <p className="muted" style={{ marginTop: 6 }}>
          Платёжные ключи не заполнены, поэтому оплата имитируется успешной.
          Подключите GRAM / ЮKassa в переменных окружения на сервере.
        </p>
        <div className="muted" style={{ fontSize: 13 }}>Перенаправляем к заказу…</div>
      </div>
    </div>
  );
}

export default function SimulatePayPage() {
  return (
    <Suspense fallback={null}>
      <SimulateInner />
    </Suspense>
  );
}
