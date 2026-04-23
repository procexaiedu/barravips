"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  MediaApprovalStatus,
  MediaRead,
  MediaType,
  MediaUsageBreakdownMetric,
  MediaUsageRankRead,
  MediaUsageSummaryRead,
  PaginatedEnvelope,
} from "@/contracts";
import { bffFetch, bffSend, bffUpload, type BffFetchError } from "@/features/shared/bff-client";
import { formatDateTime, formatNumber } from "@/features/shared/formatters";
import { mediaApprovalLabel, mediaTypeLabel } from "@/features/shared/labels";

const POLL_INTERVAL_MS = 30_000;
const PAGE_SIZE = 60;

const APPROVAL_OPTIONS: MediaApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "REVOKED"];
const TYPE_OPTIONS: MediaType[] = ["image", "audio", "video", "document"];

type Filters = {
  type: "" | MediaType;
  approval: "" | MediaApprovalStatus;
};

export function MidiasClient() {
  const [filters, setFilters] = useState<Filters>({ type: "", approval: "" });
  const [committed, setCommitted] = useState<Filters>(filters);
  const [envelope, setEnvelope] = useState<PaginatedEnvelope<MediaRead> | null>(null);
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

  const load = useCallback(
    async (active: Filters) => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", String(PAGE_SIZE));
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

  const loadSummary = useCallback(async () => {
    const result = await bffFetch<MediaUsageSummaryRead>(
      "/api/operator/media/usage-summary?window=7d",
    );
    setSummary(result.data);
    setSummaryError(result.error);
  }, []);

  useEffect(() => {
    void load(committed);
    void loadSummary();
    const id = window.setInterval(() => {
      void load(committed);
      void loadSummary();
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
      if (!data.get("category")) {
        data.delete("category");
      }
      setUploading(true);
      const result = await bffUpload<MediaRead>("/api/operator/media", data);
      setUploading(false);
      if (result.error) {
        setUploadNotice({ tone: "error", message: uploadErrorMessage(result.error.status) });
      } else {
        setUploadNotice({ tone: "ok", message: "Mídia enviada. Ela fica aguardando sua aprovação antes de a IA usar." });
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
        setPatchNotice(`Não consegui atualizar a mídia. Tente de novo.`);
      } else {
        setPatchNotice(`Mídia marcada como "${mediaApprovalLabel(approval)}".`);
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

  return (
    <div className="section-stack">
      <MediaUsageSummaryPanel
        summary={summary}
        error={summaryError}
        onShowPending={() => {
          const next = { ...filters, approval: "PENDING" as const };
          setFilters(next);
          setCommitted(next);
        }}
      />

      <section className="panel">
        <div className="panel-heading">
          <h2>Enviar nova mídia</h2>
          <span className="badge muted">Entra aguardando aprovação</span>
        </div>
        <form className="form-grid" onSubmit={onUpload} aria-label="Enviar mídia">
          <label className="form-field">
            <span>Arquivo</span>
            <input type="file" name="file" required />
          </label>
          <label className="form-field">
            <span>Categoria (opcional)</span>
            <input type="text" name="category" placeholder="Ex.: rosto, ambiente, corpo" />
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
          <div className="form-field">
            <span>&nbsp;</span>
            <button className="button" type="submit" disabled={uploading}>
              {uploading ? "Enviando..." : "Enviar mídia"}
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
          <h2>Galeria de mídias</h2>
          <span className="badge muted">
            {loading ? "Atualizando" : `${envelope?.total ?? 0} no total`}
          </span>
        </div>
        <form className="filter-bar" onSubmit={onSubmitFilters} aria-label="Filtros de mídia">
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
        {patchNotice ? <div className="panel-notice warning">{patchNotice}</div> : null}

        {items.length === 0 ? (
          <p className="empty-state">Nenhuma mídia encontrada com esses filtros.</p>
        ) : (
          <div className="media-grid">
            {items.map((media) => (
              <MediaCard
                key={media.id}
                media={media}
                disabled={patchBusyId === media.id}
                onApproval={(approval) => void onPatchApproval(media, approval)}
                onCategory={(category) => void onPatchCategory(media, category)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MediaUsageSummaryPanel({
  summary,
  error,
  onShowPending,
}: {
  summary: MediaUsageSummaryRead | null;
  error: BffFetchError | null;
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
          title="Mais enviadas aos clientes"
          rank={summary.most_used}
          lowVolumeNote="Pouco dado ainda: use só para localizar envios recentes, não como ranking definitivo."
        />
      </div>

      {summary.delivery_status_available ? (
        <div style={{ marginTop: 14 }}>
          <RankList title="Mídias que falharam ao enviar" rank={summary.send_failures} danger />
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
  danger = false,
  lowVolumeNote,
}: {
  title: string;
  rank: MediaUsageRankRead;
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
                href={item.drilldown_href}
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
  onApproval,
  onCategory,
}: {
  media: MediaRead;
  disabled: boolean;
  onApproval: (approval: MediaApprovalStatus) => void;
  onCategory: (category: string) => void;
}) {
  const [category, setCategory] = useState(media.category ?? "");
  useEffect(() => {
    setCategory(media.category ?? "");
  }, [media.category]);

  const contentUrl = `/api/operator/media/${encodeURIComponent(media.id)}/content`;

  return (
    <article className="media-card" id={`media-${media.id}`}>
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
        <span className="chip" title="Atualizada em">{formatDateTime(media.updated_at)}</span>
      </div>
      <label className="form-field">
        <span>Categoria</span>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={disabled}
          onBlur={() => {
            if (category !== (media.category ?? "")) {
              onCategory(category);
            }
          }}
        />
      </label>
      <div className="button-row" style={{ marginTop: 0 }}>
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
    return "Nenhuma modelo ativa no sistema para receber a mídia.";
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
