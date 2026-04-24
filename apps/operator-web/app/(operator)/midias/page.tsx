import { PageHeader } from "@/components/page-header";
import { MidiasClient } from "@/features/midias/midias-client";

export default function MidiasPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Biblioteca de materiais"
        description="Arquivos comerciais que o agente pode usar nas conversas, com categoria, instrução de uso e aprovação."
        eyebrow="Conteúdo · Materiais"
      />
      <MidiasClient />
    </section>
  );
}
