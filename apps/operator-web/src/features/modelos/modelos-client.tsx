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
import { detectModelPendencies, humanizeModelPath } from "@/features/shared/pending";

const POLL_INTERVAL_MS = 30_000;

type FormMode = "create" | "edit";

type ModelDraft = {
  display_name: string;
  is_active: boolean;
  languages_text: string;
  calendar_external_id: string;
  persona_text: string;
  services_text: string;
  pricing_text: string;
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
  persona_text: "{}",
  services_text: "{}",
  pricing_text: "{}",
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
  const pendencies = selectedModel ? detectModelPendencies(selectedModel) : [];

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
        setFormError("Selecione uma modelo existente para editar.");
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
          setFormError("Selecione uma modelo existente para editar.");
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
        setFormError("O servidor não devolveu a modelo salva.");
        return;
      }

      setMode("edit");
      setSelectedId(result.data.id);
      setDraft(modelToDraft(result.data));
      setNotice({
        tone: "ok",
        message:
          mode === "create"
            ? "Modelo criada. Ela já está disponível na operação."
            : "Modelo atualizada com sucesso.",
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
            ? "Não consegui inativar a modelo agora."
            : "Não consegui ativar a modelo agora.",
        });
        return;
      }

      setNotice({
        tone: "ok",
        message: model.is_active
          ? "Modelo inativada. A operação fica sem modelo ativa até você ativar outra."
          : "Modelo ativada. As demais foram desativadas automaticamente.",
      });
      await load(model.id);
    },
    [load],
  );

  if (firstLoad) {
    return (
      <div className="panel" role="status">
        <div className="panel-heading">
          <h2>Carregando os modelos</h2>
          <span className="badge muted">Buscando</span>
        </div>
      </div>
    );
  }

  if (error && !envelope) {
    return (
      <section className="panel error-panel">
        <div className="panel-heading">
          <h2>Não consegui carregar os modelos</h2>
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
            <h2>{mode === "create" ? "Cadastrar nova modelo" : "Editar modelo"}</h2>
            <span className={mode === "create" ? "badge warning" : "badge"}>
              {mode === "create" ? "Novo cadastro" : "Edição"}
            </span>
          </div>
          <p className="empty-state" style={{ textAlign: "left", padding: "0 0 10px 0" }}>
            A IA usa somente a modelo marcada como ativa. Você pode montar um cadastro novo, revisar
            os JSONs com calma e trocar qual perfil fica em produção.
          </p>
          {notice ? (
            <div className={noticeClassName(notice)} style={{ marginBottom: 12 }}>
              {notice.message}
            </div>
          ) : null}
          {formError ? <div className="panel-notice">{formError}</div> : null}
          <form className="form-grid" onSubmit={onSubmit} aria-label="Formulário de modelos">
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
                <option value="active">Ativar esta modelo</option>
                <option value="inactive">Manter inativa</option>
              </select>
            </label>

            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>Configuração da persona</span>
              <textarea
                className="mono"
                rows={10}
                value={draft.persona_text}
                onChange={(event) => setDraft({ ...draft, persona_text: event.target.value })}
                spellCheck={false}
              />
            </label>

            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>Configuração dos serviços</span>
              <textarea
                className="mono"
                rows={10}
                value={draft.services_text}
                onChange={(event) => setDraft({ ...draft, services_text: event.target.value })}
                spellCheck={false}
              />
            </label>

            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              <span>Configuração de preços</span>
              <textarea
                className="mono"
                rows={10}
                value={draft.pricing_text}
                onChange={(event) => setDraft({ ...draft, pricing_text: event.target.value })}
                spellCheck={false}
              />
            </label>

            <div className="button-row" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
              <button className="button" type="submit" disabled={saving}>
                {saving
                  ? mode === "create"
                    ? "Criando..."
                    : "Salvando..."
                  : mode === "create"
                    ? "Criar modelo"
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
                  Recarregar dados da selecionada
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Modelos cadastradas</h2>
            <span className="badge muted">
              {loading ? "Atualizando" : `${items.length} cadastradas`}
            </span>
          </div>
          <p className="empty-state" style={{ textAlign: "left", padding: "0 0 10px 0" }}>
            Clique em uma linha para inspecionar a configuração. Use os botões da direita para editar
            no formulário ou trocar qual modelo fica ativa.
          </p>
          {error ? <div className="panel-notice">{error.message}</div> : null}
          {items.length === 0 ? (
            <p className="empty-state">
              Nenhuma modelo cadastrada ainda. Crie a primeira aqui para liberar agenda, mídia e
              atendimento automático.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table" aria-label="Lista de modelos">
                <thead>
                  <tr>
                    <th>Modelo</th>
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
      </div>

      {selectedModel ? (
        <>
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
                <dt>Idiomas que atende</dt>
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

          <section className="panel">
            <div className="panel-heading">
              <h2>O que ainda falta definir</h2>
              <span className={pendencies.length === 0 ? "badge ok" : "badge warning"}>
                {pendencies.length}
              </span>
            </div>
            {pendencies.length === 0 ? (
              <p className="empty-state">
                Tudo preenchido. A IA tem todo o contexto necessário para atender.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table" aria-label="Pendências da modelo selecionada">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>O que falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendencies.map((pendency) => (
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

          <ConfigPanel
            title="Persona da modelo"
            description="Como a IA deve soar ao conversar como a modelo: tom, gírias, estilo, vocabulário."
            payload={selectedModel.persona_json}
            rootPath="persona_json"
          />
          <ConfigPanel
            title="Serviços oferecidos"
            description="O que a modelo atende e o que não faz."
            payload={selectedModel.services_json}
            rootPath="services_json"
          />
          <ConfigPanel
            title="Preços e condições"
            description="Valores base, descontos permitidos e piso de negociação."
            payload={selectedModel.pricing_json}
            rootPath="pricing_json"
          />
        </>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h2>Sem modelo selecionada</h2>
            <span className="badge muted">Aguardando</span>
          </div>
          <p className="empty-state">
            Crie uma modelo nova ou selecione uma da lista para revisar persona, serviços, preços e
            pendências humanas.
          </p>
        </section>
      )}
    </div>
  );
}

function ConfigPanel({
  title,
  description,
  payload,
  rootPath,
}: {
  title: string;
  description: string;
  payload: Record<string, unknown> | null;
  rootPath: string;
}) {
  const entries = Object.entries(payload ?? {}).filter(([key]) => key !== "fixture_only");
  const empty = entries.length === 0;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className={empty ? "badge muted" : "badge"}>{empty ? "Vazio" : "Configurado"}</span>
      </div>
      <p className="empty-state" style={{ textAlign: "left", padding: "0 0 10px 0" }}>
        {description}
      </p>
      {empty ? (
        <p className="empty-state">Ainda não preenchido.</p>
      ) : (
        <div className="stack-sm">
          {entries.map(([key, value]) => (
            <ConfigEntry
              key={key}
              label={humanizeModelPath(`${rootPath}.${key}`)}
              value={value}
              path={`${rootPath}.${key}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ConfigEntry({
  label,
  value,
  path,
}: {
  label: string;
  value: unknown;
  path: string;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <div>
        <strong>{label}</strong>
        <div className="muted-cell">—</div>
      </div>
    );
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <div>
        <strong>{label}</strong>
        <div>{formatConfigValue(value)}</div>
      </div>
    );
  }

  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined && item !== "");
    return (
      <div>
        <strong>{label}</strong>
        {items.length === 0 ? (
          <div className="muted-cell">—</div>
        ) : (
          <div className="stack-sm" style={{ marginTop: 6 }}>
            {items.map((item, index) => (
              <ConfigEntry
                key={`${path}[${index}]`}
                label={Array.isArray(item) || typeof item === "object" ? `Item ${index + 1}` : `Opção ${index + 1}`}
                value={item}
                path={`${path}[${index}]`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "fixture_only");
  return (
    <div>
      <strong>{label}</strong>
      {entries.length === 0 ? (
        <div className="muted-cell">—</div>
      ) : (
        <div className="stack-sm" style={{ marginTop: 6 }}>
          {entries.map(([key, child]) => (
            <ConfigEntry
              key={`${path}.${key}`}
              label={humanizeModelPath(`${path}.${key}`)}
              value={child}
              path={`${path}.${key}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatConfigValue(value: string | number | boolean): string {
  if (value === "PENDING_DECISION") {
    return "Falta decidir";
  }
  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }
  return String(value);
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
    persona_text: stringifyJson(model.persona_json),
    services_text: stringifyJson(model.services_json),
    pricing_text: stringifyJson(model.pricing_json),
  };
}

function draftToPayload(draft: ModelDraft): ModelCreateInput {
  const displayName = draft.display_name.trim();
  if (!displayName) {
    throw new Error("Nome de exibição é obrigatório.");
  }

  return {
    display_name: displayName,
    is_active: draft.is_active,
    languages: draft.languages_text
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    calendar_external_id: draft.calendar_external_id.trim() || null,
    persona_json: parseObjectJson("Configuração da persona", draft.persona_text),
    services_json: parseObjectJson("Configuração dos serviços", draft.services_text),
    pricing_json: parseObjectJson("Configuração de preços", draft.pricing_text),
  };
}

function parseObjectJson(label: string, value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} precisa estar em um formato válido.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} precisa ser um bloco de dados com chaves e valores.`);
  }

  return parsed as Record<string, unknown>;
}

function stringifyJson(payload: Record<string, unknown> | null): string {
  return JSON.stringify(payload ?? {}, null, 2);
}

function saveErrorMessage(error: BffFetchError, mode: FormMode): string {
  if (error.status === 400 || error.status === 422) {
    return error.message;
  }
  if (error.status === 404 && mode === "edit") {
    return "Essa modelo não existe mais. Atualize a lista e tente de novo.";
  }
  if (error.status === 409) {
    return "Houve conflito para definir a modelo ativa. Atualize a lista e tente novamente.";
  }
  if (mode === "create") {
    return "Não consegui criar a modelo agora. Tente novamente.";
  }
  return "Não consegui salvar as alterações da modelo agora.";
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
