import { NextResponse } from "next/server";
import { getOrder } from "@/lib/orders";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";

// GET /api/orders/:id/invoice — printable HTML счёт (счёт на оплату) for legal entities.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const o = env.org;
  const payee = order.customer.orgDetails?.name ?? order.customer.name;
  const inn = order.customer.orgDetails?.inn ?? "—";

  const rows = order.items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${it.title}${it.variantLabel ? " (" + it.variantLabel + ")" : ""}</td>
        <td>${it.qty}</td>
        <td>${formatMoney(it.priceMinor)}</td>
        <td>${formatMoney(it.priceMinor * it.qty)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Счёт №${order.number}</title>
<style>
body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 20px;font-size:14px}
h1{font-size:22px;margin:6px 0}
.muted{color:#666}
table{width:100%;border-collapse:collapse;margin:18px 0}
th,td{border:1px solid #ccc;padding:7px 9px;text-align:left}
th{background:#f4f4f4}
.right{text-align:right}
.big{font-size:18px;font-weight:700}
.mt{margin-top:22px}
.requisites{line-height:1.7}
@media print{body{margin:0}}
</style></head><body>
<p class="muted">Поставщик: ${o.name || "—"} · ИНН ${o.inn || "—"}</p>
<p>Покупатель: ${payee} · ИНН ${inn}</p>
<h1>Счёт на оплату № ${order.number}</h1>
<p class="muted">от ${new Date(order.createdAt).toLocaleDateString("ru-RU")}</p>

<table>
<tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>
${rows}
<tr><td colspan="4" class="right"><b>Итого:</b></td><td class="right big">${formatMoney(order.amountMinor)}</td></tr>
</table>

<div class="requisites">
<b>Реквизиты поставщика</b><br>
${o.name ? "Наименование: " + o.name + "<br>" : ""}
${o.inn ? "ИНН: " + o.inn + "<br>" : ""}${o.kpp ? "КПП: " + o.kpp + "<br>" : ""}
${o.bank ? "Банк: " + o.bank + "<br>" : ""}${o.bik ? "БИК: " + o.bik + "<br>" : ""}
${o.account ? "Расчётный счёт: " + o.account + "<br>" : ""}
${o.corrAccount ? "Корр. счёт: " + o.corrAccount + "<br>" : ""}
${o.address ? "Адрес: " + o.address + "<br>" : ""}
</div>

<div class="mt">Руководитель: ${o.ceo || "______________"}<br>
Основание: ${o.basis}</div>
<p style="margin-top:30px" class="muted">Счёт действителен для оплаты. После оплаты просим сообщить об этом менеджеру (${o.phone || "—"} / ${o.email || "—"}).</p>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
