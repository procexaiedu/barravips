"use client";

import { useId } from "react";
import type { CSSProperties } from "react";

import { formatCurrency, formatNumber } from "@/features/shared/formatters";

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

type DonutProps = {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
};

export function Donut({
  segments,
  size = 144,
  strokeWidth = 18,
  centerLabel,
  centerValue,
}: DonutProps) {
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="fin-donut">
      <svg
        aria-hidden="true"
        className="fin-donut-svg"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="color-mix(in srgb, var(--border) 88%, white 12%)"
          strokeWidth={strokeWidth}
        />
        {total > 0
          ? segments.map((segment) => {
              const value = Math.max(segment.value, 0);
              if (value === 0) {
                return null;
              }
              const length = (value / total) * circumference;
              const dasharray = `${length} ${circumference - length}`;
              const dashoffset = -offset;
              offset += length;
              return (
                <circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  fill="none"
                  r={radius}
                  stroke={segment.color}
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}
                  strokeLinecap="butt"
                  strokeWidth={strokeWidth}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
            })
          : null}
      </svg>
      {centerLabel || centerValue ? (
        <div className="fin-donut-center">
          {centerValue ? (
            <strong className="fin-donut-center-value">{centerValue}</strong>
          ) : null}
          {centerLabel ? (
            <span className="fin-donut-center-label">{centerLabel}</span>
          ) : null}
        </div>
      ) : null}
      <ul className="fin-donut-legend">
        {segments.map((segment) => {
          const value = Math.max(segment.value, 0);
          const ratio = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <li key={segment.label} className="fin-donut-legend-item">
              <span
                aria-hidden="true"
                className="fin-donut-dot"
                style={{ "--dot-color": segment.color } as CSSProperties}
              />
              <div className="fin-donut-legend-copy">
                <span className="fin-donut-legend-label">{segment.label}</span>
                <span className="fin-donut-legend-meta">
                  {formatCurrency(segment.value)} · {ratio}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type LineSeries = {
  label: string;
  points: number[];
  color: string;
  fill?: boolean;
};

type LineChartProps = {
  series: LineSeries[];
  labels?: string[];
  height?: number;
};

export function LineChart({ series, labels, height = 160 }: LineChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const allPoints = series.flatMap((s) => s.points);
  const max = allPoints.length > 0 ? Math.max(...allPoints, 1) : 1;
  const min = 0;
  const length = Math.max(...series.map((s) => s.points.length), 1);
  const width = 600;
  const padding = 8;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;

  const buildPath = (points: number[]): string => {
    if (points.length === 0) {
      return "";
    }
    return points
      .map((point, index) => {
        const x = padding + (index / Math.max(length - 1, 1)) * chartWidth;
        const y =
          padding + chartHeight - ((point - min) / (max - min || 1)) * chartHeight;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  };

  const buildAreaPath = (points: number[]): string => {
    if (points.length === 0) {
      return "";
    }
    const linePath = buildPath(points);
    const lastX = padding + chartWidth;
    return `${linePath} L ${lastX.toFixed(2)} ${(padding + chartHeight).toFixed(2)} L ${padding} ${(padding + chartHeight).toFixed(2)} Z`;
  };

  const firstLabel = labels?.[0];
  const lastLabel = labels?.[labels.length - 1];

  return (
    <div className="fin-line-shell">
      <svg
        aria-hidden="true"
        className="fin-line-svg"
        height={height}
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          {series.map((s, index) => (
            <linearGradient
              key={`${gradientId}-${index}`}
              id={`${gradientId}-${index}`}
              x1="0%"
              x2="0%"
              y1="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {series.map((s, index) =>
          s.fill ? (
            <path
              key={`area-${s.label}`}
              d={buildAreaPath(s.points)}
              fill={`url(#${gradientId}-${index})`}
            />
          ) : null,
        )}
        {series.map((s) => (
          <path
            key={`line-${s.label}`}
            d={buildPath(s.points)}
            fill="none"
            stroke={s.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.25}
          />
        ))}
      </svg>
      <div className="fin-line-legend">
        {series.map((s) => (
          <span key={s.label} className="fin-line-legend-item">
            <span
              aria-hidden="true"
              className="fin-line-legend-dot"
              style={{ "--dot-color": s.color } as CSSProperties}
            />
            {s.label}
          </span>
        ))}
      </div>
      {firstLabel && lastLabel ? (
        <div className="fin-line-axis">
          <span>{firstLabel}</span>
          <span>{lastLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

type FunnelStage = {
  label: string;
  value: number;
  color: string;
  hint?: string;
};

type FunnelProps = {
  stages: FunnelStage[];
};

export function Funnel({ stages }: FunnelProps) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <ol className="fin-funnel">
      {stages.map((stage, index) => {
        const ratio = max > 0 ? stage.value / max : 0;
        const previous = index > 0 ? stages[index - 1].value : null;
        const dropPercent =
          previous !== null && previous > 0
            ? Math.round(((previous - stage.value) / previous) * 100)
            : null;
        return (
          <li key={stage.label} className="fin-funnel-row">
            <div className="fin-funnel-row-head">
              <span className="fin-funnel-label">{stage.label}</span>
              <strong className="fin-funnel-value">
                {formatCurrency(stage.value)}
              </strong>
            </div>
            <div className="fin-funnel-bar-track">
              <span
                className="fin-funnel-bar"
                style={
                  {
                    "--bar-color": stage.color,
                    "--bar-scale": ratio.toFixed(4),
                  } as CSSProperties
                }
              />
            </div>
            <div className="fin-funnel-row-foot">
              {stage.hint ? (
                <span className="fin-funnel-hint">{stage.hint}</span>
              ) : null}
              {dropPercent !== null && dropPercent > 0 ? (
                <span className="fin-funnel-drop">
                  −{formatNumber(dropPercent)}% vs. etapa anterior
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
