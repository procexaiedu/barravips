import Link from "next/link";

type StatusBadgeTone = "ok" | "warning" | "danger" | "muted";

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  statusBadge?: { label: string; tone?: StatusBadgeTone };
  primaryAction?: Action;
  secondaryAction?: Action;
};

export function PageHeader({
  title,
  description,
  eyebrow = "Operação",
  statusBadge,
  primaryAction,
  secondaryAction,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-top">
        <div className="page-header-meta">
          <p className="eyebrow">{eyebrow}</p>
          {statusBadge ? (
            <span className={`badge ${statusBadge.tone ?? "muted"}`}>
              {statusBadge.label}
            </span>
          ) : null}
        </div>
        {primaryAction || secondaryAction ? (
          <div className="page-header-actions">
            {secondaryAction ? (
              secondaryAction.href ? (
                <Link className="button secondary" href={secondaryAction.href}>
                  {secondaryAction.label}
                </Link>
              ) : (
                <button
                  className="button secondary"
                  type="button"
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.label}
                </button>
              )
            ) : null}
            {primaryAction ? (
              primaryAction.href ? (
                <Link className="button" href={primaryAction.href}>
                  {primaryAction.label}
                </Link>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={primaryAction.onClick}
                >
                  {primaryAction.label}
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
