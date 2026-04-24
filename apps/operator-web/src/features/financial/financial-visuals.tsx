"use client";

import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";

import { formatCurrency, formatNumber } from "@/features/shared/formatters";

import { useCountUp } from "./hooks/use-count-up";

type SparklineProps = {
  points: number[];
  stroke?: string;
  fill?: string;
  title?: string;
};

type RadialRingProps = {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label: string;
  detail: string;
};

type StackedBarSegment = {
  label: string;
  value: number;
  color: string;
};

type StackedBarProps = {
  segments: StackedBarSegment[];
};

type DualBarProps = {
  leftValue: number;
  rightValue: number;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;
  rightColor?: string;
};

type GaugeProps = {
  value: number;
  max: number;
  color?: string;
  title: string;
  detail: string;
};

type DeltaArrowProps = {
  delta: number | null;
};

export function Sparkline({
  points,
  stroke = "var(--gold)",
  fill = "var(--gold)",
  title = "Série temporal",
}: SparklineProps) {
  const gradientId = useId().replace(/:/g, "");
  const safePoints = points.length > 0 ? points : [0];
  const linePath = buildLinePath(safePoints, 100, 44, 4);
  const areaPath = buildAreaPath(safePoints, 100, 44, 4);
  return (
    <svg
      aria-label={title}
      className="fin-sparkline"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 44"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor={fill} stopOpacity="0.45" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="fin-sparkline-area" d={areaPath} fill={`url(#${gradientId})`} />
      <path
        className="fin-sparkline-line"
        d={linePath}
        fill="none"
        pathLength={100}
        stroke={stroke}
        strokeDasharray={100}
        strokeDashoffset={100}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.25}
      />
    </svg>
  );
}

export function RadialRing({
  value,
  max = 100,
  size = 126,
  strokeWidth = 10,
  color = "var(--gold)",
  label,
  detail,
}: RadialRingProps) {
  const radius = (size - strokeWidth) / 2;
  const progress = clamp(max <= 0 ? 0 : value / max, 0, 1);
  const animated = useCountUp(progress * 100, { durationMs: 1000 });
  const dashOffset = 100 * (1 - progress);
  return (
    <div className="fin-ring-shell">
      <svg
        aria-hidden="true"
        className="fin-ring"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          className="fin-ring-track"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="fin-ring-progress"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          pathLength={100}
          r={radius}
          stroke={color}
          strokeDasharray={100}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          style={
            {
              "--ring-progress": dashOffset,
              "--ring-start": 100,
            } as CSSProperties
          }
        />
      </svg>
      <div className="fin-ring-copy">
        <span className="fin-ring-value">{formatNumber(animated)}%</span>
        <span className="fin-ring-label">{label}</span>
        <span className="fin-ring-detail">{detail}</span>
      </div>
    </div>
  );
}

export function StackedBar({ segments }: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div className="fin-stacked">
      <div aria-hidden="true" className="fin-stacked-track">
        {segments.map((segment) => {
          const ratio = total > 0 ? segment.value / total : 0;
          return (
            <span
              key={segment.label}
              className="fin-stacked-segment"
              style={
                {
                  "--segment-color": segment.color,
                  "--segment-scale": ratio.toFixed(4),
                } as CSSProperties
              }
            />
          );
        })}
      </div>
      <div className="fin-stacked-legend">
        {segments.map((segment) => {
          const ratio = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <div key={segment.label} className="fin-stacked-item">
              <span
                aria-hidden="true"
                className="fin-stacked-dot"
                style={{ "--segment-color": segment.color } as CSSProperties}
              />
              <div className="fin-stacked-copy">
                <span className="fin-stacked-label">{segment.label}</span>
                <span className="fin-stacked-meta">
                  {formatCurrency(segment.value)} · {ratio}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DualBar({
  leftValue,
  rightValue,
  leftLabel,
  rightLabel,
  leftColor = "var(--gold)",
  rightColor = "var(--green)",
}: DualBarProps) {
  const maxValue = Math.max(leftValue, rightValue, 1);
  const items = [
    { label: leftLabel, value: leftValue, color: leftColor },
    { label: rightLabel, value: rightValue, color: rightColor },
  ];
  return (
    <div className="fin-dual">
      {items.map((item) => (
        <div key={item.label} className="fin-dual-item">
          <div className="fin-dual-chart">
            <span
              className="fin-dual-bar"
              style={
                {
                  "--bar-scale": (item.value / maxValue).toFixed(4),
                  "--bar-color": item.color,
                } as CSSProperties
              }
            />
          </div>
          <span className="fin-dual-value">{formatCurrency(item.value)}</span>
          <span className="fin-dual-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Gauge({
  value,
  max,
  color = "var(--gold)",
  title,
  detail,
}: GaugeProps) {
  const progress = clamp(max <= 0 ? 0 : value / max, 0, 1);
  const animated = useCountUp(value, { durationMs: 900, decimals: value % 1 === 0 ? 0 : 2 });
  const theta = Math.PI * (1 - progress);
  const tipX = 50 + 40 * Math.cos(theta);
  const tipY = 50 - 40 * Math.sin(theta);
  return (
    <div className="fin-gauge-shell">
      <svg aria-hidden="true" className="fin-gauge" viewBox="0 0 100 62">
        <path
          className="fin-gauge-track"
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          pathLength={100}
          strokeWidth={8}
        />
        <path
          className="fin-gauge-progress"
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          pathLength={100}
          stroke={color}
          strokeDasharray={100}
          strokeDashoffset={100 * (1 - progress)}
          strokeLinecap="round"
          strokeWidth={8}
        />
        <circle
          className="fin-gauge-tip"
          cx={tipX}
          cy={tipY}
          fill={color}
          r={3.5}
        />
      </svg>
      <div className="fin-gauge-copy">
        <span className="fin-gauge-label">{title}</span>
        <span className="fin-gauge-value">{formatCurrency(animated)}</span>
        <span className="fin-gauge-detail">{detail}</span>
      </div>
    </div>
  );
}

export function DeltaArrow({ delta }: DeltaArrowProps) {
  const direction = delta === null ? "flat" : delta >= 0 ? "up" : "down";
  return (
    <span className={`fin-delta fin-delta-${direction}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M10 3 L17 13 H3 Z" fill="currentColor" />
      </svg>
      <span>{delta === null ? "Sem base" : `${delta >= 0 ? "+" : ""}${formatNumber(delta)}%`}</span>
    </span>
  );
}

export function VisualStat({
  eyebrow,
  value,
  description,
  accent,
}: {
  eyebrow: string;
  value: string;
  description: string;
  accent?: ReactNode;
}) {
  return (
    <div className="fin-visual-stat">
      <span className="fin-eyebrow">{eyebrow}</span>
      <strong className="fin-visual-value">{value}</strong>
      <p className="fin-visual-description">{description}</p>
      {accent ? <div className="fin-visual-accent">{accent}</div> : null}
    </div>
  );
}

function buildLinePath(points: number[], width: number, height: number, padding: number): string {
  const { min, max } = minMax(points);
  const safeRange = max - min || 1;
  return points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point - min) / safeRange) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(points: number[], width: number, height: number, padding: number): string {
  const linePath = buildLinePath(points, width, height, padding);
  const lastX = padding + (width - padding * 2);
  return `${linePath} L ${lastX.toFixed(2)} ${(height - padding).toFixed(2)} L ${padding} ${(height - padding).toFixed(2)} Z`;
}

function minMax(values: number[]): { min: number; max: number } {
  let min = values[0] ?? 0;
  let max = values[0] ?? 0;
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  return { min, max };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
