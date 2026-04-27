import { PageHeader } from "@/components/page-header";
import { AcompanhanteConfiguracaoClient } from "@/features/acompanhantes/acompanhantes-client";

type AcompanhanteConfiguracaoPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AcompanhanteConfiguracaoPage({
  params,
}: AcompanhanteConfiguracaoPageProps) {
  const { id } = await params;
  const creating = id === "novo";

  return (
    <section className="page-stack">
      <PageHeader
        title={creating ? "Nova acompanhante" : "Editar acompanhante"}
        description="Cadastre identidade, oferta, mídias, locais e preferências. Comportamento e regras do agente são definidos pela engenharia."
        eyebrow="Catálogo · Acompanhantes"
        secondaryAction={{ label: "Lista de acompanhantes", href: "/acompanhantes" }}
      />
      <AcompanhanteConfiguracaoClient escortId={id} />
    </section>
  );
}
