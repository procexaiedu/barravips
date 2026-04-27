import { PageHeader } from "@/components/page-header";
import { FinancialClient } from "@/features/financial/financial-client";

export default function FinanceiroPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Financeiro"
        description="Quanto recebeu, quanto falta receber e o que precisa de atenção."
      />
      <FinancialClient />
    </section>
  );
}
