"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  DashboardSummaryRead,
  ModelCreateInput,
  ModelPatchInput,
  ModelRead,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, bffSend, type BffFetchError } from "@/features/shared/bff-client";
import { formatDateTime } from "@/features/shared/formatters";
import { modelPendencyKindLabel } from "@/features/shared/labels";
import { detectModelPendencies } from "@/features/shared/pending";

const POLL_INTERVAL_MS = 30_000;
const PENDING_TOKEN = "PENDING_DECISION";

type JsonObject = Record<string, unknown>;
type AgentTab =
  | "resumo"
  | "persona"
  | "oferta"
  | "qualificacao"
  | "agenda"
  | "precos"
  | "materiais"
  | "avancado";

type AgentDraft = {
  display_name: string;
  is_active: boolean;
  languages_text: string;
  calendar_external_id: string;
  persona_json: JsonObject;
  services_json: JsonObject;
  pricing_json: JsonObject;
};

type Notice = {
  tone: "ok" | "warning" | "error";
  message: string;
};

type ListState = {
  envelope: PaginatedEnvelope<ModelRead> | null;
  summary: DashboardSummaryRead | null;
  error: BffFetchError | null;
  loading: boolean;
  firstLoad: boolean;
};

const EMPTY_DRAFT: AgentDraft = {
  display_name: "",
  is_active: false,
  languages_text: "pt-BR",
  calendar_external_id: "",
  persona_json: {},
  services_json: {},
  pricing_json: { currency: "BRL" },
};

const TABS: { id: AgentTab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "persona", label: "Persona" },
  { id: "oferta", label: "Oferta" },
  { id: "qualificacao", label: "Qualificacao" },
  { id: "agenda", label: "Agenda" },
  { id: "precos", label: "Precos e negociacao" },
  { id: "materiais", label: "Materiais" },
  { id: "avancado", label: "Avancado" },
];

export function AgentesListClient() {
  const [state, setState] = useState<ListState>({
    envelope: null,
    summary: null,
    error: null,
    loading: false,
    firstLoad: true,
  });
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [models, summary] = await Promise.all([
      bffFetch<PaginatedEnvelope<ModelRead>>("/api/operator/models?page=1&page_size=100"),
      bffFetch<DashboardSummaryRead>("/api/operator/dashboard/summary?window=24h"),
    ]);
    setState({
      envelope: models.data,
      summary: summary.data,
      error: models.error,
      loading: false,
      firstLoad: false,
    });
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const agents = state.envelope?.items ?? [];
  const activeAgent = agents.find((agent) => agent.is_active) ?? null;
  const activeConversations = state.summary?.active_conversations?.value ?? 0;
  const conversion = state.summary?.qualification_rate?.value ?? null;
  const totalPendencies = agents.reduce((sum, agent) => sum + detectModelPendencies(agent).length, 0);

  const onToggleActive = useCallback(
    async (agent: ModelRead) => {
      setBusyActionId(agent.id);
      setNotice(null);
      const result = await bffSend<ModelRead>(
        `/api/operator/models/${encodeURIComponent(agent.id)}`,
        { is_active: !agent.is_active },
        "PATCH",
      );
      setBusyActionId(null);

      if (result.error) {
        setNotice({
          tone: "error",
          message: agent.is_active
            ? "Nao consegui inativar o agente agora."
            : "Nao consegui ativar o agente agora.",
        });
        return;
      }

      setNotice({
        tone: "ok",
        message: agent.is_active
          ? "Agente inativado. Ative outro agente antes de operar atendimento automatico."
          : "Agente ativado. No MVP, os demais agentes ficam fora da operacao automatica.",
      });
      await load();
    },
    [load],
  );

  const onDuplicate = useCallback(
    async (agent: ModelRead) => {
      setBusyActionId(agent.id);
      setNotice(null);
      const payload: ModelCreateInput = {
        display_name: `${agent.display_name} copia`,
        is_active: false,
        languages: agent.languages,
        calendar_external_id: agent.calendar_external_id,
        persona_json: cloneJson(agent.persona_json),
        services_json: cloneJson(agent.services_json),
        pricing_json: cloneJson(agent.pricing_json),
      };
      const result = await bffSend<ModelRead>("/api/operator/models", payload);
      setBusyActionId(null);

      if (result.error || !result.data) {
        setNotice({ tone: "error", message: "Nao consegui duplicar o agente agora." });
        return;
      }

      setNotice({ tone: "ok", message: "Agente duplicado como rascunho inativo." });
      await load();
    },
    [load],
  );

  if (state.firstLoad) {
    return <LoadingPanel title="Carregando agentes" />;
  }

  if (state.error && !state.envelope) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Nao consegui carregar os agentes</h2>
          <span className="badge danger">Erro</span>
        </div>
        <p>{state.error.message}</p>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="section-stack">
      {notice ? <div className={noticeClassName(notice)}>{notice.message}</div> : null}
      <div className="metric-grid compact">
        <Metric label="Agentes ativos" value={activeAgent ? "1" : "0"} detail="MVP: uma operacao ativa" />
        <Metric label="Conversas ativas" value={String(activeConversations)} detail="Janela operacional atual" />
        <Metric label="Conversao" value={conversion === null ? "--" : `${conversion}%`} detail="Qualificacao recente" />
        <Metric label="Pendencias" value={String(totalPendencies)} detail="Campos que bloqueiam confianca" />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Lista de agentes</h2>
          <span className="badge muted">{state.loading ? "Atualizando" : `${agents.length} cadastrados`}</span>
        </div>

        {state.error ? <div className="panel-notice">{state.error.message}</div> : null}

        {agents.length === 0 ? (
          <div className="empty-state-card">
            <span className="empty-state-icon" aria-hidden="true" />
            <div className="empty-state-copy">
              <strong>Nenhum agente cadastrado ainda.</strong>
              <p>Crie o primeiro agente SDR para configurar persona, oferta, qualificacao, agenda e preco.</p>
              <Link className="button empty-state-action" href="/agentes/novo/configuracao">
                Novo agente
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table" aria-label="Lista de agentes">
              <thead>
                <tr>
                  <th>Nome do agente</th>
                  <th>Status</th>
                  <th>Nicho/persona</th>
                  <th>Canal</th>
                  <th>Conversas ativas</th>
                  <th>Conversao</th>
                  <th>Configuracao</th>
                  <th>Ultima atualizacao</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const pendencies = detectModelPendencies(agent);
                  const completion = configurationCompletion(agent);
                  return (
                    <tr key={agent.id}>
                      <td>
                        <div className="stack-sm">
                          <strong>{agent.display_name}</strong>
                          <span className="muted-cell">{agent.languages.length ? agent.languages.join(", ") : "Sem idioma"}</span>
                        </div>
                      </td>
                      <td>
                        <span className={agent.is_active ? "badge ok" : "badge muted"}>
                          {agent.is_active ? "Ativo" : pendencies.length > 0 ? "Rascunho" : "Inativo"}
                        </span>
                      </td>
                      <td>{agentPersonaSummary(agent)}</td>
                      <td>WhatsApp</td>
                      <td className="numeric">{agent.is_active ? activeConversations : 0}</td>
                      <td className="numeric">{agent.is_active && conversion !== null ? `${conversion}%` : "--"}</td>
                      <td>
                        <ProgressInline value={completion} />
                      </td>
                      <td>{formatDateTime(agent.updated_at)}</td>
                      <td>
                        <div className="inline-actions">
                          <Link className="button secondary" href={`/agentes/${encodeURIComponent(agent.id)}/configuracao`}>
                            Configurar
                          </Link>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={busyActionId === agent.id}
                            onClick={() => void onDuplicate(agent)}
                          >
                            Duplicar
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={busyActionId === agent.id}
                            onClick={() => void onToggleActive(agent)}
                          >
                            {agent.is_active ? "Inativar" : "Ativar"}
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
    </div>
  );
}

export function AgenteConfiguracaoClient({ agentId }: { agentId: string }) {
  const isCreate = agentId === "novo";
  const [agents, setAgents] = useState<ModelRead[]>([]);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT);
  const [activeTab, setActiveTab] = useState<AgentTab>("resumo");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rawPersona, setRawPersona] = useState("{}");
  const [rawServices, setRawServices] = useState("{}");
  const [rawPricing, setRawPricing] = useState("{}");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await bffFetch<PaginatedEnvelope<ModelRead>>("/api/operator/models?page=1&page_size=100");
    setLoading(false);
    setFirstLoad(false);
    setError(result.error);
    const items = result.data?.items ?? [];
    setAgents(items);

    if (!isCreate) {
      const agent = items.find((item) => item.id === agentId);
      if (agent) {
        const nextDraft = modelToDraft(agent);
        setDraft(nextDraft);
        setRawPersona(stringifyJson(nextDraft.persona_json));
        setRawServices(stringifyJson(nextDraft.services_json));
        setRawPricing(stringifyJson(nextDraft.pricing_json));
      }
    }
  }, [agentId, isCreate]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedAgent = useMemo(
    () => (isCreate ? null : agents.find((item) => item.id === agentId) ?? null),
    [agentId, agents, isCreate],
  );
  const pendencies = useMemo(
    () =>
      detectModelPendencies({
        id: selectedAgent?.id ?? "draft",
        display_name: draft.display_name,
        is_active: draft.is_active,
        languages: parseLanguages(draft.languages_text),
        calendar_external_id: draft.calendar_external_id.trim() || null,
        persona_json: draft.persona_json,
        services_json: draft.services_json,
        pricing_json: draft.pricing_json,
        created_at: selectedAgent?.created_at ?? new Date().toISOString(),
        updated_at: selectedAgent?.updated_at ?? new Date().toISOString(),
      }),
    [draft, selectedAgent],
  );
  const completion = configurationCompletionFromDraft(draft);
  const checklist = buildChecklist(draft);

  const save = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      setFormError(null);
      setNotice(null);

      let payload: ModelCreateInput;
      try {
        payload = draftToPayload(draft);
      } catch (issue) {
        setFormError(issue instanceof Error ? issue.message : "Revise os dados antes de salvar.");
        return;
      }

      setSaving(true);
      const result = isCreate
        ? await bffSend<ModelRead>("/api/operator/models", payload)
        : await bffSend<ModelRead>(
            `/api/operator/models/${encodeURIComponent(agentId)}`,
            payload as ModelPatchInput,
            "PATCH",
          );
      setSaving(false);

      if (result.error) {
        setFormError(saveErrorMessage(result.error, isCreate));
        return;
      }

      if (!result.data) {
        setFormError("O servidor nao devolveu o agente salvo.");
        return;
      }

      setNotice({ tone: "ok", message: isCreate ? "Agente criado." : "Configuracao salva." });
      if (isCreate) {
        window.history.replaceState(null, "", `/agentes/${encodeURIComponent(result.data.id)}/configuracao`);
      }
      await load();
    },
    [agentId, draft, isCreate, load],
  );

  const updatePersona = (next: JsonObject) => {
    setDraft((current) => ({ ...current, persona_json: next }));
    setRawPersona(stringifyJson(next));
  };
  const updateServices = (next: JsonObject) => {
    setDraft((current) => ({ ...current, services_json: next }));
    setRawServices(stringifyJson(next));
  };
  const updatePricing = (next: JsonObject) => {
    setDraft((current) => ({ ...current, pricing_json: next }));
    setRawPricing(stringifyJson(next));
  };

  if (firstLoad) {
    return <LoadingPanel title="Carregando configuracao" />;
  }

  if (!isCreate && !selectedAgent && !loading) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Agente nao encontrado</h2>
          <span className="badge danger">404</span>
        </div>
        <p>Volte para a lista e escolha um agente cadastrado.</p>
        <Link className="button secondary" href="/agentes">
          Voltar para agentes
        </Link>
      </section>
    );
  }

  return (
    <form className="section-stack" onSubmit={save}>
      {notice ? <div className={noticeClassName(notice)}>{notice.message}</div> : null}
      {formError ? <div className="panel-notice">{formError}</div> : null}
      {error ? <div className="panel-notice warning">{error.message}</div> : null}

      <section className="panel agent-config-hero">
        <div className="agent-config-title">
          <div>
            <p className="eyebrow">Configuracao do agente</p>
            <h2>{draft.display_name.trim() || "Novo agente SDR"}</h2>
            <p className="section-subtitle">
              Configure quem ele e, como fala, o que vende, quando qualifica e quando transfere para humano.
            </p>
          </div>
          <span className={draft.is_active ? "badge ok" : "badge muted"}>
            {draft.is_active ? "Ativo" : "Inativo"}
          </span>
        </div>
        <ProgressBlock value={completion} />
        <div className="button-row">
          <button className="button" type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar configuracao"}
          </button>
          <Link className="button secondary" href="/agentes">
            Voltar para lista
          </Link>
        </div>
      </section>

      <div className="agent-config-layout">
        <aside className="panel agent-checklist-panel">
          <div className="panel-heading compact">
            <h2>Checklist</h2>
            <span className={completion === 100 ? "badge ok" : "badge warning"}>{completion}%</span>
          </div>
          <ol className="agent-checklist">
            {checklist.map((item) => (
              <li key={item.label} className={item.done ? "done" : ""}>
                <span>{item.done ? "Completo" : "Pendente"}</span>
                <strong>{item.label}</strong>
              </li>
            ))}
          </ol>
        </aside>

        <main className="section-stack">
          <div className="resolve-tabs" role="tablist" aria-label="Abas de configuracao do agente">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "resolve-tab active" : "resolve-tab"}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "resumo" ? (
            <ResumoTab
              draft={draft}
              onChange={setDraft}
              pendencies={pendencies}
              selectedAgent={selectedAgent}
            />
          ) : null}
          {activeTab === "persona" ? (
            <PersonaTab value={draft.persona_json} onChange={updatePersona} />
          ) : null}
          {activeTab === "oferta" ? (
            <OfertaTab value={draft.services_json} onChange={updateServices} />
          ) : null}
          {activeTab === "qualificacao" ? (
            <QualificacaoTab value={draft.services_json} onChange={updateServices} />
          ) : null}
          {activeTab === "agenda" ? (
            <AgendaTab draft={draft} onChange={setDraft} />
          ) : null}
          {activeTab === "precos" ? (
            <PrecosTab value={draft.pricing_json} onChange={updatePricing} />
          ) : null}
          {activeTab === "materiais" ? (
            <MateriaisTab selectedAgent={selectedAgent} />
          ) : null}
          {activeTab === "avancado" ? (
            <AvancadoTab
              selectedAgent={selectedAgent}
              rawPersona={rawPersona}
              rawServices={rawServices}
              rawPricing={rawPricing}
              onChangePersonaText={setRawPersona}
              onChangeServicesText={setRawServices}
              onChangePricingText={setRawPricing}
              onApplyPersona={() => applyRaw(rawPersona, updatePersona, setFormError)}
              onApplyServices={() => applyRaw(rawServices, updateServices, setFormError)}
              onApplyPricing={() => applyRaw(rawPricing, updatePricing, setFormError)}
            />
          ) : null}
        </main>
      </div>
    </form>
  );
}

function ResumoTab({
  draft,
  onChange,
  pendencies,
  selectedAgent,
}: {
  draft: AgentDraft;
  onChange: (next: AgentDraft) => void;
  pendencies: ReturnType<typeof detectModelPendencies>;
  selectedAgent: ModelRead | null;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Resumo comercial</h2>
        <span className={pendencies.length === 0 ? "badge ok" : "badge warning"}>
          {pendencies.length === 0 ? "Pronto" : `${pendencies.length} pendencias`}
        </span>
      </div>
      <div className="form-grid">
        <label className="form-field">
          <span>Nome do agente</span>
          <input
            value={draft.display_name}
            placeholder="Ex.: Ana SDR"
            onChange={(event) => onChange({ ...draft, display_name: event.target.value })}
            required
          />
        </label>
        <label className="form-field">
          <span>Canal principal</span>
          <input value="WhatsApp" disabled />
        </label>
        <label className="form-field">
          <span>Idiomas</span>
          <input
            value={draft.languages_text}
            placeholder="pt-BR, en"
            onChange={(event) => onChange({ ...draft, languages_text: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Status operacional</span>
          <select
            value={draft.is_active ? "active" : "inactive"}
            onChange={(event) => onChange({ ...draft, is_active: event.target.value === "active" })}
          >
            <option value="inactive">Manter inativo</option>
            <option value="active">Ativar este agente</option>
          </select>
        </label>
      </div>

      <div className="dashboard-columns" style={{ marginTop: "var(--space-lg)" }}>
        <div className="attention-list">
          <div className="attention-heading">
            <h3>O que falta</h3>
            <span className="attention-heading-count">{pendencies.length}</span>
          </div>
          {pendencies.length === 0 ? (
            <p className="empty-state">Sem pendencias detectadas.</p>
          ) : (
            <ul>
              {pendencies.map((pendency) => (
                <li className="attention-item warning" key={`${pendency.kind}:${pendency.path}`}>
                  <span className="attention-title">{pendency.label}</span>
                  <span className="attention-summary">{modelPendencyKindLabel(pendency.kind)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="kv-list">
          <div>
            <dt>ID interno</dt>
            <dd className="mono">{selectedAgent?.id ?? "Criado ao salvar"}</dd>
          </div>
          <div>
            <dt>Persona</dt>
            <dd>{agentPersonaSummaryFromDraft(draft)}</dd>
          </div>
          <div>
            <dt>Oferta</dt>
            <dd>{serviceCount(draft.services_json)} servico(s) configurado(s)</dd>
          </div>
          <div>
            <dt>Ultima atualizacao</dt>
            <dd>{selectedAgent ? formatDateTime(selectedAgent.updated_at) : "--"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function PersonaTab({ value, onChange }: { value: JsonObject; onChange: (next: JsonObject) => void }) {
  const preset = asString(value.tone_preset);
  const allowed = asStringArray(value.allowed_vocabulary ?? value.vocabulary);
  const forbidden = asStringArray(value.forbidden_phrases ?? value.things_to_avoid);
  const limits = asStringArray(value.behavior_limits);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Persona</h2>
        <span className="badge">Comportamento</span>
      </div>
      <div className="form-grid">
        <label className="form-field">
          <span>Preset de tom</span>
          <select value={preset} onChange={(event) => onChange(setKey(value, "tone_preset", event.target.value || undefined))}>
            <option value="">Selecione</option>
            <option value="consultivo">Consultivo</option>
            <option value="direto">Direto</option>
            <option value="acolhedor">Acolhedor</option>
            <option value="premium">Premium</option>
            <option value="informal">Jovem/informal</option>
            <option value="tecnico">Tecnico</option>
          </select>
        </label>
        <label className="form-field">
          <span>Tom de voz</span>
          <input
            value={asString(value.tom)}
            placeholder="Ex.: consultivo, curto e seguro"
            onChange={(event) => onChange(setKey(value, "tom", event.target.value))}
          />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Quem e o agente</span>
          <textarea
            rows={3}
            value={asString(value.persona)}
            placeholder="Ex.: agente SDR que qualifica interessados sem soar tecnico ou robotico."
            onChange={(event) => onChange(setKey(value, "persona", event.target.value))}
          />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Estilo de escrita</span>
          <textarea
            rows={3}
            value={asString(value.style)}
            placeholder="Ex.: frases curtas, naturais, sem prometer resultado e sem explicar bastidores."
            onChange={(event) => onChange(setKey(value, "style", event.target.value))}
          />
        </label>
      </div>

      <div className="dashboard-columns" style={{ marginTop: "var(--space-lg)" }}>
        <StringListPanel
          title="Vocabulario permitido"
          values={allowed}
          placeholder="Ex.: avaliacao, plano, horario"
          addLabel="Adicionar termo"
          onChange={(next) => onChange(setKey(value, "allowed_vocabulary", next))}
        />
        <StringListPanel
          title="Frases proibidas"
          values={forbidden}
          placeholder="Ex.: resultado garantido"
          addLabel="Adicionar frase"
          onChange={(next) => onChange(setKey(value, "forbidden_phrases", next))}
        />
      </div>

      <div className="dashboard-columns" style={{ marginTop: "var(--space-lg)" }}>
        <StringListPanel
          title="Limites de comportamento"
          values={limits}
          placeholder="Ex.: transferir para humano em caso sensivel"
          addLabel="Adicionar limite"
          onChange={(next) => onChange(setKey(value, "behavior_limits", next))}
        />
        <div className="attention-list">
          <div className="attention-heading">
            <h3>Preview de resposta</h3>
          </div>
          <label className="form-field">
            <span>Mensagem do lead</span>
            <input
              value={asString(value.preview_input)}
              placeholder="Ex.: Quanto fica e tem horario hoje?"
              onChange={(event) => onChange(setKey(value, "preview_input", event.target.value))}
            />
          </label>
          <label className="form-field" style={{ marginTop: "var(--space-sm)" }}>
            <span>Resposta esperada</span>
            <textarea
              rows={4}
              value={asString(value.preview_response)}
              placeholder="Ex.: Tenho sim. Me fala rapidinho o que voce procura e pra qual horario pensou?"
              onChange={(event) => onChange(setKey(value, "preview_response", event.target.value))}
            />
          </label>
        </div>
      </div>
    </section>
  );
}

function OfertaTab({ value, onChange }: { value: JsonObject; onChange: (next: JsonObject) => void }) {
  const services = asServiceList(value.offered);
  const update = (next: ServiceItem[]) => onChange(setKey(value, "offered", next));

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Oferta</h2>
        <span className="badge muted">{services.length} servico(s)</span>
      </div>
      <div className="stack-md">
        {services.length === 0 ? (
          <p className="empty-state">Nenhum servico cadastrado. Adicione pelo menos uma oferta antes de ativar.</p>
        ) : null}
        {services.map((service, index) => (
          <ServiceEditor
            key={index}
            service={service}
            onChange={(next) => {
              const copy = [...services];
              copy[index] = next;
              update(copy);
            }}
            onRemove={() => update(services.filter((_, i) => i !== index))}
          />
        ))}
        <button
          className="button secondary"
          type="button"
          onClick={() => update([...services, emptyService()])}
        >
          Adicionar servico
        </button>
      </div>
    </section>
  );
}

function QualificacaoTab({ value, onChange }: { value: JsonObject; onChange: (next: JsonObject) => void }) {
  const services = asServiceList(value.offered);
  const notOffered = asStringArray(value.not_offered);
  const transferRules = asStringArray(value.human_transfer_rules);
  const updateServices = (next: ServiceItem[]) => onChange(setKey(value, "offered", next));

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Qualificacao</h2>
        <span className="badge">Criterios comerciais</span>
      </div>
      <div className="dashboard-columns">
        <StringListPanel
          title="Quando descartar ou recusar"
          values={notOffered}
          placeholder="Ex.: pede servico fora do escopo"
          addLabel="Adicionar criterio"
          onChange={(next) => onChange(setKey(value, "not_offered", next))}
        />
        <StringListPanel
          title="Quando transferir para humano"
          values={transferRules}
          placeholder="Ex.: negociacao fora do limite"
          addLabel="Adicionar regra"
          onChange={(next) => onChange(setKey(value, "human_transfer_rules", next))}
        />
      </div>
      <div className="stack-md" style={{ marginTop: "var(--space-lg)" }}>
        {services.map((service, index) => (
          <div className="attention-list" key={index}>
            <div className="attention-heading">
              <h3>{service.label || "Servico sem nome"}</h3>
            </div>
            <div className="dashboard-columns">
              <StringListPanel
                title="Criterios de qualificacao"
                values={asStringArray(service.qualification_criteria)}
                placeholder="Ex.: entende valor e tem disponibilidade"
                addLabel="Adicionar criterio"
                onChange={(next) => {
                  const copy = [...services];
                  copy[index] = { ...service, qualification_criteria: next };
                  updateServices(copy);
                }}
              />
              <StringListPanel
                title="Perguntas obrigatorias"
                values={asStringArray(service.required_questions)}
                placeholder="Ex.: Para quando voce precisa?"
                addLabel="Adicionar pergunta"
                onChange={(next) => {
                  const copy = [...services];
                  copy[index] = { ...service, required_questions: next };
                  updateServices(copy);
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgendaTab({
  draft,
  onChange,
}: {
  draft: AgentDraft;
  onChange: (next: AgentDraft) => void;
}) {
  const constraints =
    draft.services_json.constraints &&
    typeof draft.services_json.constraints === "object" &&
    !Array.isArray(draft.services_json.constraints)
      ? (draft.services_json.constraints as JsonObject)
      : {};

  const updateConstraint = (key: string, next: unknown) => {
    onChange({
      ...draft,
      services_json: setNested(draft.services_json, ["constraints", key], next),
    });
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Agenda</h2>
        <span className="badge muted">Disponibilidade</span>
      </div>
      <div className="form-grid">
        <label className="form-field">
          <span>Google Calendar ID</span>
          <input
            value={draft.calendar_external_id}
            placeholder="Opcional no rascunho"
            onChange={(event) => onChange({ ...draft, calendar_external_id: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Duracao minima (minutos)</span>
          <input
            type="number"
            min={0}
            value={asString(constraints.min_duration_minutes)}
            placeholder="60"
            onChange={(event) => updateConstraint("min_duration_minutes", numberOrUndefined(event.target.value))}
          />
        </label>
        <label className="form-field">
          <span>Antecedencia minima (minutos)</span>
          <input
            type="number"
            min={0}
            value={asString(constraints.advance_booking_minutes)}
            placeholder="120"
            onChange={(event) => updateConstraint("advance_booking_minutes", numberOrUndefined(event.target.value))}
          />
        </label>
        <label className="form-field">
          <span>Maximo de atendimentos por dia</span>
          <input
            type="number"
            min={0}
            value={asString(constraints.max_bookings_per_day)}
            placeholder="Sem limite"
            onChange={(event) => updateConstraint("max_bookings_per_day", numberOrUndefined(event.target.value))}
          />
        </label>
      </div>
      <p className="source-note">
        A disponibilidade real continua vindo dos slots sincronizados no backend. Esta aba define as regras que o agente deve respeitar antes de sugerir ou bloquear horario.
      </p>
    </section>
  );
}

function PrecosTab({ value, onChange }: { value: JsonObject; onChange: (next: JsonObject) => void }) {
  const durations = asDurationList(value.durations);

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Precos e negociacao</h2>
        <span className="badge">Comercial</span>
      </div>
      <div className="form-grid">
        <label className="form-field">
          <span>Moeda</span>
          <select value={asString(value.currency)} onChange={(event) => onChange(setKey(value, "currency", event.target.value))}>
            <option value="">Selecione</option>
            <option value="BRL">BRL - Real</option>
            <option value="USD">USD - Dolar</option>
            <option value="EUR">EUR - Euro</option>
          </select>
        </label>
        <label className="form-field">
          <span>Desconto maximo (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={asString(value.negotiation_floor_pct)}
            placeholder="15"
            onChange={(event) => onChange(setKey(value, "negotiation_floor_pct", numberOrUndefined(event.target.value)))}
          />
        </label>
        <label className="form-field">
          <span>Quando mencionar preco</span>
          <select
            value={asString(value.price_mention_policy)}
            onChange={(event) => onChange(setKey(value, "price_mention_policy", event.target.value))}
          >
            <option value="">Selecione</option>
            <option value="after_qualification">Depois de qualificar</option>
            <option value="when_asked">Apenas quando perguntar</option>
            <option value="before_qualification">Antes da qualificacao</option>
            <option value="human_only">Transferir para humano</option>
          </select>
        </label>
      </div>

      <div className="attention-list" style={{ marginTop: "var(--space-lg)" }}>
        <div className="attention-heading">
          <h3>Tabela de precos</h3>
        </div>
        <div className="stack-sm">
          {durations.map((item, index) => (
            <div className="form-grid agent-price-row" key={index}>
              <label className="form-field">
                <span>Duracao</span>
                <input
                  type="number"
                  min={0}
                  value={item.minutes}
                  placeholder="60"
                  onChange={(event) => {
                    const next = [...durations];
                    next[index] = { ...item, minutes: numberOrEmpty(event.target.value) };
                    onChange(setKey(value, "durations", next));
                  }}
                />
              </label>
              <label className="form-field">
                <span>Preco</span>
                <input
                  type="number"
                  min={0}
                  value={asString(item.price)}
                  placeholder="800"
                  onChange={(event) => {
                    const next = [...durations];
                    next[index] = { ...item, price: numberOrUndefined(event.target.value) ?? "" };
                    onChange(setKey(value, "durations", next));
                  }}
                />
              </label>
              <button
                className="inline-text-button"
                type="button"
                onClick={() => onChange(setKey(value, "durations", durations.filter((_, i) => i !== index)))}
              >
                Remover
              </button>
            </div>
          ))}
          <button
            className="button secondary"
            type="button"
            onClick={() => onChange(setKey(value, "durations", [...durations, { minutes: "", price: "" }]))}
          >
            Adicionar preco
          </button>
        </div>
      </div>

      <div className="dashboard-columns" style={{ marginTop: "var(--space-lg)" }}>
        <StringListPanel
          title="Formas de pagamento"
          values={asStringArray(value.payment_methods)}
          placeholder="Ex.: Pix, cartao, dinheiro"
          addLabel="Adicionar forma"
          onChange={(next) => onChange(setKey(value, "payment_methods", next))}
        />
        <StringListPanel
          title="Argumentos de valor"
          values={asStringArray(value.value_arguments)}
          placeholder="Ex.: atendimento personalizado"
          addLabel="Adicionar argumento"
          onChange={(next) => onChange(setKey(value, "value_arguments", next))}
        />
      </div>
      <div className="dashboard-columns" style={{ marginTop: "var(--space-lg)" }}>
        <StringListPanel
          title="Quando transferir para humano"
          values={asStringArray(value.human_transfer_rules)}
          placeholder="Ex.: desconto acima do limite"
          addLabel="Adicionar regra"
          onChange={(next) => onChange(setKey(value, "human_transfer_rules", next))}
        />
        <StringListPanel
          title="Objecoes de preco"
          values={asStringArray(value.price_objections)}
          placeholder="Ex.: esta caro"
          addLabel="Adicionar objecao"
          onChange={(next) => onChange(setKey(value, "price_objections", next))}
        />
      </div>
    </section>
  );
}

function MateriaisTab({ selectedAgent }: { selectedAgent: ModelRead | null }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Materiais</h2>
        <span className="badge muted">Catalogo</span>
      </div>
      <p className="empty-state">
        Os materiais continuam no catalogo operacional. Use esta secao para revisar quais arquivos devem alimentar o agente.
      </p>
      <div className="button-row">
        <Link className="button secondary" href={selectedAgent ? `/midias?model_id=${encodeURIComponent(selectedAgent.id)}` : "/midias"}>
          Abrir materiais
        </Link>
      </div>
    </section>
  );
}

function AvancadoTab({
  selectedAgent,
  rawPersona,
  rawServices,
  rawPricing,
  onChangePersonaText,
  onChangeServicesText,
  onChangePricingText,
  onApplyPersona,
  onApplyServices,
  onApplyPricing,
}: {
  selectedAgent: ModelRead | null;
  rawPersona: string;
  rawServices: string;
  rawPricing: string;
  onChangePersonaText: (next: string) => void;
  onChangeServicesText: (next: string) => void;
  onChangePricingText: (next: string) => void;
  onApplyPersona: () => void;
  onApplyServices: () => void;
  onApplyPricing: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Avancado</h2>
        <span className="badge warning">Tecnico</span>
      </div>
      <p className="panel-notice warning">
        Configuracoes tecnicas. Altere JSON bruto apenas quando precisar preservar campos que ainda nao existem no formulario guiado.
      </p>
      <dl className="kv-list">
        <div>
          <dt>UUID do agente</dt>
          <dd className="mono">{selectedAgent?.id ?? "Criado ao salvar"}</dd>
        </div>
        <div>
          <dt>Criado em</dt>
          <dd>{selectedAgent ? formatDateTime(selectedAgent.created_at) : "--"}</dd>
        </div>
      </dl>
      <RawEditor title="Persona JSON" value={rawPersona} onChange={onChangePersonaText} onApply={onApplyPersona} />
      <RawEditor title="Oferta JSON" value={rawServices} onChange={onChangeServicesText} onApply={onApplyServices} />
      <RawEditor title="Precos JSON" value={rawPricing} onChange={onChangePricingText} onApply={onApplyPricing} />
      <p className="source-note">
        Logs, traces e detalhes de execucao devem permanecer nas telas de status/observabilidade ou nos endpoints tecnicos.
      </p>
    </section>
  );
}

function ServiceEditor({
  service,
  onChange,
  onRemove,
}: {
  service: ServiceItem;
  onChange: (next: ServiceItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="attention-list">
      <div className="attention-heading">
        <h3>{service.label || "Novo servico"}</h3>
        <button className="inline-text-button" type="button" onClick={onRemove}>
          Remover
        </button>
      </div>
      <div className="form-grid">
        <label className="form-field">
          <span>Nome</span>
          <input value={service.label} placeholder="Ex.: Avaliacao inicial" onChange={(event) => onChange({ ...service, label: event.target.value })} />
        </label>
        <label className="form-field">
          <span>ID interno</span>
          <input value={service.id} placeholder="avaliacao_inicial" onChange={(event) => onChange({ ...service, id: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Fluxo</span>
          <select value={service.flow_type} onChange={(event) => onChange({ ...service, flow_type: event.target.value })}>
            <option value="INTERNAL">Cliente vai ao local</option>
            <option value="EXTERNAL">Deslocamento</option>
          </select>
        </label>
        <label className="form-field">
          <span>Preco ou faixa</span>
          <input value={asString(service.price_range)} placeholder="Ex.: R$ 500 a R$ 800" onChange={(event) => onChange({ ...service, price_range: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Duracao</span>
          <input value={asString(service.duration)} placeholder="Ex.: 60 minutos" onChange={(event) => onChange({ ...service, duration: event.target.value })} />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Descricao curta</span>
          <textarea rows={2} value={asString(service.description)} placeholder="Explique em linguagem comercial o que o lead esta comprando." onChange={(event) => onChange({ ...service, description: event.target.value })} />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Publico ideal</span>
          <textarea rows={2} value={asString(service.ideal_customer)} placeholder="Ex.: leads com necessidade clara, disponibilidade e fit com a oferta." onChange={(event) => onChange({ ...service, ideal_customer: event.target.value })} />
        </label>
      </div>
      <div className="dashboard-columns" style={{ marginTop: "var(--space-lg)" }}>
        <StringListPanel
          title="Dores que resolve"
          values={asStringArray(service.pains_solved)}
          placeholder="Ex.: falta de informacao antes de agendar"
          addLabel="Adicionar dor"
          onChange={(next) => onChange({ ...service, pains_solved: next })}
        />
        <StringListPanel
          title="Restricoes"
          values={asStringArray(service.restrictions)}
          placeholder="Ex.: nao atende fora da cidade"
          addLabel="Adicionar restricao"
          onChange={(next) => onChange({ ...service, restrictions: next })}
        />
      </div>
      <div style={{ marginTop: "var(--space-lg)" }}>
        <StringListPanel
          title="Objecoes comuns"
          values={asStringArray(service.common_objections)}
          placeholder="Ex.: vou pensar"
          addLabel="Adicionar objecao"
          onChange={(next) => onChange({ ...service, common_objections: next })}
        />
      </div>
    </div>
  );
}

function StringListPanel({
  title,
  values,
  placeholder,
  addLabel,
  onChange,
}: {
  title: string;
  values: string[];
  placeholder: string;
  addLabel: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="attention-list">
      <div className="attention-heading">
        <h3>{title}</h3>
        <span className="attention-heading-count">{values.length}</span>
      </div>
      <div className="stack-sm">
        {values.length === 0 ? <p className="empty-state">Nada cadastrado.</p> : null}
        {values.map((item, index) => (
          <div className="inline-actions" key={index} style={{ width: "100%" }}>
            <input
              type="text"
              value={item}
              placeholder={placeholder}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
              style={{ flex: 1 }}
            />
            <button className="inline-text-button" type="button" onClick={() => onChange(values.filter((_, i) => i !== index))}>
              Remover
            </button>
          </div>
        ))}
        <button className="button secondary" type="button" onClick={() => onChange([...values, ""])}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function RawEditor({
  title,
  value,
  onChange,
  onApply,
}: {
  title: string;
  value: string;
  onChange: (next: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="form-field" style={{ marginTop: "var(--space-lg)" }}>
      <span>{title}</span>
      <textarea className="mono" rows={10} value={value} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
      <button className="button secondary" type="button" onClick={onApply}>
        Aplicar JSON
      </button>
    </div>
  );
}

function LoadingPanel({ title }: { title: string }) {
  return (
    <div className="panel" role="status">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="badge muted">Buscando</span>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric compact">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      <span className="metric-sub">{detail}</span>
    </div>
  );
}

function ProgressInline({ value }: { value: number }) {
  return (
    <div className="agent-progress-inline">
      <span className="bar-track" aria-label={`Configuracao ${value}% completa`}>
        <span className="bar-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="bar-value">{value}%</span>
    </div>
  );
}

function ProgressBlock({ value }: { value: number }) {
  return (
    <div className="agent-progress-block">
      <div className="bar-row">
        <span className="bar-label">Configuracao {value}% completa</span>
        <span className="bar-track">
          <span className="bar-fill" style={{ width: `${value}%` }} />
        </span>
        <span className="bar-value">{value}%</span>
      </div>
    </div>
  );
}

type ServiceItem = JsonObject & {
  id: string;
  label: string;
  flow_type: string;
};

type DurationItem = {
  minutes: number | "";
  price: unknown;
};

function emptyService(): ServiceItem {
  return {
    id: "",
    label: "",
    flow_type: "INTERNAL",
    description: "",
    ideal_customer: "",
    pains_solved: [],
    price_range: "",
    duration: "",
    qualification_criteria: [],
    restrictions: [],
    required_questions: [],
    common_objections: [],
  };
}

function asServiceList(value: unknown): ServiceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      ...entry,
      id: typeof entry.id === "string" ? entry.id : "",
      label: typeof entry.label === "string" ? entry.label : "",
      flow_type: typeof entry.flow_type === "string" ? entry.flow_type : "INTERNAL",
    }));
}

function asDurationList(value: unknown): DurationItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      minutes: typeof entry.minutes === "number" ? entry.minutes : "",
      price: entry.price ?? "",
    }));
}

function cloneJson(value: Record<string, unknown> | null | undefined): JsonObject {
  if (!value) return {};
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function stringifyJson(payload: JsonObject | null | undefined): string {
  return JSON.stringify(payload ?? {}, null, 2);
}

function tryParseObject(text: string): { ok: true; data: JsonObject } | { ok: false; error: string } {
  try {
    const parsed = text.trim() ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Use um objeto JSON com chaves e valores." };
    }
    return { ok: true, data: parsed as JsonObject };
  } catch {
    return { ok: false, error: "JSON invalido. Verifique chaves, virgulas e aspas." };
  }
}

function applyRaw(text: string, onApply: (next: JsonObject) => void, onError: (next: string | null) => void) {
  const result = tryParseObject(text);
  if (!result.ok) {
    onError(result.error);
    return;
  }
  onError(null);
  onApply(result.data);
}

function parseLanguages(text: string): string[] {
  return text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function modelToDraft(model: ModelRead): AgentDraft {
  return {
    display_name: model.display_name,
    is_active: model.is_active,
    languages_text: model.languages.join(", "),
    calendar_external_id: model.calendar_external_id ?? "",
    persona_json: cloneJson(model.persona_json),
    services_json: cloneJson(model.services_json),
    pricing_json: cloneJson(model.pricing_json),
  };
}

function draftToPayload(draft: AgentDraft): ModelCreateInput {
  const displayName = draft.display_name.trim();
  if (!displayName) {
    throw new Error("Nome do agente e obrigatorio.");
  }

  return {
    display_name: displayName,
    is_active: draft.is_active,
    languages: parseLanguages(draft.languages_text),
    calendar_external_id: draft.calendar_external_id.trim() || null,
    persona_json: draft.persona_json,
    services_json: draft.services_json,
    pricing_json: draft.pricing_json,
  };
}

function saveErrorMessage(error: BffFetchError, isCreate: boolean): string {
  if (error.status === 400 || error.status === 422) {
    return error.message;
  }
  if (error.status === 404 && !isCreate) {
    return "Esse agente nao existe mais. Volte para a lista e tente de novo.";
  }
  if (error.status === 409) {
    return "Houve conflito para definir o agente ativo. Atualize a lista e tente novamente.";
  }
  return isCreate ? "Nao consegui criar o agente agora." : "Nao consegui salvar a configuracao agora.";
}

function configurationCompletion(model: ModelRead): number {
  return configurationCompletionFromDraft(modelToDraft(model));
}

function configurationCompletionFromDraft(draft: AgentDraft): number {
  const checklist = buildChecklist(draft);
  const done = checklist.filter((item) => item.done).length;
  return Math.round((done / checklist.length) * 100);
}

function buildChecklist(draft: AgentDraft): { label: string; done: boolean }[] {
  return [
    {
      label: "Dados basicos",
      done: Boolean(draft.display_name.trim() && parseLanguages(draft.languages_text).length > 0),
    },
    {
      label: "Persona",
      done: Boolean(asString(draft.persona_json.persona) || asString(draft.persona_json.tom)),
    },
    {
      label: "Oferta/servicos",
      done: asServiceList(draft.services_json.offered).some((service) => service.label.trim()),
    },
    {
      label: "Criterios de qualificacao",
      done: asServiceList(draft.services_json.offered).some(
        (service) =>
          asStringArray(service.qualification_criteria).length > 0 ||
          asStringArray(service.required_questions).length > 0,
      ),
    },
    {
      label: "Agenda",
      done: Boolean(draft.calendar_external_id.trim()),
    },
    {
      label: "Precos/condicoes",
      done: Boolean(asString(draft.pricing_json.currency) && asDurationList(draft.pricing_json.durations).length > 0),
    },
    {
      label: "Materiais",
      done: !isPending(draft.services_json.media_policy),
    },
    {
      label: "Canais",
      done: true,
    },
  ];
}

function agentPersonaSummary(agent: ModelRead): string {
  return agentPersonaSummaryFromDraft(modelToDraft(agent));
}

function agentPersonaSummaryFromDraft(draft: AgentDraft): string {
  const preset = asString(draft.persona_json.tone_preset);
  const tone = asString(draft.persona_json.tom);
  const persona = asString(draft.persona_json.persona);
  return [preset, tone || persona].filter(Boolean).join(" | ") || "Sem persona definida";
}

function serviceCount(value: JsonObject): number {
  return asServiceList(value.offered).length;
}

function asString(value: unknown): string {
  if (value === null || value === undefined || value === PENDING_TOKEN) return "";
  return typeof value === "string" ? value : String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string").map(String);
}

function isPending(value: unknown): boolean {
  return value === PENDING_TOKEN;
}

function setKey(base: JsonObject, key: string, value: unknown): JsonObject {
  if (value === undefined || value === "") {
    const next = { ...base };
    delete next[key];
    return next;
  }
  return { ...base, [key]: value };
}

function setNested(base: JsonObject, path: string[], value: unknown): JsonObject {
  const [head, ...rest] = path;
  if (!head) return base;
  if (rest.length === 0) {
    return setKey(base, head, value);
  }
  const child = base[head];
  const childObj: JsonObject =
    child && typeof child === "object" && !Array.isArray(child) ? (child as JsonObject) : {};
  return { ...base, [head]: setNested(childObj, rest, value) };
}

function numberOrUndefined(raw: string): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function numberOrEmpty(raw: string): number | "" {
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : "";
}

function noticeClassName(notice: Notice): string {
  if (notice.tone === "ok") return "panel-notice ok";
  if (notice.tone === "warning") return "panel-notice warning";
  return "panel-notice";
}
