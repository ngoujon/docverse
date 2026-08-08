import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";
import { api, streamChat, UnauthorizedError } from "../api/client";
import { getSpaceToken, setSpaceToken, clearSpaceToken } from "../api/spaceTokens";
import type { Conversation, DocumentItem, HealthStatus, Message, Space } from "../types";
import SpaceRail from "../components/SpaceRail";
import ConversationSidebar from "../components/ConversationSidebar";
import ChatWindow from "../components/ChatWindow";
import DocumentPanel from "../components/DocumentPanel";
import SpaceModal, { type SpaceFormData } from "../components/SpaceModal";
import ConfirmDialog from "../components/ConfirmDialog";
import PasswordPrompt from "../components/PasswordPrompt";

export default function WorkspaceApp() {
  const { t } = useTranslation();
  const { spaceId: routeSpaceId } = useParams();
  const navigate = useNavigate();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [queuedPosition, setQueuedPosition] = useState<number | null>(null);
  const [docPanelOpen, setDocPanelOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [spaceModal, setSpaceModal] = useState<{ open: boolean; editing: Space | null }>({
    open: false,
    editing: null,
  });
  const [deleteSpaceId, setDeleteSpaceId] = useState<string | null>(null);
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const didInitFromRoute = useRef(false);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  usePageTitle(
    activeConversation
      ? `${activeConversation.title} - ${activeSpace?.name ?? ""} - Open RAG`
      : activeSpace
      ? `${activeSpace.name} - Open RAG`
      : "Open RAG"
  );

  const selectSpace = (id: string) => {
    const space = spaces.find((s) => s.id === id);
    if (!space) return;
    setActiveSpaceId(id);
    setMobileNavOpen(false);
    setUnlockError(null);
    if (space.has_password && !getSpaceToken(id)) {
      setLocked(true);
    } else {
      setLocked(false);
    }
  };

  const handleUnauthorized = (spaceId: string) => {
    clearSpaceToken(spaceId);
    setLocked(true);
  };

  // Initial load
  useEffect(() => {
    api.listSpaces().then((list) => {
      setSpaces(list);
      if (didInitFromRoute.current) return;
      didInitFromRoute.current = true;
      const target = routeSpaceId && list.some((s) => s.id === routeSpaceId)
        ? routeSpaceId
        : list[0]?.id;
      if (target) {
        const space = list.find((s) => s.id === target)!;
        setActiveSpaceId(target);
        setLocked(!!space.has_password && !getSpaceToken(target));
      }
    });
    const checkHealth = () => api.health().then(setHealth).catch(() => setHealth(null));
    checkHealth();
    const t = setInterval(checkHealth, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load conversations + documents when active space changes (and unlocked)
  useEffect(() => {
    if (!activeSpaceId || locked) {
      setConversations([]);
      setDocuments([]);
      setActiveConversationId(null);
      return;
    }
    api
      .listConversations(activeSpaceId)
      .then((list) => {
        setConversations(list);
        setActiveConversationId(list.length ? list[0].id : null);
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) handleUnauthorized(activeSpaceId);
      });
    api
      .listDocuments(activeSpaceId)
      .then(setDocuments)
      .catch((err) => {
        if (err instanceof UnauthorizedError) handleUnauthorized(activeSpaceId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpaceId, locked]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId || !activeSpaceId) {
      setMessages([]);
      return;
    }
    api.listMessages(activeConversationId, activeSpaceId).then(setMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // Poll document processing status
  useEffect(() => {
    if (!activeSpaceId || locked) return;
    const hasPending = documents.some(
      (d) => d.status === "pending" || d.status === "processing"
    );
    if (!hasPending) return;
    const t = setInterval(() => {
      api.listDocuments(activeSpaceId).then(setDocuments).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [activeSpaceId, documents, locked]);

  const refreshConversations = (spaceId: string) => {
    api.listConversations(spaceId).then(setConversations).catch(() => {});
  };

  // ---- Unlock ----
  const handleUnlockSubmit = async (password: string) => {
    if (!activeSpaceId) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const { access_token } = await api.unlockSpace(activeSpaceId, password);
      setSpaceToken(activeSpaceId, access_token);
      setLocked(false);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setUnlocking(false);
    }
  };

  // ---- Spaces ----
  const handleCreateSpace = async (data: SpaceFormData) => {
    const space = await api.createSpace(data.name, data.description, data.color, data.password);
    if (space.access_token) setSpaceToken(space.id, space.access_token);
    setSpaces((prev) => [space, ...prev]);
    setActiveSpaceId(space.id);
    setLocked(false);
    setSpaceModal({ open: false, editing: null });
    navigate(`/app/${space.id}`, { replace: true });
  };

  const handleUpdateSpace = async (data: SpaceFormData) => {
    if (!spaceModal.editing) return;
    const updated = await api.updateSpace(spaceModal.editing.id, data);
    setSpaces((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setSpaceModal({ open: false, editing: null });
  };

  const handleDeleteSpace = async () => {
    if (!deleteSpaceId) return;
    await api.deleteSpace(deleteSpaceId);
    clearSpaceToken(deleteSpaceId);
    const remaining = spaces.filter((s) => s.id !== deleteSpaceId);
    setSpaces(remaining);
    if (activeSpaceId === deleteSpaceId) {
      const next = remaining[0]?.id ?? null;
      setActiveSpaceId(next);
      setLocked(next ? !!remaining[0].has_password && !getSpaceToken(next) : false);
    }
    setDeleteSpaceId(null);
  };

  // ---- Conversations ----
  const handleCreateConversation = async () => {
    if (!activeSpaceId) return;
    const conv = await api.createConversation(activeSpaceId);
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
  };

  const handleDeleteConversation = async () => {
    if (!deleteConvId || !activeSpaceId) return;
    await api.deleteConversation(deleteConvId, activeSpaceId);
    const remaining = conversations.filter((c) => c.id !== deleteConvId);
    setConversations(remaining);
    if (activeConversationId === deleteConvId) {
      setActiveConversationId(remaining.length ? remaining[0].id : null);
    }
    setDeleteConvId(null);
  };

  const handleToggleWebSearch = async (v: boolean) => {
    if (!activeConversation || !activeSpaceId) return;
    const updated = await api.updateConversation(activeConversation.id, activeSpaceId, {
      web_search_enabled: v,
    });
    setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  // ---- Chat ----
  const handleSend = async (text: string) => {
    if (!activeConversationId || !activeSpaceId) return;

    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const now = new Date().toISOString();

    setMessages((prev) => [
      ...prev,
      { id: tempUserId, conversation_id: activeConversationId, role: "user", content: text, sources: [], created_at: now },
      { id: tempAssistantId, conversation_id: activeConversationId, role: "assistant", content: "", sources: [], created_at: now },
    ]);

    setStreaming(true);
    setQueuedPosition(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const webSearch = activeConversation?.web_search_enabled ?? false;

    try {
      await streamChat(
        activeConversationId,
        activeSpaceId,
        text,
        webSearch,
        (event) => {
          if (event.type === "user_message_id" && event.id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === tempUserId ? { ...m, id: event.id! } : m))
            );
          } else if (event.type === "queued") {
            setQueuedPosition(event.position ?? 1);
          } else if (event.type === "token" && event.content) {
            setQueuedPosition(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, content: m.content + event.content } : m
              )
            );
          } else if (event.type === "done") {
            setQueuedPosition(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? { ...m, id: event.message_id || m.id, sources: event.sources || [] }
                  : m
              )
            );
            if (activeSpaceId) refreshConversations(activeSpaceId);
          }
        },
        controller.signal
      );
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        handleUnauthorized(activeSpaceId);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? { ...m, content: m.content || `*${t("app.chat.connectionError")}*` }
            : m
        )
      );
    } finally {
      setStreaming(false);
      setQueuedPosition(null);
    }
  };

  // ---- Documents ----
  const handleUpload = async (files: File[]) => {
    if (!activeSpaceId) return;
    for (const file of files) {
      try {
        const doc = await api.uploadDocument(activeSpaceId, file);
        setDocuments((prev) => [doc, ...prev]);
      } catch (err) {
        console.error("Echec de l'upload", err);
      }
    }
  };

  const handleIngestUrl = async (url: string) => {
    if (!activeSpaceId) return;
    try {
      const doc = await api.ingestUrl(activeSpaceId, url);
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      console.error("Echec de l'ingestion de l'URL", err);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!activeSpaceId) return;
    await api.deleteDocument(id, activeSpaceId);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-surface-0">
      {/* Mobile backdrop for the nav drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 flex -translate-x-full transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : ""
        }`}
      >
        <SpaceRail
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          onSelect={selectSpace}
          onCreate={() => setSpaceModal({ open: true, editing: null })}
          health={health}
        />

        {activeSpace && (
          <ConversationSidebar
            space={activeSpace}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={(id) => {
              setActiveConversationId(id);
              setMobileNavOpen(false);
            }}
            onCreate={handleCreateConversation}
            onDelete={setDeleteConvId}
            onEditSpace={() => setSpaceModal({ open: true, editing: activeSpace })}
            onDeleteSpace={() => setDeleteSpaceId(activeSpace.id)}
          />
        )}
      </div>

      {activeSpace ? (
        locked ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-slate-500">
            <p className="text-sm">{t("app.workspace.locked")}</p>
          </div>
        ) : (
          <>
            <ChatWindow
              space={activeSpace}
              conversation={activeConversation}
              messages={messages}
              streaming={streaming}
              queuedPosition={queuedPosition}
              onSend={handleSend}
              webSearch={activeConversation?.web_search_enabled ?? false}
              onToggleWebSearch={handleToggleWebSearch}
              onToggleDocPanel={() => setDocPanelOpen((v) => !v)}
              docPanelOpen={docPanelOpen}
              onOpenMobileNav={() => setMobileNavOpen(true)}
            />

            {docPanelOpen && (
              <>
                <div
                  className="fixed inset-0 z-30 bg-black/60 lg:hidden"
                  onClick={() => setDocPanelOpen(false)}
                />
                <div className="fixed inset-y-0 right-0 z-40 lg:static lg:z-auto">
                  <DocumentPanel
                    documents={documents}
                    onUpload={handleUpload}
                    onIngestUrl={handleIngestUrl}
                    onDelete={handleDeleteDocument}
                    onClose={() => setDocPanelOpen(false)}
                  />
                </div>
              </>
            )}
          </>
        )
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center text-slate-500">
          <p className="text-sm">{t("app.workspace.createFirstSpace")}</p>
          <button
            onClick={() => setSpaceModal({ open: true, editing: null })}
            className="rounded-lg bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover"
          >
            {t("app.workspace.newSpace")}
          </button>
        </div>
      )}

      <SpaceModal
        open={spaceModal.open}
        initial={spaceModal.editing}
        onClose={() => setSpaceModal({ open: false, editing: null })}
        onSubmit={spaceModal.editing ? handleUpdateSpace : handleCreateSpace}
      />

      <PasswordPrompt
        open={locked && !!activeSpace}
        spaceName={activeSpace?.name ?? ""}
        error={unlockError}
        submitting={unlocking}
        onSubmit={handleUnlockSubmit}
        onCancel={() => {
          setLocked(false);
          setActiveSpaceId(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteSpaceId}
        title={t("app.confirmDeleteSpace.title")}
        message={t("app.confirmDeleteSpace.message")}
        confirmLabel={t("common.delete")}
        onConfirm={handleDeleteSpace}
        onCancel={() => setDeleteSpaceId(null)}
      />

      <ConfirmDialog
        open={!!deleteConvId}
        title={t("app.confirmDeleteConversation.title")}
        message={t("app.confirmDeleteConversation.message")}
        confirmLabel={t("common.delete")}
        onConfirm={handleDeleteConversation}
        onCancel={() => setDeleteConvId(null)}
      />
    </div>
  );
}
