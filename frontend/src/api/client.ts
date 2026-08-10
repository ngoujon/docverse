import type {
  AdminStats,
  AuthResponse,
  CaptchaChallenge,
  CaptchaSolution,
  Conversation,
  DocumentItem,
  HealthStatus,
  MeStats,
  Message,
  ShareLink,
  Space,
  SpaceMember,
  SpaceStats,
  User,
} from "../types";
import { getUserToken } from "./userToken";

const BASE = "/api";

export class UnauthorizedError extends Error {
  constructor(message = "Acces non autorise") {
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

function authHeaders(shareToken?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const userToken = getUserToken();
  if (userToken) headers["Authorization"] = `Bearer ${userToken}`;
  if (shareToken) headers["X-Share-Token"] = shareToken;
  return headers;
}

async function request<T>(
  path: string,
  options?: RequestInit,
  shareToken?: string
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders(shareToken),
      ...(options?.headers || {}),
    },
  });
  if (res.status === 401) {
    throw new UnauthorizedError(await readDetail(res, "Acces non autorise"));
  }
  if (!res.ok) {
    throw new Error(await readDetail(res, res.statusText));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<HealthStatus>("/health"),

  // --- Auth ---------------------------------------------------------
  register: (
    email: string,
    password: string,
    displayName: string,
    captcha: CaptchaSolution
  ) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName, ...captcha }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/auth/me"),
  meStats: () => request<MeStats>("/auth/me/stats"),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  // --- Captcha --------------------------------------------------------
  captchaChallenge: () => request<CaptchaChallenge>("/captcha/challenge"),

  // --- Newsletter -------------------------------------------------------
  newsletterSubscribe: (email: string, captcha: CaptchaSolution) =>
    request<{ ok: boolean }>("/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ email, ...captcha }),
    }),
  newsletterConfirm: (token: string) =>
    request<{ ok: boolean }>(`/newsletter/confirm?token=${encodeURIComponent(token)}`),
  newsletterUnsubscribe: (token: string) =>
    request<{ ok: boolean }>(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`),

  // --- Admin ------------------------------------------------------------
  adminUsers: () => request<User[]>("/admin/users"),
  adminSpaces: () => request<Space[]>("/admin/spaces"),
  adminStats: () => request<AdminStats>("/admin/stats"),

  // --- Spaces -------------------------------------------------------
  listSpaces: () => request<Space[]>("/spaces"),
  createSpace: (name: string, description = "", color = "#6366f1") =>
    request<Space>("/spaces", {
      method: "POST",
      body: JSON.stringify({ name, description, color }),
    }),
  getSpace: (id: string, shareToken?: string) => request<Space>(`/spaces/${id}`, undefined, shareToken),
  getSpaceByShareToken: (token: string) => request<Space>(`/spaces/by-share/${token}`),
  spaceStats: (id: string, shareToken?: string) =>
    request<SpaceStats>(`/spaces/${id}/stats`, undefined, shareToken),
  updateSpace: (id: string, patch: Partial<Pick<Space, "name" | "description" | "color">>) =>
    request<Space>(`/spaces/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteSpace: (id: string) => request(`/spaces/${id}`, { method: "DELETE" }),

  // --- Members ------------------------------------------------------
  listMembers: (spaceId: string) => request<SpaceMember[]>(`/spaces/${spaceId}/members`),
  addMember: (spaceId: string, email: string, role: "editor" | "viewer") =>
    request<SpaceMember>(`/spaces/${spaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  removeMember: (spaceId: string, memberId: string) =>
    request(`/spaces/${spaceId}/members/${memberId}`, { method: "DELETE" }),

  // --- Share links ----------------------------------------------------
  listShareLinks: (spaceId: string) => request<ShareLink[]>(`/spaces/${spaceId}/share-links`),
  createShareLink: (
    spaceId: string,
    role: "editor" | "viewer",
    label: string,
    expiresInDays?: number
  ) =>
    request<ShareLink>(`/spaces/${spaceId}/share-links`, {
      method: "POST",
      body: JSON.stringify({ role, label, expires_in_days: expiresInDays ?? null }),
    }),
  revokeShareLink: (spaceId: string, linkId: string) =>
    request(`/spaces/${spaceId}/share-links/${linkId}`, { method: "DELETE" }),

  // --- Conversations --------------------------------------------------
  listConversations: (spaceId: string, shareToken?: string) =>
    request<Conversation[]>(`/spaces/${spaceId}/conversations`, undefined, shareToken),
  createConversation: (spaceId: string, shareToken?: string, title = "Nouvelle conversation") =>
    request<Conversation>(
      `/spaces/${spaceId}/conversations`,
      { method: "POST", body: JSON.stringify({ title }) },
      shareToken
    ),
  updateConversation: (
    id: string,
    shareToken: string | undefined,
    patch: Partial<Pick<Conversation, "title">>
  ) =>
    request<Conversation>(
      `/conversations/${id}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      shareToken
    ),
  deleteConversation: (id: string, shareToken?: string) =>
    request(`/conversations/${id}`, { method: "DELETE" }, shareToken),
  listMessages: (conversationId: string, shareToken?: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`, undefined, shareToken),

  // --- Documents ------------------------------------------------------
  listDocuments: (spaceId: string, shareToken?: string) =>
    request<DocumentItem[]>(`/spaces/${spaceId}/documents`, undefined, shareToken),
  uploadDocument: (spaceId: string, file: File, shareToken?: string) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentItem>(
      `/spaces/${spaceId}/documents/upload`,
      { method: "POST", body: form },
      shareToken
    );
  },
  ingestUrl: (spaceId: string, url: string, shareToken?: string) =>
    request<DocumentItem>(
      `/spaces/${spaceId}/documents/url`,
      { method: "POST", body: JSON.stringify({ url }) },
      shareToken
    ),
  deleteDocument: (id: string, shareToken?: string) =>
    request(`/documents/${id}`, { method: "DELETE" }, shareToken),

  submitContact: (
    name: string,
    email: string,
    message: string,
    website: string,
    captcha: CaptchaSolution
  ) =>
    request("/contact", {
      method: "POST",
      body: JSON.stringify({ name, email, message, website, ...captcha }),
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
  message: string,
  onEvent: (event: StreamEvent) => void,
  shareToken?: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(shareToken),
    },
    body: JSON.stringify({ message }),
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
