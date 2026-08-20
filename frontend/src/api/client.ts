import type {
  AdminStats,
  AuthResponse,
  CaptchaChallenge,
  CaptchaSolution,
  Conversation,
  DocumentItem,
  HealthStatus,
  LoginResponse,
  MeStats,
  Message,
  Paginated,
  ShareLink,
  Space,
  SpaceMember,
  SpaceSnapshot,
  SpaceStats,
  Testimonial,
  TestimonialInput,
  TwoFactorSetup,
  User,
  VectorGraph,
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
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  verify2fa: (pendingToken: string, code: string) =>
    request<AuthResponse>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ pending_token: pendingToken, code }),
    }),
  setup2fa: () => request<TwoFactorSetup>("/auth/2fa/setup", { method: "POST" }),
  enable2fa: (code: string) =>
    request<{ ok: boolean }>("/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  disable2fa: (password: string) =>
    request<{ ok: boolean }>("/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logoutEverywhere: () =>
    request<{ access_token: string }>("/auth/logout-everywhere", { method: "POST" }),
  me: () => request<User>("/auth/me"),
  meStats: () => request<MeStats>("/auth/me/stats"),
  deleteAccount: (password: string) =>
    request<{ ok: boolean }>("/auth/me", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    }),
  exportAccount: () => request<unknown>("/auth/me/export"),
  verifyEmail: (token: string) =>
    request<{ ok: boolean }>(`/auth/verify-email?token=${encodeURIComponent(token)}`),
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
  oauthProviders: () =>
    request<{ google: boolean; apple: boolean; github: boolean; linkedin: boolean }>(
      "/auth/oauth/providers"
    ),
  oauthLoginUrl: (provider: "google" | "apple" | "github" | "linkedin", next: string) =>
    `${BASE}/auth/oauth/${provider}/login?next=${encodeURIComponent(next)}`,

  // --- Billing (Stripe) -------------------------------------------------
  billingCheckout: (plan: "particulier" | "pro") =>
    request<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  billingPortal: () => request<{ url: string }>("/billing/portal", { method: "POST" }),

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
  adminUsers: (limit = 50, offset = 0) =>
    request<Paginated<User>>(`/admin/users?limit=${limit}&offset=${offset}`),
  adminSpaces: (limit = 50, offset = 0) =>
    request<Paginated<Space>>(`/admin/spaces?limit=${limit}&offset=${offset}`),
  adminStats: () => request<AdminStats>("/admin/stats"),
  adminCreateUser: (payload: { email: string; password: string; display_name?: string; role?: "admin" | "user" }) =>
    request<User>("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateUser: (userId: string, patch: { role?: "admin" | "user"; is_active?: boolean }) =>
    request<User>(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminDeleteUser: (userId: string) => request(`/admin/users/${userId}`, { method: "DELETE" }),
  adminDeleteSpace: (spaceId: string) => request(`/admin/spaces/${spaceId}`, { method: "DELETE" }),
  adminListTestimonials: () => request<Testimonial[]>("/admin/testimonials"),
  adminCreateTestimonial: (payload: TestimonialInput) =>
    request<Testimonial>("/admin/testimonials", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateTestimonial: (id: string, patch: Partial<TestimonialInput>) =>
    request<Testimonial>(`/admin/testimonials/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminDeleteTestimonial: (id: string) => request(`/admin/testimonials/${id}`, { method: "DELETE" }),
  listTestimonials: () => request<Testimonial[]>("/testimonials"),
  adminListSnapshots: (spaceId: string) =>
    request<SpaceSnapshot[]>(`/admin/spaces/${spaceId}/snapshots`),
  adminCreateSnapshot: (spaceId: string) =>
    request<SpaceSnapshot>(`/admin/spaces/${spaceId}/snapshots`, { method: "POST" }),
  adminRestoreSnapshot: (spaceId: string, snapshotId: string) =>
    request<{ ok: boolean }>(`/admin/spaces/${spaceId}/snapshots/${snapshotId}/restore`, {
      method: "POST",
    }),

  // --- Spaces -------------------------------------------------------
  listSpaces: () => request<Space[]>("/spaces"),
  createSpace: (name: string, description = "", color = "#6366f1") =>
    request<Space>("/spaces", {
      method: "POST",
      body: JSON.stringify({ name, description, color }),
    }),
  getSpace: (id: string, shareToken?: string) => request<Space>(`/spaces/${id}`, undefined, shareToken),
  getSpaceByShareToken: (token: string) => request<Space>(`/spaces/by-share/${token}`),
  vectorGraph: (id: string, shareToken?: string) =>
    request<VectorGraph>(`/spaces/${id}/vector-graph`, undefined, shareToken),
  spaceStats: (id: string, shareToken?: string) =>
    request<SpaceStats>(`/spaces/${id}/stats`, undefined, shareToken),
  updateSpace: (id: string, patch: Partial<Pick<Space, "name" | "description" | "color">>) =>
    request<Space>(`/spaces/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteSpace: (id: string) => request(`/spaces/${id}`, { method: "DELETE" }),

  // --- Members ------------------------------------------------------
  listMembers: (spaceId: string) => request<SpaceMember[]>(`/spaces/${spaceId}/members`),
  addMember: (spaceId: string, email: string, canUpload: boolean) =>
    request<SpaceMember>(`/spaces/${spaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, can_upload: canUpload }),
    }),
  removeMember: (spaceId: string, memberId: string) =>
    request(`/spaces/${spaceId}/members/${memberId}`, { method: "DELETE" }),

  // --- Share links ----------------------------------------------------
  listShareLinks: (spaceId: string) => request<ShareLink[]>(`/spaces/${spaceId}/share-links`),
  createShareLink: (
    spaceId: string,
    canUpload: boolean,
    label: string,
    expiresInDays?: number
  ) =>
    request<ShareLink>(`/spaces/${spaceId}/share-links`, {
      method: "POST",
      body: JSON.stringify({ can_upload: canUpload, label, expires_in_days: expiresInDays ?? null }),
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
  exportConversation: async (
    conversationId: string,
    format: "pdf" | "docx",
    filenameFallback: string,
    shareToken?: string
  ): Promise<void> => {
    const res = await fetch(`${BASE}/conversations/${conversationId}/export?format=${format}`, {
      headers: authHeaders(shareToken),
    });
    if (res.status === 401) throw new UnauthorizedError(await readDetail(res, "Acces non autorise"));
    if (!res.ok) throw new Error(await readDetail(res, res.statusText));

    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `${filenameFallback}.${format}`;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

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

  submitContact: (data: {
    name: string;
    email: string;
    subject: string;
    phone: string;
    company: string;
    message: string;
    consent: boolean;
    website: string;
    captcha: CaptchaSolution;
  }) => {
    const { captcha, ...rest } = data;
    return request("/contact", {
      method: "POST",
      body: JSON.stringify({ ...rest, ...captcha }),
    });
  },
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

export interface SupportChatEvent {
  type: "token" | "done";
  content?: string;
}

export async function streamSupportChat(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  onEvent: (event: SupportChatEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/support/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
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
