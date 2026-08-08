import type {
  Space,
  Conversation,
  Message,
  DocumentItem,
  HealthStatus,
} from "../types";
import { getSpaceToken } from "./spaceTokens";

const BASE = "/api";

export class UnauthorizedError extends Error {
  constructor(message = "Mot de passe requis") {
    super(message);
  }
}

async function readDetail(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || fallback;
  } catch {
    return fallback;
  }
}

function authHeaders(spaceId?: string): Record<string, string> {
  if (!spaceId) return {};
  const token = getSpaceToken(spaceId);
  return token ? { "X-Space-Token": token } : {};
}

async function request<T>(
  path: string,
  options?: RequestInit,
  spaceId?: string
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders(spaceId),
      ...(options?.headers || {}),
    },
  });
  if (res.status === 401) {
    throw new UnauthorizedError(await readDetail(res, "Mot de passe requis"));
  }
  if (!res.ok) {
    throw new Error(await readDetail(res, res.statusText));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<HealthStatus>("/health"),

  listSpaces: () => request<Space[]>("/spaces"),
  createSpace: (name: string, description = "", color = "#6366f1", password = "") =>
    request<Space>("/spaces", {
      method: "POST",
      body: JSON.stringify({ name, description, color, password: password || null }),
    }),
  getSpace: (id: string) => request<Space>(`/spaces/${id}`),
  unlockSpace: (id: string, password: string) =>
    request<{ access_token: string }>(`/spaces/${id}/unlock`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  updateSpace: (
    id: string,
    patch: Partial<Pick<Space, "name" | "description" | "color">> & { password?: string }
  ) => request<Space>(`/spaces/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, id),
  deleteSpace: (id: string) => request(`/spaces/${id}`, { method: "DELETE" }, id),

  listConversations: (spaceId: string) =>
    request<Conversation[]>(`/spaces/${spaceId}/conversations`, undefined, spaceId),
  createConversation: (spaceId: string, title = "Nouvelle conversation") =>
    request<Conversation>(
      `/spaces/${spaceId}/conversations`,
      { method: "POST", body: JSON.stringify({ title }) },
      spaceId
    ),
  updateConversation: (
    id: string,
    spaceId: string,
    patch: Partial<Pick<Conversation, "title" | "web_search_enabled">>
  ) =>
    request<Conversation>(
      `/conversations/${id}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      spaceId
    ),
  deleteConversation: (id: string, spaceId: string) =>
    request(`/conversations/${id}`, { method: "DELETE" }, spaceId),
  listMessages: (conversationId: string, spaceId: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`, undefined, spaceId),

  listDocuments: (spaceId: string) =>
    request<DocumentItem[]>(`/spaces/${spaceId}/documents`, undefined, spaceId),
  uploadDocument: (spaceId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentItem>(
      `/spaces/${spaceId}/documents/upload`,
      { method: "POST", body: form },
      spaceId
    );
  },
  ingestUrl: (spaceId: string, url: string) =>
    request<DocumentItem>(
      `/spaces/${spaceId}/documents/url`,
      { method: "POST", body: JSON.stringify({ url }) },
      spaceId
    ),
  deleteDocument: (id: string, spaceId: string) =>
    request(`/documents/${id}`, { method: "DELETE" }, spaceId),

  submitContact: (name: string, email: string, message: string, website = "") =>
    request("/contact", {
      method: "POST",
      body: JSON.stringify({ name, email, message, website }),
    }),
};

export interface StreamEvent {
  type: "user_message_id" | "queued" | "token" | "done" | "error";
  content?: string;
  id?: string;
  message_id?: string;
  position?: number;
  sources?: Message["sources"];
}

export async function streamChat(
  conversationId: string,
  spaceId: string,
  message: string,
  webSearch: boolean,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(spaceId),
    },
    body: JSON.stringify({ message, web_search: webSearch }),
    signal,
  });
  if (res.status === 401) throw new UnauthorizedError();
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
