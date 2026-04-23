"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/conversas", label: "Conversas" },
  { href: "/handoffs", label: "Transferências" },
  { href: "/agenda", label: "Agenda" },
  { href: "/midias", label: "Fotos e mídias" },
  { href: "/modelos", label: "Minha modelo" },
  { href: "/status", label: "Status do sistema" },
];

export function OperatorNav() {
  const pathname = usePathname();

  return (
    <aside className="operator-nav" aria-label="Menu principal">
      <Link className="brand" href="/dashboard" aria-label="BarraVips Operator">
        <span className="brand-main">BarraVips</span>
        <span className="brand-suffix">.operator</span>
      </Link>
      <nav className="nav-list">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link key={link.href} className={active ? "nav-link active" : "nav-link"} href={link.href}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
