import { PageHeader } from "@/components/page-header";
import { AgenteConfiguracaoClient } from "@/features/agentes/agentes-client";

type AgenteConfiguracaoPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AgenteConfiguracaoPage({ params }: AgenteConfiguracaoPageProps) {
  const { id } = await params;
  const creating = id === "novo";

  return (
    <section className="page-stack">
      <PageHeader
        title={creating ? "Novo agente" : "Configurar agente"}
        description="Defina persona, oferta, qualificacao, agenda, precos e limites comerciais sem expor detalhes tecnicos no fluxo principal."
        eyebrow="Configuracao · Agentes"
        secondaryAction={{ label: "Lista de agentes", href: "/agentes" }}
      />
      <AgenteConfiguracaoClient agentId={id} />
    </section>
  );
}
