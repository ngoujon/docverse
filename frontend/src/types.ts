export interface Space {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  document_count: number;
  conversation_count: number;
}

export interface Conversation {
  id: string;
  space_id: string;
  title: string;
  web_search_enabled: boolean;
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
  chat_model_ready: boolean;
  vision_model_ready: boolean;
  embed_model_ready: boolean;
}
