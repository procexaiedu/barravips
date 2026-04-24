"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import type { DashboardSummaryRead, ModelRead, PaginatedEnvelope, ReceiptRead } from "@/contracts";
import { bffFetch } from "@/features/shared/bff-client";

const NAV_POLL_MS = 30_000;

type NavCounts = {
  handoffs: number;
  pagamentos: number;
};

const NAV_GROUPS = [
  {
    label: "OPERAÇÃO",
    links: [
      { href: "/dashboard", label: "Operação hoje", countKey: null },
      { href: "/conversas", label: "Conversas", countKey: null },
      { href: "/handoffs", label: "Leads para assumir", countKey: "handoffs" as const },
      { href: "/comprovantes", label: "Comprovantes", countKey: "pagamentos" as const },
      { href: "/agenda", label: "Agenda", countKey: null },
      { href: "/financeiro", label: "Financeiro", countKey: null },
    ],
  },
  {
    label: "CONTEÚDO",
    links: [
      { href: "/midias", label: "Materiais", countKey: null },
    ],
  },
  {
    label: "CONFIGURAÇÃO",
    links: [
      { href: "/agentes", label: "Agentes", countKey: null },
      { href: "/status", label: "Saúde da operação", countKey: null },
    ],
  },
];

type OperatorNavProps = {
  userEmail?: string | null;
};

type ActiveAgent = {
  name: string;
  active: boolean;
};

export function OperatorNav({ userEmail = null }: OperatorNavProps) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>({ handoffs: 0, pagamentos: 0 });
  const [agent, setAgent] = useState<ActiveAgent | null>(null);

  useEffect(() => {
    const load = async () => {
      const [summary, receipts, model] = await Promise.all([
        bffFetch<DashboardSummaryRead>("/api/operator/dashboard/summary?window=24h"),
        bffFetch<PaginatedEnvelope<ReceiptRead>>(
          "/api/operator/receipts?needs_review=true&page_size=1",
        ),
        bffFetch<ModelRead>("/api/operator/models/active"),
      ]);

      setCounts({
        handoffs: summary.data?.handoffs_opened?.value ?? 0,
        pagamentos: receipts.data?.total ?? 0,
      });

      setAgent(
        model.data
          ? { name: model.data.display_name, active: model.data.is_active }
          : null,
      );
    };

    void load();
    const id = window.setInterval(() => void load(), NAV_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside className="operator-nav" aria-label="Menu principal">
      <Link className="brand" href="/dashboard" aria-label="BarraVips Operator">
        <span className="brand-main">BarraVips</span>
        <span className="brand-suffix">.operator</span>
      </Link>

      <div className={agent ? "agent-pill" : "agent-pill empty"}>
        <span className={`agent-pill-dot ${agent?.active ? "active" : "inactive"}`} />
        <span className="agent-pill-name">
          {agent ? agent.name : "Sem agente ativo"}
        </span>
        {agent ? (
          <span className={`agent-pill-status ${agent.active ? "" : "inactive"}`}>
            {agent.active ? "Ativo" : "Inativo"}
          </span>
        ) : null}
      </div>

      <nav className="nav-list">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="nav-group">
            <span className="nav-group-label">{group.label}</span>
            {group.links.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
              const count = link.countKey ? counts[link.countKey] : 0;
              return (
                <Link
                  key={link.href}
                  className={active ? "nav-link active" : "nav-link"}
                  href={link.href}
                >
                  <span className="nav-link-label">{link.label}</span>
                  {count > 0 ? (
                    <span className="nav-badge">{count > 99 ? "99+" : count}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {userEmail ? (
        <div className="nav-user">
          <span className="nav-user-email" title={userEmail}>
            {userEmail}
          </span>
          <form method="POST" action="/logout">
            <button type="submit" className="button secondary nav-user-logout">
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
