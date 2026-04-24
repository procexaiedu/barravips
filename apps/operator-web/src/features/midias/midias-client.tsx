"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  MediaApprovalStatus,
  MediaRead,
  MediaType,
  MediaUsageBreakdownMetric,
  MediaUsageRankRead,
  MediaUsageSummaryRead,
  ModelRead,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, bffSend, bffUpload, type BffFetchError } from "@/features/shared/bff-client";
import { formatDateTime, formatNumber } from "@/features/shared/formatters";
import {
  mediaApprovalLabel,
  mediaSendConstraintLabel,
  mediaTypeLabel,
} from "@/features/shared/labels";

const POLL_INTERVAL_MS = 30_000;
const PAGE_SIZE = 60;

const APPROVAL_OPTIONS: MediaApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "REVOKED"];
const TYPE_OPTIONS: MediaType[] = ["image", "audio", "video", "document"];
const MATERIAL_CATEGORIES = [
  "produto",
  "preço",
  "case",
  "prova social",
  "tutorial",
  "institucional",
  "objeções",
  "pós-venda",
];
const MATERIAL_STATUS_GUIDE = [
  {
    label: "Rascunho",
    description: "Material salvo sem instrução completa; ainda não deve orientar a IA.",
  },
  {
    label: "Aguardando aprovação",
    description: "Arquivo pronto para revisão humana antes de liberar o uso.",
  },
  {
    label: "Aprovado para uso",
    description: "A IA pode usar quando a categoria e a instrução combinarem com a conversa.",
  },
  {
    label: "Reprovado",
    description: "Material inadequado, vencido ou sem aderência comercial.",
  },
  {
    label: "Arquivado",
    description: "Sai da operação ativa, mas permanece como histórico.",
  },
];
const SEND_CONSTRAINT_KEYS = [
  "send_only_when_requested",
  "view_once",
  "max_per_day",
  "min_interval_minutes",
  "allowed_hours",
  "requires_approval",
] as const;
const METADATA_KEYS = [
  "detected_mime",
  "mime_type",
  "width",
  "height",
  "duration_ms",
  "size_bytes",
  "original_filename",
  "usage_instruction",
  "ai_usage_permission",
] as const;

type Filters = {
  modelId: string;
  type: "" | MediaType;
  approval: "" | MediaApprovalStatus;
};

export function MidiasClient() {
  const [filters, setFilters] = useState<Filters>({ modelId: "", type: "", approval: "" });
  const [committed, setCommitted] = useState<Filters>(filters);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<MediaRead> | null>(null);
  const [models, setModels] = useState<ModelRead[]>([]);
  const [modelsError, setModelsError] = useState<BffFetchError | null>(null);
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
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  const load = useCallback(
    async (active: Filters) => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", String(PAGE_SIZE));
      if (active.modelId) {
        params.set("model_id", active.modelId);
      }
      if (active.type) {
        params.set("type", active.type);
      }
      if (active.approval) {
        params.set("approval_status", active.approval);
      }
      const result = await bffFetch<PaginatedEnvelope<MediaRead>>(
        `/api/operator/media?${params.toString()}`,
      );
      setEnvelope(result.data);
      setError(result.error);
      setLoading(false);
    },
    [],
  );

  const loadModels = useCallback(async () => {
    const result = await bffFetch<PaginatedEnvelope<ModelRead>>(
      "/api/operator/models?page=1&page_size=100",
    );
    setModels(result.data?.items ?? []);
    setModelsError(result.error);
  }, []);

  const loadSummary = useCallback(async () => {
    const result = await bffFetch<MediaUsageSummaryRead>(
      "/api/operator/media/usage-summary?window=7d",
    );
    setSummary(result.data);
    setSummaryError(result.error);
  }, []);

  useEffect(() => {
    void loadModels();
    void load(committed);
    void loadSummary();
    const id = window.setInterval(() => {
      void load(committed);
      void loadSummary();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [committed, load, loadModels, loadSummary]);

  useEffect(() => {
    const syncFromUrl = () => {
      setSelectedMediaId(new URLSearchParams(window.location.search).get("media"));
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const openMedia = useCallback((mediaId: string) => {
    setSelectedMediaId(mediaId);
    window.history.pushState(null, "", `/midias?media=${encodeURIComponent(mediaId)}`);
  }, []);

  const closeMedia = useCallback(() => {
    setSelectedMediaId(null);
    window.history.pushState(null, "", "/midias");
  }, []);

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
      const usageInstruction = String(data.get("usage_instruction") ?? "").trim();
      const aiUsagePermission = String(data.get("ai_usage_permission") ?? "needs_approval");
      if (!(file instanceof File) || file.size === 0) {
        setUploadNotice({ tone: "error", message: "Escolha um arquivo antes de enviar." });
        return;
      }
      if (!data.get("category")) {
        data.delete("category");
      }
      setUploading(true);
      const result = await bffUpload<MediaRead>("/api/operator/media", data);
      if (result.error) {
        setUploading(false);
        setUploadNotice({ tone: "error", message: uploadErrorMessage(result.error.status) });
      } else {
        if (result.data) {
          await bffSend<MediaRead>(
            `/api/operator/media/${encodeURIComponent(result.data.id)}`,
            {
              metadata_json: {
                ...result.data.metadata_json,
                ai_usage_permission: aiUsagePermission,
                usage_instruction: usageInstruction || null,
              },
              send_constraints_json: {
                ...result.data.send_constraints_json,
                requires_approval: aiUsagePermission !== "allowed",
              },
            },
            "PATCH",
          );
        }
        setUploading(false);
        setUploadNotice({
          tone: "ok",
          message: "Material enviado para a biblioteca. Revise a categoria e aprove antes de liberar para o agente.",
        });
        form.reset();
        await load(committed);
      }
    },
    [committed, load],
  );

  const onPatchApproval = useCallback(
    async (media: MediaRead, approval: MediaApprovalStatus) => {
      setPatchBusyId(media.id);
      setPatchNotice(null);
      const result = await bffSend<MediaRead>(
        `/api/operator/media/${encodeURIComponent(media.id)}`,
        { approval_status: approval },
        "PATCH",
      );
      setPatchBusyId(null);
      if (result.error) {
        setPatchNotice(`Não consegui atualizar o material. Tente de novo.`);
      } else {
        setPatchNotice(`Material marcado como "${mediaApprovalLabel(approval)}".`);
        await load(committed);
      }
    },
    [committed, load],
  );

  const onPatchCategory = useCallback(
    async (media: MediaRead, category: string) => {
      setPatchBusyId(media.id);
      setPatchNotice(null);
      const result = await bffSend<MediaRead>(
        `/api/operator/media/${encodeURIComponent(media.id)}`,
        { category: category || null },
        "PATCH",
      );
      setPatchBusyId(null);
      if (result.error) {
        setPatchNotice(`Não consegui alterar a categoria. Tente de novo.`);
      } else {
        setPatchNotice("Categoria atualizada.");
        await load(committed);
      }
    },
    [committed, load],
  );

  const items = envelope?.items ?? [];
  const selectedMedia = selectedMediaId
    ? items.find((media) => media.id === selectedMediaId) ?? null
    : null;
  const selectedUsage = selectedMediaId && summary ? usageForMedia(summary, selectedMediaId) : null;
  const libraryStats = useMemo(() => summarizeLibrary(items), [items]);

  return (
    <div className="section-stack">
      <section className="operations-hero ok">
        <div className="operations-hero-copy">
          <span className="badge muted">Biblioteca comercial</span>
          <h2>Materiais que o agente pode usar para converter melhor</h2>
          <p>
            Organize arquivos por categoria, aprove o uso e deixe uma instrução clara para a IA
            saber quando enviar cada material.
          </p>
        </div>
        <div className="operations-hero-actions">
          <a className="button" href="#upload-material">
            Adicionar material
          </a>
          <a className="button secondary" href="#catalogo-midias">
            Ver biblioteca
          </a>
        </div>
      </section>

      <section className="metric-grid compact" aria-label="Resumo da biblioteca">
        <div className="metric compact">
          <span className="metric-label">Aprovados</span>
          <span className="metric-value">{formatNumber(libraryStats.approved)}</span>
          <span className="metric-sub">liberados para IA</span>
        </div>
        <div className={libraryStats.pending > 0 ? "metric compact warning" : "metric compact"}>
          <span className="metric-label">Aguardando</span>
          <span className="metric-value">{formatNumber(libraryStats.pending)}</span>
          <span className="metric-sub">precisam de revisão</span>
        </div>
        <div className="metric compact">
          <span className="metric-label">Categorias</span>
          <span className="metric-value">{formatNumber(libraryStats.categories)}</span>
          <span className="metric-sub">em uso no filtro atual</span>
        </div>
        <div className="metric compact">
          <span className="metric-label">Arquivados</span>
          <span className="metric-value">{formatNumber(libraryStats.archived)}</span>
          <span className="metric-sub">fora da operação ativa</span>
        </div>
      </section>

      <MediaUsageSummaryPanel
        summary={summary}
        error={summaryError}
        onOpenMedia={openMedia}
        onShowPending={() => {
          const next = { ...filters, approval: "PENDING" as const };
          setFilters(next);
          setCommitted(next);
        }}
      />

      <section className="panel" id="upload-material">
        <div className="panel-heading">
          <h2>Enviar novo material</h2>
          <span className="badge muted">Biblioteca de materiais</span>
        </div>
        <p className="section-subtitle">
          Faça upload de arquivos comerciais e explique quando o agente pode usar cada um.
        </p>
        <form className="form-grid" onSubmit={onUpload} aria-label="Enviar material">
          <label className="upload-dropzone" style={{ gridColumn: "1 / -1" }}>
            <span className="upload-dropzone-title">Solte o arquivo aqui ou selecione do computador</span>
            <span className="upload-dropzone-copy">
              Use fotos, vídeos, PDFs, propostas, tabelas, cases ou tutoriais que apoiam a conversa comercial.
            </span>
            <input type="file" name="file" required />
          </label>
          <label className="form-field">
            <span>Categoria</span>
            <select name="category" defaultValue="">
              <option value="">Selecione</option>
              {MATERIAL_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Situação inicial</span>
            <select name="approval_status" defaultValue="PENDING">
              {APPROVAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {mediaApprovalLabel(opt)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Permissão de uso pela IA</span>
            <select name="ai_usage_permission" defaultValue="needs_approval">
              <option value="needs_approval">Somente depois de aprovado</option>
              <option value="allowed">Permitir quando aprovado</option>
              <option value="blocked">Nunca usar automaticamente</option>
            </select>
          </label>
          <label className="form-field" style={{ gridColumn: "1 / -1" }}>
            <span>Instrução de uso</span>
            <textarea
              name="usage_instruction"
              rows={3}
              placeholder="Ex.: enviar quando o lead pedir preço anual ou comparar planos."
            />
          </label>
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

      <section className="panel">
        <div className="panel-heading">
          <h2>Status dos materiais</h2>
          <span className="badge muted">Fluxo editorial</span>
        </div>
        <div className="status-guide-grid">
          {MATERIAL_STATUS_GUIDE.map((status) => (
            <article className="status-guide-card" key={status.label}>
              <strong>{status.label}</strong>
              <p>{status.description}</p>
            </article>
          ))}
        </div>
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
              value={filters.approval}
              onChange={(e) =>
                setFilters({ ...filters, approval: e.target.value as Filters["approval"] })
              }
            >
              <option value="">Todas</option>
              {APPROVAL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {mediaApprovalLabel(opt)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-field">
            <span>&nbsp;</span>
            <button className="button" type="submit">
              Aplicar filtros
            </button>
          </div>
        </form>

        {error ? <div className="panel-notice">{error.message}</div> : null}
        {modelsError ? <div className="panel-notice warning">{modelsError.message}</div> : null}
        {patchNotice ? <div className="panel-notice warning">{patchNotice}</div> : null}

        {items.length === 0 ? (
          <div className="empty-state-card">
            <span className="empty-state-icon" aria-hidden="true" />
            <div className="empty-state-copy">
              <strong>Sua biblioteca comercial ainda está vazia</strong>
              <p>
                Adicione apresentações, tabelas, cases, tutoriais e respostas a objeções para
                orientar o que a IA pode enviar nas conversas.
              </p>
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
                onOpen={() => openMedia(media.id)}
                onApproval={(approval) => void onPatchApproval(media, approval)}
                onCategory={(category) => void onPatchCategory(media, category)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedMediaId ? (
        <MediaDetailPanel
          media={selectedMedia}
          mediaId={selectedMediaId}
          loading={loading && !selectedMedia}
          usage={selectedUsage}
          onClose={closeMedia}
        />
      ) : null}
    </div>
  );
}

function MediaUsageSummaryPanel({
  summary,
  error,
  onOpenMedia,
  onShowPending,
}: {
  summary: MediaUsageSummaryRead | null;
  error: BffFetchError | null;
  onOpenMedia: (mediaId: string) => void;
  onShowPending: () => void;
}) {
  if (error) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Resumo da semana</h2>
          <span className="badge muted">últimos 7 dias</span>
        </div>
        <div className="panel-notice">{error.message}</div>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Resumo da semana</h2>
          <span className="badge muted">Carregando</span>
        </div>
        <p className="empty-state">Montando o resumo das mídias.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Resumo da semana</h2>
        <span className="badge muted">últimos 7 dias</span>
      </div>

      <div className="metric-grid">
        <a
          className={summary.pending.value > 0 ? "metric metric-link warning" : "metric metric-link"}
          href="#catalogo-midias"
          onClick={onShowPending}
        >
          <span className="metric-label">Aguardando aprovação</span>
          <span className="metric-value">{formatNumber(summary.pending.value)}</span>
        </a>
        <a className="metric metric-link" href="#catalogo-midias">
          <span className="metric-label">Sem categoria</span>
          <span className="metric-value">{formatNumber(summary.without_category.value)}</span>
        </a>
      </div>

      <div className="dashboard-columns" style={{ marginTop: 14 }}>
        <BreakdownTable
          title="Aprovadas por categoria"
          metric={summary.approved_by_category}
        />
        <RankList
          title="Materiais mais enviados aos leads"
          rank={summary.most_used}
          onOpenMedia={onOpenMedia}
          lowVolumeNote="Pouco dado ainda: use só para localizar envios recentes, não como ranking definitivo."
        />
      </div>

      {summary.delivery_status_available ? (
        <div style={{ marginTop: 14 }}>
          <RankList title="Materiais que falharam ao enviar" rank={summary.send_failures} danger />
        </div>
      ) : (
        <p className="empty-state" style={{ marginTop: 14, textAlign: "left" }}>
          Ainda não temos dados de entrega suficientes para mostrar falhas de envio.
        </p>
      )}
    </section>
  );
}

function BreakdownTable({
  title,
  metric,
}: {
  title: string;
  metric: MediaUsageBreakdownMetric;
}) {
  const entries = Object.entries(metric.counts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="attention-list">
      <div className="attention-heading">
        <h3>{title}</h3>
        <span className="badge muted">{formatNumber(metric.meta.sample_size)} aprovadas</span>
      </div>
      {entries.length === 0 ? (
        <p className="empty-state">Nenhuma mídia aprovada até agora.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="numeric">Quantas</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([category, count]) => (
                <tr key={category}>
                  <td>{category}</td>
                  <td className="numeric">{formatNumber(count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RankList({
  title,
  rank,
  onOpenMedia,
  danger = false,
  lowVolumeNote,
}: {
  title: string;
  rank: MediaUsageRankRead;
  onOpenMedia?: (mediaId: string) => void;
  danger?: boolean;
  lowVolumeNote?: string;
}) {
  const showLowVolume = rank.meta.sample_size > 0 && rank.meta.sample_size < 3;
  return (
    <div className="attention-list">
      <div className="attention-heading">
        <h3>{title}</h3>
        <span className="badge muted">{formatNumber(rank.meta.sample_size)} envios</span>
      </div>
      {showLowVolume && lowVolumeNote ? (
        <div className="panel-notice warning">{lowVolumeNote}</div>
      ) : null}
      {rank.items.length === 0 ? (
        <p className="empty-state">Nada a mostrar na semana.</p>
      ) : (
        <ul>
          {rank.items.map((item) => (
            <li key={item.media_id}>
              <a
                className={danger ? "attention-item danger" : "attention-item"}
                href={`/midias?media=${encodeURIComponent(item.media_id)}`}
                onClick={(event) => {
                  if (!onOpenMedia) return;
                  event.preventDefault();
                  onOpenMedia(item.media_id);
                }}
              >
                <span className="attention-title">
                  {mediaTypeLabel(item.media_type)} · {item.category || "sem categoria"}
                </span>
                <span className="attention-summary">
                  {formatNumber(item.count)} envio(s) · {mediaApprovalLabel(item.approval_status)}
                </span>
                <span className="attention-meta">Ver mídia</span>
              </a>
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
  onOpen,
  onApproval,
  onCategory,
}: {
  media: MediaRead;
  disabled: boolean;
  onOpen: () => void;
  onApproval: (approval: MediaApprovalStatus) => void;
  onCategory: (category: string) => void;
}) {
  const [category, setCategory] = useState(media.category ?? "");
  useEffect(() => {
    setCategory(media.category ?? "");
  }, [media.category]);

  const contentUrl = `/api/operator/media/${encodeURIComponent(media.id)}/content`;
  const constraints = sendConstraintEntries(media.send_constraints_json);
  const usageInstruction = metadataString(media.metadata_json, "usage_instruction");
  const originalName = metadataString(media.metadata_json, "original_filename");
  const aiPermission = metadataString(media.metadata_json, "ai_usage_permission");

  return (
    <article
      className="media-card"
      id={`media-${media.id}`}
      tabIndex={0}
      onClick={(event) => {
        if (!isInteractiveTarget(event.target)) {
          onOpen();
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !isInteractiveTarget(event.target)) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="media-preview">
        {media.media_type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contentUrl} alt={`Mídia ${media.id}`} />
        ) : media.media_type === "video" ? (
          <video src={contentUrl} controls preload="none" />
        ) : media.media_type === "audio" ? (
          <audio src={contentUrl} controls preload="none" style={{ width: "100%" }} />
        ) : (
          <div className="media-fallback">
            <a className="link-pill" href={contentUrl} target="_blank" rel="noreferrer">
              Abrir documento
            </a>
          </div>
        )}
      </div>
      <div className="inline-actions" style={{ flexWrap: "wrap" }}>
        <span className="chip">{mediaTypeLabel(media.media_type)}</span>
        <ApprovalBadge status={media.approval_status} />
        <span className={aiPermission === "blocked" ? "chip danger" : "chip gold"}>
          {aiPermissionLabel(aiPermission)}
        </span>
        <span className="chip" title="Atualizada em">{formatDateTime(media.updated_at)}</span>
      </div>
      <div className="media-card-copy">
        <strong>{originalName || `${mediaTypeLabel(media.media_type)} comercial`}</strong>
        <p>{usageInstruction || "Sem instrução de uso. Adicione contexto antes de liberar para a IA."}</p>
      </div>
      <label className="form-field">
        <span>Categoria</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={disabled}
          onBlur={() => {
            if (category !== (media.category ?? "")) {
              onCategory(category);
            }
          }}
        >
          <option value="">sem categoria</option>
          {MATERIAL_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Restrições de envio</summary>
        {constraints.length === 0 ? (
          <p className="empty-state" style={{ margin: "8px 0 0", textAlign: "left" }}>
            Sem restrições.
          </p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {constraints.map(({ key, value }) => (
              <li key={key}>
                <strong>{mediaSendConstraintLabel(key)}:</strong> {value}
              </li>
            ))}
          </ul>
        )}
      </details>
      <div className="button-row" style={{ marginTop: 0 }}>
        <button className="button secondary" type="button" disabled={disabled} onClick={onOpen}>
          Ver detalhes
        </button>
        <button
          className="button"
          type="button"
          disabled={disabled || media.approval_status === "APPROVED"}
          onClick={() => onApproval("APPROVED")}
        >
          Aprovar
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={disabled || media.approval_status === "REJECTED"}
          onClick={() => onApproval("REJECTED")}
        >
          Rejeitar
        </button>
        <button
          className="button danger"
          type="button"
          disabled={disabled || media.approval_status === "REVOKED"}
          onClick={() => onApproval("REVOKED")}
        >
          Revogar
        </button>
      </div>
    </article>
  );
}

function MediaDetailPanel({
  media,
  mediaId,
  loading,
  usage,
  onClose,
}: {
  media: MediaRead | null;
  mediaId: string;
  loading: boolean;
  usage: MediaUsageForMedia | null;
  onClose: () => void;
}) {
  const contentUrl = `/api/operator/media/${encodeURIComponent(mediaId)}/content`;
  const constraints = media ? sendConstraintEntries(media.send_constraints_json) : [];
  const metadata = media ? metadataEntries(media.metadata_json) : [];

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        alignItems: "stretch",
        background: "oklch(0% 0 0 / 0.72)",
        display: "flex",
        inset: 0,
        justifyContent: "flex-end",
        position: "fixed",
        zIndex: 60,
      }}
    >
      <aside
        aria-label="Detalhe da midia"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--panel)",
          borderLeft: "1px solid var(--border-strong)",
          display: "grid",
          gap: "var(--space-md)",
          maxWidth: 520,
          overflowY: "auto",
          padding: "var(--space-xl)",
          width: "min(100%, 520px)",
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>Detalhe da mídia</h2>
            <p className="empty-state">{mediaId}</p>
          </div>
          <button className="button secondary" type="button" onClick={onClose} style={{ marginTop: 0 }}>
            Fechar
          </button>
        </div>

        {loading ? <p className="empty-state">Carregando mídia.</p> : null}

        {!loading && !media ? (
          <div className="panel-notice warning">
            Mídia não encontrada no recorte atual da galeria. Limpe os filtros ou atualize a lista para ver os dados completos.
          </div>
        ) : null}

        {media ? (
          <>
            <div className="media-card" style={{ padding: 0, border: 0 }}>
              <div className="media-preview" style={{ height: 260 }}>
                <MediaPreview media={media} contentUrl={contentUrl} />
              </div>
            </div>

            <div className="inline-actions" style={{ flexWrap: "wrap" }}>
              <span className="chip">{mediaTypeLabel(media.media_type)}</span>
              <ApprovalBadge status={media.approval_status} />
              <span className="chip">{media.category || "sem categoria"}</span>
            </div>

            <section>
              <h3>Uso recente</h3>
              {usage && (usage.sent > 0 || usage.failed > 0) ? (
                <dl className="detail-list">
                  <DetailRow label="Envios em 7 dias" value={formatNumber(usage.sent)} />
                  <DetailRow label="Falhas em 7 dias" value={formatNumber(usage.failed)} />
                </dl>
              ) : (
                <p className="empty-state">Sem uso recente nos rankings carregados.</p>
              )}
            </section>

            <section>
              <h3>Restrições de envio</h3>
              <KeyValueList entries={constraints} empty="Sem restrições whitelistadas." />
            </section>

            <section>
              <h3>Metadados seguros</h3>
              <KeyValueList entries={metadata} empty="Sem metadados seguros para exibir." />
            </section>

            <dl className="detail-list">
              <DetailRow label="Criada em" value={formatDateTime(media.created_at)} />
              <DetailRow label="Atualizada em" value={formatDateTime(media.updated_at)} />
            </dl>
          </>
        ) : null}
      </aside>
    </div>
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

function KeyValueList({ entries, empty }: { entries: DetailEntry[]; empty: string }) {
  if (entries.length === 0) {
    return <p className="empty-state">{empty}</p>;
  }
  return (
    <dl className="detail-list">
      {entries.map(({ key, label, value }) => (
        <DetailRow key={key} label={label} value={value} />
      ))}
    </dl>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type DetailEntry = {
  key: string;
  label: string;
  value: string;
};

type MediaUsageForMedia = {
  sent: number;
  failed: number;
};

function sendConstraintEntries(constraints: Record<string, unknown>) {
  return SEND_CONSTRAINT_KEYS.flatMap((key) => {
    if (!(key in constraints)) return [];
    return [
      {
        key,
        label: mediaSendConstraintLabel(key),
        value: formatSendConstraintValue(key, constraints[key]),
      },
    ];
  });
}

function metadataEntries(metadata: Record<string, unknown>): DetailEntry[] {
  return METADATA_KEYS.flatMap((key) => {
    if (!(key in metadata)) return [];
    return [{ key, label: mediaMetadataLabel(key), value: formatMetadataValue(key, metadata[key]) }];
  });
}

function summarizeLibrary(items: MediaRead[]) {
  const categories = new Set(
    items
      .map((media) => media.category?.trim())
      .filter((category): category is string => Boolean(category)),
  );
  return {
    approved: items.filter((media) => media.approval_status === "APPROVED").length,
    pending: items.filter((media) => media.approval_status === "PENDING").length,
    archived: items.filter((media) => media.approval_status === "REVOKED").length,
    categories: categories.size,
  };
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function aiPermissionLabel(permission: string | null): string {
  if (permission === "allowed") return "IA permitida";
  if (permission === "blocked") return "IA bloqueada";
  return "IA após aprovação";
}

function formatSendConstraintValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "number") {
    return key === "min_interval_minutes" ? `${value} min` : formatNumber(value);
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const values = value.filter((item) => ["string", "number", "boolean"].includes(typeof item));
    return values.length > 0 ? values.map(String).join(", ") : "configurado";
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
      .map(([itemKey, item]) => `${itemKey}: ${String(item)}`);
    return entries.length > 0 ? entries.join(", ") : "configurado";
  }
  return "não informado";
}

function mediaMetadataLabel(key: string): string {
  if (key === "detected_mime" || key === "mime_type") return "MIME";
  if (key === "width") return "Largura";
  if (key === "height") return "Altura";
  if (key === "duration_ms") return "Duração";
  if (key === "size_bytes") return "Tamanho";
  if (key === "original_filename") return "Arquivo original";
  if (key === "usage_instruction") return "Instrução de uso";
  if (key === "ai_usage_permission") return "Permissão da IA";
  return key;
}

function formatMetadataValue(key: string, value: unknown): string {
  if (typeof value === "number") {
    if (key === "size_bytes") return formatBytes(value);
    if (key === "duration_ms") return `${formatNumber(value)} ms`;
    return formatNumber(value);
  }
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "boolean") return value ? "sim" : "não";
  return "não informado";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${formatNumber(value)} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${formatNumber(Math.round(kb))} KB`;
  return `${formatNumber(Math.round(kb / 1024))} MB`;
}

function usageForMedia(summary: MediaUsageSummaryRead, mediaId: string): MediaUsageForMedia {
  const sent = summary.most_used.items.find((item) => item.media_id === mediaId)?.count ?? 0;
  const failed = summary.send_failures.items.find((item) => item.media_id === mediaId)?.count ?? 0;
  return { sent, failed };
}

function isInteractiveTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("a, button, input, select, textarea, audio, video, label, details, summary"))
  );
}

function ApprovalBadge({ status }: { status: MediaApprovalStatus }) {
  const label = mediaApprovalLabel(status);
  if (status === "APPROVED") {
    return <span className="chip gold">{label}</span>;
  }
  if (status === "PENDING") {
    return <span className="chip warning">{label}</span>;
  }
  return <span className="chip danger">{label}</span>;
}

function uploadErrorMessage(status: number): string {
  if (status === 409) {
    return "Nenhum agente ativo no sistema para receber o material.";
  }
  if (status === 413) {
    return "Arquivo grande demais. Reduza o tamanho antes de enviar.";
  }
  if (status === 415) {
    return "Tipo de arquivo não suportado. Envie foto, vídeo, áudio ou documento.";
  }
  if (status === 401) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (status === 422) {
    return "Algum campo do envio está inválido. Revise e tente de novo.";
  }
  return "Não consegui enviar a mídia. Tente de novo em alguns segundos.";
}
