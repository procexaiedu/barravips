import { PageHeader } from "@/components/page-header";
import { ConversaDetalheClient } from "@/features/conversas/conversa-detalhe-client";

export default async function ConversaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section className="page-stack">
      <PageHeader
        title="Conversa"
        description="Histórico completo de mensagens, situação atual, transferências para a modelo e mídias enviadas."
      />
      <ConversaDetalheClient conversationId={id} />
    </section>
  );
}
