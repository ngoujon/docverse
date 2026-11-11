/** Shapes of the JSON payloads exchanged with the backend API (mirrors
 * backend/app/schemas.py). */

export type SpaceRole = "owner" | "member" | "admin_view";

export interface Space {
  id: string;
  name: string;
  description: string;
  color: string;
  owner_id: string;
  my_role: SpaceRole;
  can_upload: boolean;
  created_at: string;
  document_count: number;
  conversation_count: number;
}

export interface Conversation {
  id: string;
  space_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Source {
  type: "document" | "web";
  label: string;
  doc_id?: string;
  url?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: Source[];
  /** AI consumption behind an assistant answer. */
  usage?: UsageSummary | null;
  created_at: string;
}

/** One step of an answer (or of a document's indexing) and what it cost. */
export interface UsageDetail {
  kind: string;
  label: string;
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  pages: number;
  cost_usd: number;
}

export interface UsageSummary {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  pages: number;
  cost_usd: number;
  /** Billed to the user's own Mistral key rather than the platform's. */
  own_key: boolean;
  estimated?: boolean;
  details: UsageDetail[];
}

export interface UsageTotals {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  pages: number;
  cost_usd: number;
}

export interface UsageReport {
  today: UsageTotals;
  month: UsageTotals;
  month_own_key: UsageTotals;
  month_platform: UsageTotals;
  by_kind: (UsageTotals & { kind: string; label: string })[];
  series: { date: string; tokens: number; cost_usd: number }[];
}

export interface AISettings {
  has_own_key: boolean;
  key_unreadable: boolean;
  key_hint?: string | null;
  daily_messages?: number | null;
  monthly_budget_usd?: number | null;
  month_cost_own_key_usd: number;
  messages_today: number;
  free_messages_per_day: number;
  free_scanned_pages_per_day: number;
}

export interface AdminAICosts {
  today: UsageTotals;
  last_30d: UsageTotals;
  month: UsageTotals;
  own_key_last_30d: UsageTotals;
  own_key_users: number;
  cost_per_question_usd: number;
  by_kind: {
    kind: string;
    label: string;
    model: string;
    calls: number;
    tokens: number;
    pages: number;
    cost_usd: number;
  }[];
  top_users: { email: string; cost_usd: number; calls: number }[];
  series: { date: string; cost_usd: number }[];
}

export interface UsageExplorerPoint {
  t: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  pages: number;
  cost_usd: number;
  questions: number;
  users: number;
  cost_by_model: Record<string, number>;
}

export interface ModelPrice {
  family: string;
  input_usd_per_m: number | null;
  output_usd_per_m: number | null;
  page_usd: number | null;
}

export interface AdminUsageExplorer {
  granularity: "hour" | "day" | "week";
  series: UsageExplorerPoint[];
  totals: {
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    pages: number;
    cost_usd: number;
    questions: number;
    users: number;
    estimated_cost_usd: number;
  };
  peaks: UsageExplorerPoint[];
  heatmap: { calls: number; cost_usd: number }[][];
  by_model: {
    family: string;
    models: string[];
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    cached_tokens: number;
    pages: number;
    cost_usd: number;
    share_pct: number;
    price: ModelPrice | null;
  }[];
  by_kind: { kind: string; label: string; calls: number; cost_usd: number }[];
  prices: ModelPrice[];
  options: { families: string[]; kinds: string[]; users: { id: string; email: string }[] };
}

export interface UsageExplorerFilters {
  days: number;
  granularity: "hour" | "day" | "week";
  key: "platform" | "own" | "all";
  kind: string;
  family: string;
  userId: string;
}

export type DocumentStatus = "pending" | "processing" | "ready" | "error";

export interface DocumentItem {
  id: string;
  space_id: string;
  name: string;
  doc_type: "pdf" | "image" | "url" | "docx" | "txt" | "md";
  source_url?: string | null;
  status: DocumentStatus;
  error_message?: string | null;
  chunk_count: number;
  preview: string;
  size_bytes: number;
  usage?: UsageSummary | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "user";
  is_active: boolean;
  email_verified: boolean;
  totp_enabled: boolean;
  created_at: string;
}

export type OAuthProvider = "google" | "apple" | "github" | "linkedin";

export interface AuthResponse {
  access_token: string;
  user: User;
}

export interface LoginResponse {
  access_token: string | null;
  user: User | null;
  requires_2fa: boolean;
  pending_token: string | null;
}

export interface TwoFactorSetup {
  secret: string;
  provisioning_uri: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SpaceSnapshot {
  id: string;
  space_id: string;
  created_at: string;
  size_bytes: number;
  conversation_count: number;
  document_count: number;
}

export interface SpaceMember {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  can_upload: boolean;
  created_at: string;
}

export interface ShareLink {
  id: string;
  space_id: string;
  can_upload: boolean;
  label: string;
  created_at: string;
  expires_at?: string | null;
  revoked: boolean;
}

export interface SpaceStats {
  space_id: string;
  document_count: number;
  conversation_count: number;
  message_count: number;
  storage_bytes: number;
  storage_limit_bytes?: number | null;
  member_count: number;
  member_limit?: number | null;
  active_share_links: number;
  last_activity_at?: string | null;
}

export interface MeStats {
  owned_spaces: number;
  space_limit?: number | null;
  member_spaces: number;
  document_count: number;
  conversation_count: number;
  message_count: number;
  storage_bytes: number;
  storage_limit_bytes?: number | null;
  messages_today?: number;
  messages_per_day_limit?: number | null;
  scanned_pages_today?: number;
  scanned_pages_per_day_limit?: number | null;
  /** The account uses its own Mistral key: platform AI quotas lifted. */
  own_key?: boolean;
}

export interface AdminStats {
  users: number;
  spaces: number;
  documents: number;
  conversations: number;
  messages: number;
  storage_bytes: number;
  newsletter_subscribers: number;
  new_users_7d: number;
  new_spaces_7d: number;
  verified_users: number;
  totp_users: number;
  active_users_7d: number;
  questions_7d: number;
  new_documents_7d: number;
  documents_in_error: number;
  contact_messages_7d: number;
  /** Last 30 UTC days, oldest first. */
  daily: { date: string; users: number; questions: number; documents: number }[];
}

export interface AdminHealth {
  status: string;
  llm_provider: string;
  llm_reachable: boolean;
  llm_error?: string | null;
  models_available: string[];
  chat_model: string;
  vision_model: string;
  embed_model: string;
  hosting: string;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  confirmed: boolean;
  created_at: string;
  confirmed_at: string | null;
}

export interface CaptchaChallenge {
  salt: string;
  difficulty: number;
}

export interface CaptchaSolution {
  captcha_salt: string;
  captcha_nonce: number;
}

export interface VectorGraphNode {
  id: string;
  doc_id: string;
  doc_name: string;
  text_preview: string;
  x: number;
  y: number;
}

export interface VectorGraphEdge {
  source: string;
  target: string;
}

export interface VectorGraph {
  nodes: VectorGraphNode[];
  edges: VectorGraphEdge[];
  truncated: boolean;
}

export interface Testimonial {
  id: string;
  author_name: string;
  author_role: string;
  author_company: string;
  content: string;
  rating: number;
  published: boolean;
  display_order: number;
  created_at: string;
}

export interface TestimonialInput {
  author_name: string;
  author_role?: string;
  author_company?: string;
  content: string;
  rating?: number;
  published?: boolean;
  display_order?: number;
}
