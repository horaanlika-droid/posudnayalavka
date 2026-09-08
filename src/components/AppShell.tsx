"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingCart, LifeBuoy, User } from "lucide-react";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "Магазин", icon: Home },
  { href: "/support", label: "Чат", icon: LifeBuoy },
  { href: "/cart", label: "Корзина", icon: ShoppingCart },
  { href: "/account", label: "Ещё", icon: User },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { count } = useStore();

  // Hide the bottom nav on full-screen checkout steps.
  const hideNav = pathname.startsWith("/checkout") || pathname.startsWith("/order/success");

  return (
    <div className="app-frame">
      <main className="app-content">{children}</main>

      {!hideNav && (
        <nav className="bottomnav">
          {NAV.map((n) => {
            const active =
              n.href === "/"
                ? pathname === "/"
                : pathname === n.href || pathname.startsWith(n.href + "/");
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} className={active ? "active" : ""}>
                <span style={{ position: "relative" }}>
                  <Icon size={24} strokeWidth={active ? 2.4 : 2} />
                  {n.href === "/cart" && count > 0 && <span className="badge">{count}</span>}
                </span>
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
