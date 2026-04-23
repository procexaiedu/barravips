import { PageHeader } from "@/components/page-header";
import { MidiasClient } from "@/features/midias/midias-client";

export default function MidiasPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Fotos e mídias"
        description="Envie fotos, áudios e vídeos da modelo, aprove o que a IA pode mandar para os clientes e ajuste as categorias."
      />
      <MidiasClient />
    </section>
  );
}
