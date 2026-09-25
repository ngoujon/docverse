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
  created_at: string;
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
  created_at: string;
}

// What /api/health tells an anonymous caller: that the process is up, and
// nothing else. Naming the inference provider and the exact models to the
// public internet was free reconnaissance for an attacker.
export interface HealthStatus {
  status: string;
}

// The full picture, from /api/admin/health - admin session required.
export interface AdminHealthStatus extends HealthStatus {
  llm_provider: "mistral";
  llm_reachable: boolean;
  /** Renseigne uniquement quand llm_reachable vaut false. */
  llm_error?: string | null;
  models_available: string[];
  chat_model: string;
  vision_model: string;
  embed_model: string;
  /** Ex. "OVHcloud (France)" - affiche tel quel dans l'espace admin. */
  hosting: string;
}

export type UserPlan = "decouverte" | "particulier" | "pro" | "entreprise";

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "user";
  is_active: boolean;
  email_verified: boolean;
  totp_enabled: boolean;
  plan: UserPlan;
  created_at: string;
}

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

export interface Invoice {
  id: string;
  number: string | null;
  customer_email: string | null;
  customer_name: string | null;
  is_business: boolean;
  tax_ids: string[];
  amount_paid: number;
  currency: string;
  status: string | null;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export interface BillingProfile {
  is_business: boolean;
  company_name: string;
  siret: string;
  vat_number: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country_code: string;
}

export interface LocalInvoice {
  id: string;
  number: string;
  issue_date: string;
  currency: string;
  amount_ht_cents: number;
  amount_vat_cents: number;
  amount_ttc_cents: number;
  description: string;
  is_business: boolean;
}
