"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  EscortDetailRead,
  EscortPatchInput,
  EscortRead,
  EscortServiceRead,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, bffSend, type BffFetchError } from "@/features/shared/bff-client";
import { formatDateTime } from "@/features/shared/formatters";
import { escortPendencyKindLabel } from "@/features/shared/labels";
import { detectEscortPendencies } from "@/features/shared/pending";

const POLL_INTERVAL_MS = 30_000;

type Tab = "resumo" | "oferta" | "midias" | "local";

const TAB_LABELS: Record<Tab, string> = {
  resumo: "Resumo",
  oferta: "Oferta",
  midias: "Mídias",
  local: "Local",
};

const TAB_ORDER: Tab[] = ["resumo", "oferta", "midias", "local"];

type Notice = { tone: "ok" | "error"; message: string };

export function AcompanhantesListClient() {
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<EscortRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const result = await bffFetch<PaginatedEnvelope<EscortRead>>(
      "/api/operator/escorts?page=1&page_size=100",
    );
    setEnvelope(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const items = envelope?.items ?? [];

  const onToggleActive = useCallback(
    async (escort: EscortRead) => {
      setBusyId(escort.id);
      setNotice(null);
      const result = await bffSend<EscortRead>(
        `/api/operator/escorts/${encodeURIComponent(escort.id)}`,
        { is_active: !escort.is_active },
        "PATCH",
      );
      setBusyId(null);
      if (result.error) {
        setNotice({
          tone: "error",
          message: escort.is_active
            ? "Não consegui inativar a acompanhante agora."
            : "Não consegui ativar a acompanhante agora.",
        });
        return;
      }
      setNotice({
        tone: "ok",
        message: escort.is_active
          ? "Acompanhante inativada. A operação fica sem acompanhante ativa até você ativar outra."
          : "Acompanhante ativada. As demais foram desativadas automaticamente.",
      });
      await load();
    },
    [load],
  );

  if (loading && !envelope) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando acompanhantes</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  if (error && !envelope) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Não consegui carregar as acompanhantes</h2>
          <span className="badge danger">Erro</span>
        </div>
        <p>{error.message}</p>
        <button className="button secondary" type="button" onClick={() => void load()}>
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Cadastradas</h2>
        <span className="badge muted">{items.length}</span>
      </div>
      {notice ? (
        <div className={notice.tone === "ok" ? "panel-notice ok" : "panel-notice"}>
          {notice.message}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="empty-state">
          Nenhuma acompanhante cadastrada. Clique em &quot;Nova acompanhante&quot; para começar.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table" aria-label="Lista de acompanhantes">
            <thead>
              <tr>
                <th>Acompanhante</th>
                <th>Status</th>
                <th>Idiomas</th>
                <th>Pendências</th>
                <th>Atualizada</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((escort) => {
                const pendencies = detectEscortPendencies(escort);
                return (
                  <tr key={escort.id}>
                    <td>
                      <strong>{escort.display_name}</strong>
                    </td>
                    <td>
                      <span className={escort.is_active ? "badge ok" : "badge muted"}>
                        {escort.is_active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td>{escort.languages.length ? escort.languages.join(", ") : "—"}</td>
                    <td>
                      <span className={pendencies.length === 0 ? "badge ok" : "badge warning"}>
                        {pendencies.length}
                      </span>
                    </td>
                    <td>{formatDateTime(escort.updated_at)}</td>
                    <td>
                      <div className="inline-actions">
                        <Link
                          className="button secondary"
                          href={`/acompanhantes/${escort.id}/configuracao`}
                        >
                          Editar
                        </Link>
                        <button
                          className="button secondary"
                          type="button"
                          disabled={busyId === escort.id}
                          onClick={() => void onToggleActive(escort)}
                        >
                          {busyId === escort.id
                            ? "Salvando..."
                            : escort.is_active
                              ? "Inativar"
                              : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type EscortDraft = {
  display_name: string;
  is_active: boolean;
  languages_text: string;
  calendar_external_id: string;
};

type ServiceDraft = {
  name: string;
  description: string;
  duration_minutes: string;
  price_brl: string;
  restrictions: string;
};

type LocationDraft = {
  place_name: string;
  place_address: string;
  place_reference_points: string;
  accepts_displacement: boolean;
  displacement_fee_brl: string;
};

const EMPTY_ESCORT: EscortDraft = {
  display_name: "",
  is_active: false,
  languages_text: "pt-BR",
  calendar_external_id: "",
};

const EMPTY_LOCATION: LocationDraft = {
  place_name: "",
  place_address: "",
  place_reference_points: "",
  accepts_displacement: false,
  displacement_fee_brl: "",
};

export function AcompanhanteConfiguracaoClient({ escortId }: { escortId: string }) {
  const router = useRouter();
  const creating = escortId === "novo";
  const [tab, setTab] = useState<Tab>("resumo");
  const [escort, setEscort] = useState<EscortDraft>(EMPTY_ESCORT);
  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [location, setLocation] = useState<LocationDraft>(EMPTY_LOCATION);
  const [loading, setLoading] = useState(!creating);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadedEscort, setLoadedEscort] = useState<EscortRead | null>(null);

  const load = useCallback(async () => {
    if (creating) return;
    const result = await bffFetch<EscortDetailRead>(
      `/api/operator/escorts/${encodeURIComponent(escortId)}`,
    );
    if (result.error || !result.data) {
      setNotice({
        tone: "error",
        message: result.error?.message ?? "Não consegui carregar essa acompanhante.",
      });
      setLoading(false);
      return;
    }
    const detail = result.data;
    setLoadedEscort(detail.escort);
    setEscort(escortToDraft(detail.escort));
    setServices(detail.services.map(serviceToDraft));
    setLocation(locationFromEscort(detail.escort));
    setLoading(false);
  }, [creating, escortId]);

  useEffect(() => {
    void load();
  }, [load]);

  const calendarMissing = !escort.calendar_external_id.trim();

  const livePendencies = useMemo(
    () =>
      detectEscortPendencies({
        ...EMPTY_ESCORT_READ,
        display_name: escort.display_name,
        languages: parseLanguages(escort.languages_text),
        calendar_external_id: escort.calendar_external_id.trim() || null,
        place_address: location.place_address.trim() || null,
        accepts_displacement: location.accepts_displacement,
      }),
    [escort, location],
  );

  const onSubmitMain = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setNotice(null);
      const displayName = escort.display_name.trim();
      if (!displayName) {
        setNotice({ tone: "error", message: "Informe o nome de exibição." });
        return;
      }
      setSaving(true);
      if (creating) {
        // Criação enxuta: só nome. Idiomas, calendar (time tecnico), local e
        // oferta entram nas abas seguintes apos o cadastro existir.
        const result = await bffSend<EscortRead>("/api/operator/escorts", {
          display_name: displayName,
        });
        setSaving(false);
        if (result.error || !result.data) {
          setNotice({
            tone: "error",
            message: result.error?.message ?? "Não consegui criar a acompanhante.",
          });
          return;
        }
        router.replace(`/acompanhantes/${result.data.id}/configuracao`);
        return;
      }
      const payload: EscortPatchInput = {
        display_name: displayName,
        is_active: escort.is_active,
        languages: parseLanguages(escort.languages_text),
        calendar_external_id: escort.calendar_external_id.trim() || null,
      };
      const result = await bffSend<EscortRead>(
        `/api/operator/escorts/${encodeURIComponent(escortId)}`,
        payload,
        "PATCH",
      );
      setSaving(false);
      if (result.error || !result.data) {
        setNotice({
          tone: "error",
          message: result.error?.message ?? "Não consegui salvar.",
        });
        return;
      }
      setLoadedEscort(result.data);
      setNotice({ tone: "ok", message: "Cadastro atualizado." });
    },
    [creating, escort, escortId, router],
  );

  const onSaveServices = useCallback(async () => {
    if (creating || !loadedEscort) {
      setNotice({ tone: "error", message: "Salve a acompanhante antes de cadastrar serviços." });
      return;
    }
    const payload = services.map((service, index) => ({
      name: service.name.trim(),
      description: service.description.trim() || null,
      duration_minutes: parseIntOrZero(service.duration_minutes),
      price_cents: brlToCents(service.price_brl),
      restrictions: service.restrictions.trim() || null,
      sort_order: index,
    }));
    const invalid = payload.find((s) => !s.name || s.duration_minutes <= 0);
    if (invalid) {
      setNotice({ tone: "error", message: "Cada serviço precisa de nome e duração." });
      return;
    }
    setSaving(true);
    await putJson(
      `/api/operator/escorts/${encodeURIComponent(loadedEscort.id)}/services`,
      payload,
    )
      .then(() => setNotice({ tone: "ok", message: "Oferta atualizada." }))
      .catch(() => setNotice({ tone: "error", message: "Não consegui salvar a oferta." }))
      .finally(() => setSaving(false));
  }, [creating, loadedEscort, services]);

  const onSaveLocation = useCallback(async () => {
    if (creating || !loadedEscort) {
      setNotice({ tone: "error", message: "Salve a acompanhante antes de cadastrar o local." });
      return;
    }
    const fee = location.accepts_displacement
      ? brlToCents(location.displacement_fee_brl)
      : 0;
    const payload: EscortPatchInput = {
      place_name: location.place_name.trim() || null,
      place_address: location.place_address.trim() || null,
      place_reference_points: location.place_reference_points.trim() || null,
      accepts_displacement: location.accepts_displacement,
      displacement_fee_cents: location.accepts_displacement && fee > 0 ? fee : null,
    };
    setSaving(true);
    const result = await bffSend<EscortRead>(
      `/api/operator/escorts/${encodeURIComponent(loadedEscort.id)}`,
      payload,
      "PATCH",
    );
    setSaving(false);
    if (result.error || !result.data) {
      setNotice({ tone: "error", message: "Não consegui salvar o local." });
      return;
    }
    setLoadedEscort(result.data);
    setNotice({ tone: "ok", message: "Local atualizado." });
  }, [creating, loadedEscort, location]);

  if (loading) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {notice ? (
        <div className={notice.tone === "ok" ? "panel-notice ok" : "panel-notice"}>
          {notice.message}
        </div>
      ) : null}

      <nav className="tab-bar" aria-label="Seções da acompanhante">
        {TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "tab active" : "tab"}
            onClick={() => setTab(id)}
            disabled={creating && id !== "resumo"}
            title={creating && id !== "resumo" ? "Salve o cadastro primeiro" : undefined}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>

      {tab === "resumo" ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Resumo</h2>
            {livePendencies.length > 0 ? (
              <span className="badge warning">{livePendencies.length} pendência(s)</span>
            ) : (
              <span className="badge ok">Pronto</span>
            )}
          </div>
          {creating ? (
            <p className="empty-state" style={{ textAlign: "left" }}>
              Cadastre o nome para criar. Idiomas, calendar (configurado pelo time
              técnico), local e oferta entram nas próximas abas depois que ela existir.
            </p>
          ) : null}
          <form className="form-grid" onSubmit={onSubmitMain} aria-label="Resumo da acompanhante">
            <label className="form-field">
              <span>Nome de exibição</span>
              <input
                type="text"
                value={escort.display_name}
                onChange={(event) => setEscort({ ...escort, display_name: event.target.value })}
                placeholder="Ex.: Alice"
                required
              />
            </label>
            {!creating ? (
              <>
                <label className="form-field">
                  <span>Idiomas (separe por vírgula)</span>
                  <input
                    type="text"
                    value={escort.languages_text}
                    onChange={(event) =>
                      setEscort({ ...escort, languages_text: event.target.value })
                    }
                    placeholder="pt-BR, en"
                  />
                </label>
                <label className="form-field">
                  <span>Google Calendar (configurado pelo time técnico)</span>
                  <input
                    type="text"
                    value={escort.calendar_external_id}
                    onChange={(event) =>
                      setEscort({ ...escort, calendar_external_id: event.target.value })
                    }
                    placeholder="agenda@..."
                  />
                </label>
                <label className="form-field">
                  <span>Status operacional</span>
                  <select
                    value={escort.is_active ? "active" : "inactive"}
                    onChange={(event) =>
                      setEscort({ ...escort, is_active: event.target.value === "active" })
                    }
                    disabled={calendarMissing}
                    title={
                      calendarMissing
                        ? "Aguardando configuração do calendar pelo time técnico"
                        : undefined
                    }
                  >
                    <option value="active">Ativa (atende)</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </label>
              </>
            ) : null}
            <div className="button-row" style={{ gridColumn: "1 / -1" }}>
              <button className="button" type="submit" disabled={saving}>
                {saving ? "Salvando..." : creating ? "Criar acompanhante" : "Salvar"}
              </button>
            </div>
          </form>
          {livePendencies.length > 0 ? (
            <ul className="stack-sm" style={{ marginTop: 14 }}>
              {livePendencies.map((pendency) => (
                <li key={`${pendency.kind}:${pendency.path}`}>
                  <span className="chip warning">{escortPendencyKindLabel(pendency.kind)}</span>
                  <span className="muted-cell">{pendency.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {tab === "oferta" && loadedEscort ? (
        <ServicesPanel
          services={services}
          onChange={setServices}
          onSave={onSaveServices}
          saving={saving}
        />
      ) : null}

      {tab === "midias" && loadedEscort ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Mídias</h2>
            <Link
              className="button secondary"
              href={`/midias?model_id=${encodeURIComponent(loadedEscort.id)}`}
            >
              Abrir galeria
            </Link>
          </div>
          <p className="empty-state" style={{ textAlign: "left" }}>
            As mídias dessa acompanhante são gerenciadas no módulo de mídias, com filtro
            automático aplicado.
          </p>
        </section>
      ) : null}

      {tab === "local" && loadedEscort ? (
        <LocalPanel
          location={location}
          onChange={setLocation}
          onSave={onSaveLocation}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

function ServicesPanel({
  services,
  onChange,
  onSave,
  saving,
}: {
  services: ServiceDraft[];
  onChange: (next: ServiceDraft[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Oferta</h2>
        <span className="badge muted">{services.length} serviço(s)</span>
      </div>
      <p className="empty-state" style={{ textAlign: "left" }}>
        Cadastre o que ela oferece, com duração e preço. Tudo o que estiver aqui é o que o
        agente pode propor — nada além.
      </p>
      <div className="stack-sm">
        {services.map((service, index) => (
          <fieldset key={index} className="form-grid" style={{ borderTop: "1px solid #2a2a2a", paddingTop: 12 }}>
            <label className="form-field">
              <span>Nome do serviço</span>
              <input
                type="text"
                value={service.name}
                onChange={(event) =>
                  onChange(updateAt(services, index, { ...service, name: event.target.value }))
                }
                placeholder="Ex.: Encontro padrão"
                required
              />
            </label>
            <label className="form-field">
              <span>Duração (minutos)</span>
              <input
                type="number"
                min={1}
                value={service.duration_minutes}
                onChange={(event) =>
                  onChange(
                    updateAt(services, index, { ...service, duration_minutes: event.target.value }),
                  )
                }
                placeholder="60"
                required
              />
            </label>
            <label className="form-field">
              <span>Preço (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                value={service.price_brl}
                onChange={(event) =>
                  onChange(updateAt(services, index, { ...service, price_brl: event.target.value }))
                }
                placeholder="500,00"
              />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>Descrição</span>
              <textarea
                rows={2}
                value={service.description}
                onChange={(event) =>
                  onChange(
                    updateAt(services, index, { ...service, description: event.target.value }),
                  )
                }
                placeholder="O que está incluso, contexto"
              />
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>Restrições</span>
              <textarea
                rows={2}
                value={service.restrictions}
                onChange={(event) =>
                  onChange(
                    updateAt(services, index, { ...service, restrictions: event.target.value }),
                  )
                }
                placeholder="O que NÃO faz parte"
              />
            </label>
            <div className="button-row" style={{ gridColumn: "1 / -1" }}>
              <button
                className="button secondary"
                type="button"
                onClick={() => onChange(services.filter((_, i) => i !== index))}
              >
                Remover serviço
              </button>
            </div>
          </fieldset>
        ))}
      </div>
      <div className="button-row">
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            onChange([
              ...services,
              {
                name: "",
                description: "",
                duration_minutes: "",
                price_brl: "",
                restrictions: "",
              },
            ])
          }
        >
          Adicionar serviço
        </button>
        <button className="button" type="button" onClick={onSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar oferta"}
        </button>
      </div>
    </section>
  );
}

function LocalPanel({
  location,
  onChange,
  onSave,
  saving,
}: {
  location: LocationDraft;
  onChange: (next: LocationDraft) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Local de atendimento</h2>
      </div>
      <p className="empty-state" style={{ textAlign: "left" }}>
        Onde ela atende fixo. Se não tem local fixo (só desloca para o cliente),
        deixe em branco e marque &quot;aceita deslocamento&quot;.
      </p>
      <div className="form-grid">
        <label className="form-field">
          <span>Nome do local</span>
          <input
            type="text"
            value={location.place_name}
            onChange={(event) => onChange({ ...location, place_name: event.target.value })}
            placeholder="Ex.: Apartamento Barra"
          />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Endereço (rua, número, apto, complemento)</span>
          <input
            type="text"
            value={location.place_address}
            onChange={(event) => onChange({ ...location, place_address: event.target.value })}
            placeholder="Av. das Américas, 100, apto 200"
          />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Referências (pontos próximos)</span>
          <textarea
            rows={2}
            value={location.place_reference_points}
            onChange={(event) =>
              onChange({ ...location, place_reference_points: event.target.value })
            }
            placeholder="Próximo ao shopping X, em frente ao metrô Y"
          />
        </label>
        <label className="form-field">
          <span>Aceita deslocamento?</span>
          <select
            value={location.accepts_displacement ? "yes" : "no"}
            onChange={(event) =>
              onChange({ ...location, accepts_displacement: event.target.value === "yes" })
            }
          >
            <option value="no">Não</option>
            <option value="yes">Sim</option>
          </select>
        </label>
        {location.accepts_displacement ? (
          <label className="form-field">
            <span>Taxa de deslocamento (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              value={location.displacement_fee_brl}
              onChange={(event) =>
                onChange({ ...location, displacement_fee_brl: event.target.value })
              }
              placeholder="0,00 (deixe em branco se a taxa varia)"
            />
          </label>
        ) : null}
        <div className="button-row" style={{ gridColumn: "1 / -1" }}>
          <button className="button" type="button" onClick={onSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar local"}
          </button>
        </div>
      </div>
    </section>
  );
}

const EMPTY_ESCORT_READ: EscortRead = {
  id: "",
  display_name: "",
  is_active: false,
  languages: [],
  calendar_external_id: null,
  photo_main_path: null,
  min_duration_minutes: null,
  advance_booking_minutes: null,
  max_bookings_per_day: null,
  preferences_json: {},
  place_name: null,
  place_address: null,
  place_reference_points: null,
  accepts_displacement: false,
  displacement_fee_cents: null,
  created_at: "",
  updated_at: "",
};

function escortToDraft(escort: EscortRead): EscortDraft {
  return {
    display_name: escort.display_name,
    is_active: escort.is_active,
    languages_text: escort.languages.join(", "),
    calendar_external_id: escort.calendar_external_id ?? "",
  };
}

function serviceToDraft(service: EscortServiceRead): ServiceDraft {
  return {
    name: service.name,
    description: service.description ?? "",
    duration_minutes: String(service.duration_minutes),
    price_brl: centsToBrl(service.price_cents),
    restrictions: service.restrictions ?? "",
  };
}

function locationFromEscort(escort: EscortRead): LocationDraft {
  return {
    place_name: escort.place_name ?? "",
    place_address: escort.place_address ?? "",
    place_reference_points: escort.place_reference_points ?? "",
    accepts_displacement: escort.accepts_displacement,
    displacement_fee_brl:
      escort.displacement_fee_cents !== null
        ? centsToBrl(escort.displacement_fee_cents)
        : "",
  };
}

function parseLanguages(text: string): string[] {
  return text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseIntOrZero(value: string): number {
  const parsed = parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brlToCents(value: string): number {
  const cleaned = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function centsToBrl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function updateAt<T>(items: T[], index: number, next: T): T[] {
  const copy = items.slice();
  copy[index] = next;
  return copy;
}

async function putJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PUT ${url} returned ${response.status}`);
  }
}
