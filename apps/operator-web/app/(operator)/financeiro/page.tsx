import { PageHeader } from "@/components/page-header";
import { FinancialClient } from "@/features/financial/financial-client";

export default function FinanceiroPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Financeiro"
        description="Pipeline aberto, ticket médio, divergência de comprovantes, crescimento, conversão e receita projetada."
      />
      <FinancialClient />
    </section>
  );
}
