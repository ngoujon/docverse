import type {
  Space,
  Conversation,
  Message,
  DocumentItem,
  HealthStatus,
} from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers:
      options?.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<HealthStatus>("/health"),

  listSpaces: () => request<Space[]>("/spaces"),
  createSpace: (name: string, description = "", color = "#6366f1") =>
    request<Space>("/spaces", {
      method: "POST",
      body: JSON.stringify({ name, description, color }),
    }),
  updateSpace: (id: string, patch: Partial<Pick<Space, "name" | "description" | "color">>) =>
    request<Space>(`/spaces/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteSpace: (id: string) => request(`/spaces/${id}`, { method: "DELETE" }),

  listConversations: (spaceId: string) =>
    request<Conversation[]>(`/spaces/${spaceId}/conversations`),
  createConversation: (spaceId: string, title = "Nouvelle conversation") =>
    request<Conversation>(`/spaces/${spaceId}/conversations`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateConversation: (
    id: string,
    patch: Partial<Pick<Conversation, "title" | "web_search_enabled">>
  ) => request<Conversation>(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteConversation: (id: string) => request(`/conversations/${id}`, { method: "DELETE" }),
  listMessages: (conversationId: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`),

  listDocuments: (spaceId: string) =>
    request<DocumentItem[]>(`/spaces/${spaceId}/documents`),
  uploadDocument: (spaceId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentItem>(`/spaces/${spaceId}/documents/upload`, {
      method: "POST",
      body: form,
    });
  },
  ingestUrl: (spaceId: string, url: string) =>
    request<DocumentItem>(`/spaces/${spaceId}/documents/url`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  deleteDocument: (id: string) => request(`/documents/${id}`, { method: "DELETE" }),
};

export interface StreamEvent {
  type: "user_message_id" | "token" | "done" | "error";
  content?: string;
  id?: string;
  message_id?: string;
  sources?: Message["sources"];
}

export async function streamChat(
  conversationId: string,
  message: string,
  webSearch: boolean,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, web_search: webSearch }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Erreur serveur (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        onEvent(JSON.parse(jsonStr));
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}
