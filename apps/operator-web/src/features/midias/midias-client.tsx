"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EscortRead,
  MediaRead,
  MediaTagRead,
  MediaType,
  MediaUsageSummaryRead,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, bffSend, bffUpload, type BffFetchError } from "@/features/shared/bff-client";
import { formatDateTime, formatNumber } from "@/features/shared/formatters";
import { mediaTypeLabel } from "@/features/shared/labels";

const POLL_INTERVAL_MS = 30_000;
const PAGE_SIZE = 60;

const TYPE_OPTIONS: MediaType[] = ["image", "audio", "video", "document"];
const ACTIVE_FILTER_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "true", label: "Ativas" },
  { value: "false", label: "Inativas" },
] as const;

type Filters = {
  modelId: string;
  type: "" | MediaType;
  active: "" | "true" | "false";
  tag: string;
  q: string;
  neverSent: boolean;
};

const INITIAL_FILTERS: Filters = {
  modelId: "",
  type: "",
  active: "true",
  tag: "",
  q: "",
  neverSent: false,
};

export function MidiasClient() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [committed, setCommitted] = useState<Filters>(INITIAL_FILTERS);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<MediaRead> | null>(null);
  const [models, setModels] = useState<EscortRead[]>([]);
  const [tagVocabulary, setTagVocabulary] = useState<MediaTagRead[]>([]);
  const [summary, setSummary] = useState<MediaUsageSummaryRead | null>(null);
  const [error, setError] = useState<BffFetchError | null>(null);
  const [summaryError, setSummaryError] = useState<BffFetchError | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ tone: "ok" | "error"; message: string } | null>(
    null,
  );
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null);
  const [patchNotice, setPatchNotice] = useState<string | null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<MediaRead | null>(null);

  const load = useCallback(async (active: Filters) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("page_size", String(PAGE_SIZE));
    if (active.modelId) params.set("model_id", active.modelId);
    if (active.type) params.set("type", active.type);
    if (active.active) params.set("is_active", active.active);
    if (active.tag) params.set("tag", active.tag);
    if (active.q) params.set("q", active.q);
    if (active.neverSent) params.set("never_sent", "true");
    const result = await bffFetch<PaginatedEnvelope<MediaRead>>(
      `/api/operator/media?${params.toString()}`,
    );
    setEnvelope(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  const loadModels = useCallback(async () => {
    const result = await bffFetch<PaginatedEnvelope<EscortRead>>(
      "/api/operator/escorts?page=1&page_size=100",
    );
    setModels(result.data?.items ?? []);
  }, []);

  const loadTags = useCallback(async () => {
    const result = await bffFetch<MediaTagRead[]>("/api/operator/media/tags");
    setTagVocabulary(result.data ?? []);
  }, []);

  const loadSummary = useCallback(async (modelId: string) => {
    const params = new URLSearchParams({ window: "7d" });
    if (modelId) params.set("model_id", modelId);
    const result = await bffFetch<MediaUsageSummaryRead>(
      `/api/operator/media/usage-summary?${params.toString()}`,
    );
    setSummary(result.data);
    setSummaryError(result.error);
  }, []);

  useEffect(() => {
    void loadModels();
    void loadTags();
  }, [loadModels, loadTags]);

  useEffect(() => {
    void load(committed);
    void loadSummary(committed.modelId);
    const id = window.setInterval(() => {
      void load(committed);
      void loadSummary(committed.modelId);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [committed, load, loadSummary]);

  const onSubmitFilters = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCommitted(filters);
    },
    [filters],
  );

  const onUpload = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setUploadNotice(null);
      const form = event.currentTarget;
      const data = new FormData(form);
      const file = data.get("file");
      if (!(file instanceof File) || file.size === 0) {
        setUploadNotice({ tone: "error", message: "Escolha um arquivo antes de enviar." });
        return;
      }
      setUploading(true);
      const result = await bffUpload<MediaRead>("/api/operator/media", data);
      setUploading(false);
      if (result.error) {
        setUploadNotice({ tone: "error", message: uploadErrorMessage(result.error.status) });
      } else {
        setUploadNotice({ tone: "ok", message: "Material adicionado à biblioteca." });
        form.reset();
        await load(committed);
        await loadSummary(committed.modelId);
      }
    },
    [committed, load, loadSummary],
  );

  const onToggleActive = useCallback(
    async (media: MediaRead) => {
      setPatchBusyId(media.id);
      setPatchNotice(null);
      const result = await bffSend<MediaRead>(
        `/api/operator/media/${encodeURIComponent(media.id)}`,
        { is_active: !media.is_active },
        "PATCH",
      );
      setPatchBusyId(null);
      if (result.error) {
        setPatchNotice("Não consegui atualizar o material. Tente de novo.");
      } else {
        setPatchNotice(media.is_active ? "Material desativado." : "Material reativado.");
        await load(committed);
      }
    },
    [committed, load],
  );

  const onSaveTags = useCallback(
    async (media: MediaRead, tags: string[]) => {
      setPatchBusyId(media.id);
      setPatchNotice(null);
      const result = await bffSend<MediaRead>(
        `/api/operator/media/${encodeURIComponent(media.id)}`,
        { tags },
        "PATCH",
      );
      setPatchBusyId(null);
      if (result.error) {
        setPatchNotice("Não consegui salvar as tags. Tente de novo.");
        return false;
      }
      setPatchNotice("Tags atualizadas.");
      await load(committed);
      return true;
    },
    [committed, load],
  );

  const items = envelope?.items ?? [];
  const usageBySent = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of summary?.most_used.items ?? []) {
      map.set(item.media_id, item.count);
    }
    return map;
  }, [summary]);

  return (
    <div className="section-stack">
      <SummaryPanel summary={summary} error={summaryError} totalLoaded={items.length} />

      <section className="panel" id="upload-material">
        <div className="panel-heading">
          <h2>Enviar novo material</h2>
        </div>
        <form className="form-grid" onSubmit={onUpload} aria-label="Enviar material">
          <label className="upload-dropzone" style={{ gridColumn: "1 / -1" }}>
            <span className="upload-dropzone-title">Solte o arquivo aqui ou selecione do computador</span>
            <span className="upload-dropzone-copy">
              Foto, vídeo, áudio ou documento que o agente pode usar nas conversas.
            </span>
            <input type="file" name="file" required />
          </label>
          <fieldset className="form-field" style={{ gridColumn: "1 / -1" }}>
            <legend>Tags</legend>
            <div className="inline-actions" style={{ flexWrap: "wrap", gap: 6 }}>
              {tagVocabulary.length === 0 ? (
                <span className="empty-state">Vocabulário de tags ainda não carregou.</span>
              ) : (
                tagVocabulary.map((tag) => (
                  <label key={tag.tag} className="chip" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag.tag}
                      style={{ marginRight: 4 }}
                    />
                    {tag.display_label}
                  </label>
                ))
              )}
            </div>
          </fieldset>
          <div className="form-field">
            <span>&nbsp;</span>
            <button className="button" type="submit" disabled={uploading}>
              {uploading ? "Enviando..." : "Enviar material"}
            </button>
          </div>
        </form>
        {uploadNotice ? (
          <div
            className={uploadNotice.tone === "ok" ? "panel-notice ok" : "panel-notice"}
            style={{ marginTop: 12 }}
          >
            {uploadNotice.message}
          </div>
        ) : null}
      </section>

      <section className="panel" id="catalogo-midias">
        <div className="panel-heading">
          <h2>Galeria de materiais</h2>
          <span className="badge muted">
            {loading ? "Atualizando" : `${envelope?.total ?? 0} no total`}
          </span>
        </div>
        <form className="filter-bar" onSubmit={onSubmitFilters} aria-label="Filtros de materiais">
          <label>
            <span>Agente</span>
            <select
              value={filters.modelId}
              onChange={(e) => setFilters({ ...filters, modelId: e.target.value })}
            >
              <option value="">Todas</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.display_name}
                  {model.is_active ? " (ativo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value as Filters["type"] })}
            >
              <option value="">Todos</option>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {mediaTypeLabel(opt)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Situação</span>
            <select
              value={filters.active}
              onChange={(e) => setFilters({ ...filters, active: e.target.value as Filters["active"] })}
            >
              {ACTIVE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tag</span>
            <select
              value={filters.tag}
              onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
            >
              <option value="">Todas</option>
              {tagVocabulary.map((tag) => (
                <option key={tag.tag} value={tag.tag}>
                  {tag.display_label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Buscar nome</span>
            <input
              type="search"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="ex.: tabela-2025"
            />
          </label>
          <label className="inline-actions" style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              checked={filters.neverSent}
              onChange={(e) => setFilters({ ...filters, neverSent: e.target.checked })}
            />
            <span>Só nunca enviadas</span>
          </label>
          <div className="form-field">
            <span>&nbsp;</span>
            <button className="button" type="submit">
              Aplicar filtros
            </button>
          </div>
        </form>

        {error ? <div className="panel-notice">{error.message}</div> : null}
        {patchNotice ? <div className="panel-notice warning">{patchNotice}</div> : null}

        {items.length === 0 ? (
          <div className="empty-state-card">
            <span className="empty-state-icon" aria-hidden="true" />
            <div className="empty-state-copy">
              <strong>Nenhum material no recorte atual</strong>
              <p>Ajuste os filtros ou envie um novo material para começar a biblioteca.</p>
            </div>
            <a className="button secondary empty-state-action" href="#upload-material">
              Adicionar material
            </a>
          </div>
        ) : (
          <div className="media-grid">
            {items.map((media) => (
              <MediaCard
                key={media.id}
                media={media}
                disabled={patchBusyId === media.id}
                sent7d={usageBySent.get(media.id) ?? 0}
                onToggleActive={() => void onToggleActive(media)}
                onEditTags={() => setEditingTagsFor(media)}
              />
            ))}
          </div>
        )}
      </section>

      {editingTagsFor ? (
        <TagEditorModal
          media={editingTagsFor}
          vocabulary={tagVocabulary}
          onClose={() => setEditingTagsFor(null)}
          onSave={async (tags) => {
            const ok = await onSaveTags(editingTagsFor, tags);
            if (ok) setEditingTagsFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryPanel({
  summary,
  error,
  totalLoaded,
}: {
  summary: MediaUsageSummaryRead | null;
  error: BffFetchError | null;
  totalLoaded: number;
}) {
  if (error) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Resumo</h2>
        </div>
        <div className="panel-notice">{error.message}</div>
      </section>
    );
  }
  const active = summary?.active.value ?? null;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Resumo</h2>
        <span className="badge muted">últimos 7 dias</span>
      </div>
      <div className="metric-grid compact">
        <div className="metric compact">
          <span className="metric-label">Materiais ativos</span>
          <span className="metric-value">{active === null ? "—" : formatNumber(active)}</span>
          <span className="metric-sub">na biblioteca</span>
        </div>
        <div className="metric compact">
          <span className="metric-label">No filtro atual</span>
          <span className="metric-value">{formatNumber(totalLoaded)}</span>
          <span className="metric-sub">visíveis abaixo</span>
        </div>
      </div>
      {summary ? (
        <div className="dashboard-columns" style={{ marginTop: 14 }}>
          <RankList
            title="Mais enviadas aos leads"
            items={summary.most_used.items.map((item) => ({
              id: item.media_id,
              primary: `${mediaTypeLabel(item.media_type)} · ${item.tags.join(", ") || "sem tags"}`,
              secondary: `${formatNumber(item.count)} envio(s)`,
            }))}
            emptyLabel="Sem envios na semana."
          />
          {summary.delivery_status_available ? (
            <RankList
              title="Falhas ao enviar"
              danger
              items={summary.send_failures.items.map((item) => ({
                id: item.media_id,
                primary: `${mediaTypeLabel(item.media_type)} · ${item.tags.join(", ") || "sem tags"}`,
                secondary: `${formatNumber(item.count)} falha(s)`,
              }))}
              emptyLabel="Sem falhas registradas."
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RankList({
  title,
  items,
  emptyLabel,
  danger = false,
}: {
  title: string;
  items: { id: string; primary: string; secondary: string }[];
  emptyLabel: string;
  danger?: boolean;
}) {
  return (
    <div className="attention-list">
      <div className="attention-heading">
        <h3>{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">{emptyLabel}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span className={danger ? "attention-item danger" : "attention-item"}>
                <span className="attention-title">{item.primary}</span>
                <span className="attention-summary">{item.secondary}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaCard({
  media,
  disabled,
  sent7d,
  onToggleActive,
  onEditTags,
}: {
  media: MediaRead;
  disabled: boolean;
  sent7d: number;
  onToggleActive: () => void;
  onEditTags: () => void;
}) {
  const contentUrl = `/api/operator/media/${encodeURIComponent(media.id)}/content`;
  const originalName = metadataString(media.metadata_json, "original_filename");

  return (
    <article className="media-card" id={`media-${media.id}`}>
      <div className="media-preview">
        <MediaPreview media={media} contentUrl={contentUrl} />
      </div>
      <div className="inline-actions" style={{ flexWrap: "wrap" }}>
        <span className="chip">{mediaTypeLabel(media.media_type)}</span>
        <span className={media.is_active ? "chip gold" : "chip danger"}>
          {media.is_active ? "Ativa" : "Inativa"}
        </span>
        {media.tags.length === 0 ? (
          <span className="chip warning">sem tags</span>
        ) : (
          media.tags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))
        )}
      </div>
      <div className="media-card-copy">
        <strong>{originalName || `${mediaTypeLabel(media.media_type)} sem nome`}</strong>
        <p className="empty-state" style={{ margin: 0, textAlign: "left" }}>
          Enviada {formatNumber(sent7d)} vez(es) nos últimos 7 dias · atualizada {formatDateTime(media.updated_at)}
        </p>
      </div>
      <div className="button-row" style={{ marginTop: 0 }}>
        <button className="button secondary" type="button" disabled={disabled} onClick={onEditTags}>
          Editar tags
        </button>
        <button
          className={media.is_active ? "button danger" : "button"}
          type="button"
          disabled={disabled}
          onClick={onToggleActive}
        >
          {media.is_active ? "Desativar" : "Reativar"}
        </button>
      </div>
    </article>
  );
}

function MediaPreview({ media, contentUrl }: { media: MediaRead; contentUrl: string }) {
  if (media.media_type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={contentUrl} alt={`Mídia ${media.id}`} />;
  }
  if (media.media_type === "video") {
    return <video src={contentUrl} controls preload="none" />;
  }
  if (media.media_type === "audio") {
    return <audio src={contentUrl} controls preload="none" style={{ width: "100%" }} />;
  }
  return (
    <div className="media-fallback">
      <a className="link-pill" href={contentUrl} target="_blank" rel="noreferrer">
        Abrir documento
      </a>
    </div>
  );
}

function TagEditorModal({
  media,
  vocabulary,
  onClose,
  onSave,
}: {
  media: MediaRead;
  vocabulary: MediaTagRead[];
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(media.tags));
  const [saving, setSaving] = useState(false);

  const toggle = (tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        alignItems: "center",
        background: "oklch(0% 0 0 / 0.6)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 60,
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          display: "grid",
          gap: "var(--space-md)",
          maxWidth: 480,
          padding: "var(--space-xl)",
          width: "min(100%, 480px)",
        }}
      >
        <div className="panel-heading">
          <h2>Editar tags</h2>
        </div>
        <div className="inline-actions" style={{ flexWrap: "wrap", gap: 6 }}>
          {vocabulary.map((tag) => (
            <label key={tag.tag} className="chip" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={selected.has(tag.tag)}
                onChange={() => toggle(tag.tag)}
                style={{ marginRight: 4 }}
              />
              {tag.display_label}
            </label>
          ))}
        </div>
        <div className="button-row">
          <button className="button secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(Array.from(selected));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function uploadErrorMessage(status: number): string {
  if (status === 409) return "Nenhum agente ativo no sistema para receber o material.";
  if (status === 413) return "Arquivo grande demais. Reduza o tamanho antes de enviar.";
  if (status === 415) return "Tipo de arquivo não suportado. Envie foto, vídeo, áudio ou documento.";
  if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === 422) return "Tag inválida ou campo do envio fora do esperado.";
  return "Não consegui enviar a mídia. Tente de novo em alguns segundos.";
}
