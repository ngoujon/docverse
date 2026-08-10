export type SpaceRole = "owner" | "editor" | "viewer";

export interface Space {
  id: string;
  name: string;
  description: string;
  color: string;
  owner_id: string;
  my_role: SpaceRole;
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

export interface HealthStatus {
  status: string;
  ollama_reachable: boolean;
  models_available: string[];
  chat_provider: "ollama_cloud" | "ollama_local";
  vision_provider: "ollama_cloud" | "ollama_local";
  chat_model_ready: boolean;
  vision_model_ready: boolean;
  embed_model_ready: boolean;
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
  role: "editor" | "viewer";
  created_at: string;
}

export interface ShareLink {
  id: string;
  space_id: string;
  role: "editor" | "viewer";
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
