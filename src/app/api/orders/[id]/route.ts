import { NextResponse } from "next/server";
import { getOrder, updateOrder } from "@/lib/orders";
import { env, isSimulation } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/orders/:id
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ order });
}

// PATCH /api/orders/:id  {status?}
// Used by admin bot / tooling. Basic guard via shared secret is optional.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as { status?: string };
  if (body.status) {
    const allowed = ["new", "confirmed", "paid", "shipped", "completed", "cancelled"];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: "bad status" }, { status: 400 });
    }
    const order = await updateOrder(id, { status: body.status as never });
    return order
      ? NextResponse.json({ order })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "no patch" }, { status: 400 });
}
