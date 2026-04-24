"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  ModelCreateInput,
  ModelPatchInput,
  ModelRead,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, bffSend, type BffFetchError } from "@/features/shared/bff-client";
import { formatDateTime } from "@/features/shared/formatters";
import { modelPendencyKindLabel } from "@/features/shared/labels";
import { detectModelPendencies } from "@/features/shared/pending";

import { PersonaSection } from "./persona-section";
import { ServicesSection } from "./services-section";
import { PricingSection } from "./pricing-section";
import type { JsonObject } from "./section-utils";

const POLL_INTERVAL_MS = 30_000;

type FormMode = "create" | "edit";

type ModelDraft = {
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

const EMPTY_DRAFT: ModelDraft = {
  display_name: "",
  is_active: false,
  languages_text: "",
  calendar_external_id: "",
  persona_json: {},
  services_json: {},
  pricing_json: {},
};

export function ModelosClient() {
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<ModelRead> | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>("create");
  const [draft, setDraft] = useState<ModelDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    const result = await bffFetch<PaginatedEnvelope<ModelRead>>("/api/operator/models?page=1&page_size=100");
    const nextEnvelope = result.data;
    setEnvelope(result.data);
    setError(result.error);
    setFirstLoad(false);
    setLoading(false);

    if (nextEnvelope) {
      setSelectedId((current) => chooseSelectedId(nextEnvelope.items, preferredId ?? current));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const items = envelope?.items ?? [];
  const selectedModel = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const livePendencies = useMemo(
    () =>
      detectModelPendencies({
        persona_json: draft.persona_json,
        services_json: draft.services_json,
        pricing_json: draft.pricing_json,
        languages: parseLanguages(draft.languages_text),
        calendar_external_id: draft.calendar_external_id.trim() || null,
      } as unknown as ModelRead),
    [draft],
  );

  const personaPendencies = livePendencies.filter((p) => p.path.startsWith("persona_json")).length;
  const servicesPendencies = livePendencies.filter((p) => p.path.startsWith("services_json")).length;
  const pricingPendencies = livePendencies.filter((p) => p.path.startsWith("pricing_json")).length;

  const startCreate = useCallback(() => {
    setMode("create");
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    setNotice(null);
  }, []);

  const startEdit = useCallback((model: ModelRead) => {
    setSelectedId(model.id);
    setMode("edit");
    setDraft(modelToDraft(model));
    setFormError(null);
    setNotice(null);
  }, []);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFormError(null);
      setNotice(null);

      let payload: ModelCreateInput;
      try {
        payload = draftToPayload(draft);
      } catch (issue) {
        setFormError(issue instanceof Error ? issue.message : "Revise os dados antes de salvar.");
        return;
      }

      if (mode === "edit" && !selectedModel) {
        setFormError("Selecione um agente existente para editar.");
        return;
      }
      setSaving(true);
      let result;
      if (mode === "create") {
        result = await bffSend<ModelRead>("/api/operator/models", payload);
      } else {
        const editingModel = selectedModel;
        if (!editingModel) {
        setSaving(false);
        setFormError("Selecione um agente existente para editar.");
        return;
        }
        result = await bffSend<ModelRead>(
          `/api/operator/models/${encodeURIComponent(editingModel.id)}`,
          payload as ModelPatchInput,
          "PATCH",
        );
      }
      setSaving(false);

      if (result.error) {
        setFormError(saveErrorMessage(result.error, mode));
        return;
      }

      if (!result.data) {
        setFormError("O servidor não devolveu o agente salvo.");
        return;
      }

      setMode("edit");
      setSelectedId(result.data.id);
      setDraft(modelToDraft(result.data));
      setNotice({
        tone: "ok",
        message:
          mode === "create"
            ? "Agente criado. Já está disponível na operação."
            : "Agente atualizado com sucesso.",
      });
      await load(result.data.id);
    },
    [draft, load, mode, selectedModel],
  );

  const onToggleActive = useCallback(
    async (model: ModelRead) => {
      setBusyActionId(model.id);
      setFormError(null);
      setNotice(null);
      const result = await bffSend<ModelRead>(
        `/api/operator/models/${encodeURIComponent(model.id)}`,
        { is_active: !model.is_active },
        "PATCH",
      );
      setBusyActionId(null);

      if (result.error) {
        setNotice({
          tone: "error",
          message: model.is_active
            ? "Não consegui inativar o agente agora."
            : "Não consegui ativar o agente agora.",
        });
        return;
      }

      setNotice({
        tone: "ok",
        message: model.is_active
          ? "Agente inativado. A operação fica sem agente ativo até você ativar outro."
          : "Agente ativado. Os demais foram desativados automaticamente.",
      });
      await load(model.id);
    },
    [load],
  );

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando os agentes</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  if (error && !envelope) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Não consegui carregar os agentes</h2>
          <span className="badge danger">Erro</span>
        </div>
        <p>{error.message}</p>
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
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>{mode === "create" ? "Cadastrar novo agente" : "Editar agente"}</h2>
            <span className={mode === "create" ? "badge warning" : "badge"}>
              {mode === "create" ? "Novo agente" : "Edição"}
            </span>
          </div>
          <p className="empty-state" style={{ textAlign: "left", padding: "0 0 10px 0" }}>
            O agente marcado como ativo é o único que conversa com leads. Preencha os dados básicos aqui e configure
            persona, serviços e preços nos blocos abaixo. Tudo é salvo junto.
          </p>
          {notice ? (
            <div className={noticeClassName(notice)} style={{ marginBottom: 12 }}>
              {notice.message}
            </div>
          ) : null}
          {formError ? <div className="panel-notice">{formError}</div> : null}
          <form
            id="modelos-form"
            className="form-grid"
            onSubmit={onSubmit}
            aria-label="Formulário de agentes"
          >
            <label className="form-field">
              <span>Nome de exibição</span>
              <input
                type="text"
                value={draft.display_name}
                onChange={(event) => setDraft({ ...draft, display_name: event.target.value })}
                placeholder="Ex.: Alice Premium"
                required
              />
            </label>

            <label className="form-field">
              <span>Idiomas</span>
              <input
                type="text"
                value={draft.languages_text}
                onChange={(event) => setDraft({ ...draft, languages_text: event.target.value })}
                placeholder="pt-BR, en"
              />
            </label>

            <label className="form-field">
              <span>Google Calendar ID</span>
              <input
                type="text"
                value={draft.calendar_external_id}
                onChange={(event) => setDraft({ ...draft, calendar_external_id: event.target.value })}
                placeholder="Opcional"
              />
            </label>

            <label className="form-field">
              <span>Disponibilidade operacional</span>
              <select
                value={draft.is_active ? "active" : "inactive"}
                onChange={(event) =>
                  setDraft({ ...draft, is_active: event.target.value === "active" })
                }
              >
                <option value="active">Ativar este agente</option>
                <option value="inactive">Manter inativo</option>
              </select>
            </label>

            <div className="button-row" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
              <button className="button" type="submit" disabled={saving}>
                {saving
                  ? mode === "create"
                    ? "Criando..."
                    : "Salvando..."
                  : mode === "create"
                    ? "Criar agente"
                    : "Salvar alterações"}
              </button>
              <button className="button secondary" type="button" onClick={startCreate} disabled={saving}>
                Limpar formulário
              </button>
              {selectedModel ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => startEdit(selectedModel)}
                  disabled={saving}
                >
                  Recarregar dados do selecionado
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Agentes cadastrados</h2>
            <span className="badge muted">
              {loading ? "Atualizando" : `${items.length} cadastrados`}
            </span>
          </div>
          <p className="empty-state" style={{ textAlign: "left", padding: "0 0 10px 0" }}>
            Clique em uma linha para inspecionar a configuração. Edite no formulário ou troque qual agente fica ativo.
          </p>
          {error ? <div className="panel-notice">{error.message}</div> : null}
          {items.length === 0 ? (
            <p className="empty-state">
              Nenhum agente cadastrado ainda. Crie o primeiro aqui para liberar agenda, materiais e
              atendimento automático.
            </p>
          ) : (
            <div className="table-wrap">
                        <table className="data-table" aria-label="Lista de agentes">
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>Status</th>
                    <th>Idiomas</th>
                    <th>Atualizada</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((model) => {
                    const selected = model.id === selectedModel?.id;
                    return (
                      <tr
                        key={model.id}
                        className={selected ? "clickable selected-row" : "clickable"}
                        onClick={() => setSelectedId(model.id)}
                      >
                        <td>
                          <div className="stack-sm">
                            <strong>{model.display_name}</strong>
                            <span className="mono">{model.id}</span>
                          </div>
                        </td>
                        <td>
                          <span className={model.is_active ? "badge ok" : "badge muted"}>
                            {model.is_active ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        <td>{model.languages.length ? model.languages.join(", ") : "—"}</td>
                        <td>{formatDateTime(model.updated_at)}</td>
                        <td>
                          <div className="inline-actions">
                            <button
                              className="button secondary"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                startEdit(model);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={busyActionId === model.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void onToggleActive(model);
                              }}
                            >
                              {busyActionId === model.id
                                ? "Salvando..."
                                : model.is_active
                                  ? "Inativar agente"
                                  : "Ativar agente"}
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

      <section className="panel">
        <div className="panel-heading">
          <h2>O que ainda falta definir</h2>
          <span className={livePendencies.length === 0 ? "badge ok" : "badge warning"}>
            {livePendencies.length}
          </span>
        </div>
        {livePendencies.length === 0 ? (
          <p className="empty-state">
            Tudo preenchido. O agente tem todo o contexto necessário para atender.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table" aria-label="Pendências do agente em edição">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>O que falta</th>
                </tr>
              </thead>
              <tbody>
                {livePendencies.map((pendency) => (
                  <tr key={`${pendency.kind}:${pendency.path}`}>
                    <td>
                      <span className="chip warning">{modelPendencyKindLabel(pendency.kind)}</span>
                    </td>
                    <td className="muted-cell">{pendency.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PersonaSection
        value={draft.persona_json}
        onChange={(next) => setDraft({ ...draft, persona_json: next })}
        pendencyCount={personaPendencies}
      />
      <ServicesSection
        value={draft.services_json}
        onChange={(next) => setDraft({ ...draft, services_json: next })}
        pendencyCount={servicesPendencies}
      />
      <PricingSection
        value={draft.pricing_json}
        onChange={(next) => setDraft({ ...draft, pricing_json: next })}
        pendencyCount={pricingPendencies}
      />

      <section className="panel">
        <div className="button-row" style={{ marginTop: 0 }}>
          <button
            className="button"
            type="submit"
            form="modelos-form"
            disabled={saving}
          >
            {saving
              ? mode === "create"
                ? "Criando..."
                : "Salvando..."
              : mode === "create"
                ? "Criar agente"
                : "Salvar alterações"}
          </button>
          <span className="empty-state" style={{ padding: 0, textAlign: "left" }}>
            Salva os dados básicos junto com persona, serviços e preços.
          </span>
        </div>
      </section>

      {selectedModel ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>{selectedModel.display_name}</h2>
            <span className={selectedModel.is_active ? "badge ok" : "badge danger"}>
              {selectedModel.is_active ? "Ativa" : "Inativa"}
            </span>
          </div>
          <dl className="kv-list">
            <div>
              <dt>ID interno</dt>
              <dd className="mono">{selectedModel.id}</dd>
            </div>
            <div>
              <dt>Google Calendar</dt>
              <dd>{selectedModel.calendar_external_id || "—"}</dd>
            </div>
            <div>
              <dt>Idiomas</dt>
              <dd>{selectedModel.languages.length ? selectedModel.languages.join(", ") : "—"}</dd>
            </div>
            <div>
              <dt>Cadastrada em</dt>
              <dd>{formatDateTime(selectedModel.created_at)}</dd>
            </div>
            <div>
              <dt>Última atualização</dt>
              <dd>{formatDateTime(selectedModel.updated_at)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function chooseSelectedId(items: ModelRead[], current: string | null): string | null {
  if (current && items.some((item) => item.id === current)) {
    return current;
  }
  return items.find((item) => item.is_active)?.id ?? items[0]?.id ?? null;
}

function modelToDraft(model: ModelRead): ModelDraft {
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

function cloneJson(value: Record<string, unknown> | null | undefined): JsonObject {
  if (!value) return {};
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function parseLanguages(text: string): string[] {
  return text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function draftToPayload(draft: ModelDraft): ModelCreateInput {
  const displayName = draft.display_name.trim();
  if (!displayName) {
    throw new Error("Nome de exibição é obrigatório.");
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

function saveErrorMessage(error: BffFetchError, mode: FormMode): string {
  if (error.status === 400 || error.status === 422) {
    return error.message;
  }
  if (error.status === 404 && mode === "edit") {
    return "Esse agente não existe mais. Atualize a lista e tente de novo.";
  }
  if (error.status === 409) {
    return "Houve conflito para definir o agente ativo. Atualize a lista e tente novamente.";
  }
  if (mode === "create") {
    return "Não consegui criar o agente agora. Tente novamente.";
  }
  return "Não consegui salvar as alterações do agente agora.";
}

function noticeClassName(notice: Notice): string {
  if (notice.tone === "ok") {
    return "panel-notice ok";
  }
  if (notice.tone === "warning") {
    return "panel-notice warning";
  }
  return "panel-notice";
}

