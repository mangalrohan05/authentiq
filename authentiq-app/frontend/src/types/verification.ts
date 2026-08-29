// Shared types for the AI verification result (audit 4.5).
//
// Replaces `aiResult: any` in the verify flow with a real interface. Shapes mirror
// the backend `/scan/{qr}/verify-ai` response: `session_doc` with a nested
// `ai_result` (the `ai_report`). Fields actually read by the UI are typed;
// pass-through payloads rendered by child components are left loose on purpose,
// and an index signature keeps the interface tolerant of extra backend fields.

export type VerificationStatus =
  | "authentic"
  | "likely_authentic"
  | "needs_review"
  | "suspicious"
  | "counterfeit";

/** The AI authenticity report (backend `ai_report`). */
export interface AiReport {
  authenticity_score: number;
  status: VerificationStatus | string;
  risk_level?: string;
  explanation?: string;
  confidence?: number;
  weighted_final_score?: number;
  ai_verdict?: string;
  processed_at?: string;
  // Rendered by dedicated child components; kept loose to avoid prop-type churn.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  per_image_results?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vlm_report?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vlm_result?: any;
  [key: string]: unknown;
}

/** The full verify-ai response (backend `session_doc`). */
export interface VerificationResult {
  session_id?: string;
  qr_id?: string;
  status?: string;
  ai_result: AiReport;
  [key: string]: unknown;
}
