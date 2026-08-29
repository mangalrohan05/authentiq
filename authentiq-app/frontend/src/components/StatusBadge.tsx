// Reusable status pill (audit 4.5) — replaces the badge markup duplicated across
// the admin dashboard and verify flow (bg-*/text-*/border-* per status).
//
// Usage:
//   <StatusBadge status={vendor.status} />           // tone inferred from status
//   <StatusBadge tone="danger" label="Counterfeit" /> // explicit tone/label
import React from "react";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-gray-100 text-gray-500 border-gray-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
};

// Common domain statuses → tone.
const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  authentic: "success",
  likely_authentic: "success",
  verified: "success",
  suspended: "warning",
  needs_review: "warning",
  pending: "info",
  expired: "danger",
  suspicious: "danger",
  counterfeit: "danger",
  revoked: "danger",
  flagged: "danger",
};

export function toneForStatus(status?: string): BadgeTone {
  if (!status) return "neutral";
  return STATUS_TONE[status.toLowerCase()] ?? "neutral";
}

interface StatusBadgeProps {
  /** Domain status; its tone is inferred unless `tone` is given. */
  status?: string;
  /** Explicit tone override. */
  tone?: BadgeTone;
  /** Display text; defaults to `status`. */
  label?: string;
  className?: string;
}

export default function StatusBadge({ status, tone, label, className = "" }: StatusBadgeProps) {
  const resolvedTone = tone ?? toneForStatus(status);
  const text = label ?? status ?? "";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${TONE_CLASSES[resolvedTone]} ${className}`}
    >
      {text}
    </span>
  );
}
