import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "../hooks/usePageMeta";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { api, streamChat } from "../api/client";
import type { Conversation, DocumentItem, Message, Space } from "../types";
import SpaceRail from "../components/SpaceRail";
import ConversationSidebar from "../components/ConversationSidebar";
import ChatWindow from "../components/ChatWindow";
import DocumentPanel from "../components/DocumentPanel";
import SpaceModal, { type SpaceFormData } from "../components/SpaceModal";
import SpaceSharingPanel from "../components/SpaceSharingPanel";
import VectorGraphOverlay from "../components/VectorGraphOverlay";
import ConfirmDialog from "../components/ConfirmDialog";

export default function WorkspaceApp() {
  const { t } = useTranslation();
  const { spaceId: routeSpaceId, shareToken } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, loading: authLoading } = useAuth();

  const shareMode = !!shareToken;

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const [streaming, setStreaming] = useState(false);
  const [queuedPosition, setQueuedPosition] = useState<number | null>(null);
  const [docPanelOpen, setDocPanelOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [spaceModal, setSpaceModal] = useState<{ open: boolean; editing: Space | null }>({
    open: false,
    editing: null,
  });
  const [sharingOpen, setSharingOpen] = useState(false);
  const [vectorGraphOpen, setVectorGraphOpen] = useState(false);
  const [deleteSpaceId, setDeleteSpaceId] = useState<string | null>(null);
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const didInitFromRoute = useRef(false);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;
  const canWrite = activeSpace ? activeSpace.my_role !== "admin_view" : false;
  const canUpload = activeSpace?.can_upload ?? false;
  const isOwner = activeSpace?.my_role === "owner";

  usePageMeta({
    title: activeConversation
      ? `${activeConversation.title} - ${activeSpace?.name ?? ""} - Hyaides`
      : activeSpace
      ? `${activeSpace.name} - Hyaides`
      : "Hyaides",
    noindex: true,
  });

  const selectSpace = (id: string) => {
    if (!spaces.some((s) => s.id === id)) return;
    setActiveSpaceId(id);
    setMobileNavOpen(false);
  };

  // Authenticated mode requires a logged-in user.
  useEffect(() => {
    if (!shareMode && !authLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [shareMode, authLoading, user, navigate]);

  // Resolve the space(s) to show: either "my spaces" (authenticated) or the
  // single space a share link points to (share mode).
  useEffect(() => {
    if (shareMode) {
      if (!shareToken) return;
      api
        .getSpaceByShareToken(shareToken)
        .then((space) => {
          setSpaces([space]);
          setActiveSpaceId(space.id);
        })
        .catch(() => setLoadError(t("app.share.invalid")));
      return;
    }
    if (!user) return;
    api.listSpaces().then((list) => {
      setSpaces(list);
      if (didInitFromRoute.current) return;
      didInitFromRoute.current = true;
      const target = routeSpaceId && list.some((s) => s.id === routeSpaceId) ? routeSpaceId : list[0]?.id;
      if (target) setActiveSpaceId(target);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareMode, shareToken, user]);

  // Load conversations + documents when active space changes
  useEffect(() => {
    if (!activeSpaceId) {
      setConversations([]);
      setDocuments([]);
      setActiveConversationId(null);
      return;
    }
    api
      .listConversations(activeSpaceId, shareToken)
      .then((list) => {
        setConversations(list);
        setActiveConversationId(list.length ? list[0].id : null);
      })
      .catch(() => {});
    api
      .listDocuments(activeSpaceId, shareToken)
      .then(setDocuments)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpaceId]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    api.listMessages(activeConversationId, shareToken).then(setMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // Poll document processing status
  useEffect(() => {
    if (!activeSpaceId) return;
    const hasPending = documents.some((d) => d.status === "pending" || d.status === "processing");
    if (!hasPending) return;
    const t = setInterval(() => {
      api.listDocuments(activeSpaceId, shareToken).then(setDocuments).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpaceId, documents]);

  const refreshConversations = (spaceId: string) => {
    api.listConversations(spaceId, shareToken).then(setConversations).catch(() => {});
  };

  // ---- Spaces ----
  const handleCreateSpace = async (data: SpaceFormData) => {
    const space = await api.createSpace(data.name, data.description, data.color);
    setSpaces((prev) => [space, ...prev]);
    setActiveSpaceId(space.id);
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
    const remaining = spaces.filter((s) => s.id !== deleteSpaceId);
    setSpaces(remaining);
    if (activeSpaceId === deleteSpaceId) {
      setActiveSpaceId(remaining[0]?.id ?? null);
    }
    setDeleteSpaceId(null);
  };

  // ---- Conversations ----
  const handleCreateConversation = async () => {
    if (!activeSpaceId) return;
    const conv = await api.createConversation(activeSpaceId, shareToken);
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
  };

  const handleDeleteConversation = async () => {
    if (!deleteConvId || !activeSpaceId) return;
    await api.deleteConversation(deleteConvId, shareToken);
    const remaining = conversations.filter((c) => c.id !== deleteConvId);
    setConversations(remaining);
    if (activeConversationId === deleteConvId) {
      setActiveConversationId(remaining.length ? remaining[0].id : null);
    }
    setDeleteConvId(null);
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

    try {
      await streamChat(
        activeConversationId,
        text,
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
        shareToken,
        controller.signal
      );
    } catch (err) {
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
        const doc = await api.uploadDocument(activeSpaceId, file, shareToken);
        setDocuments((prev) => [doc, ...prev]);
      } catch (err) {
        console.error("Echec de l'upload", err);
      }
    }
  };

  const handleIngestUrl = async (url: string) => {
    if (!activeSpaceId) return;
    try {
      const doc = await api.ingestUrl(activeSpaceId, url, shareToken);
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      console.error("Echec de l'ingestion de l'URL", err);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteDocId || !activeSpaceId) return;
    await api.deleteDocument(deleteDocId, shareToken);
    setDocuments((prev) => prev.filter((d) => d.id !== deleteDocId));
    setDeleteDocId(null);
  };

  if (shareMode && loadError) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col items-center justify-center gap-2 bg-surface-0 px-4 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
      </div>
    );
  }

  if (!shareMode && (authLoading || !user)) {
    return <div className="h-[100dvh] w-screen bg-surface-0" />;
  }

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
        {!shareMode && (
          <SpaceRail
            spaces={spaces}
            activeSpaceId={activeSpaceId}
            onSelect={selectSpace}
            onCreate={() => setSpaceModal({ open: true, editing: null })}
          />
        )}

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
            onOpenSharing={() => setSharingOpen(true)}
          />
        )}
      </div>

      {activeSpace ? (
        <>
          <ChatWindow
            space={activeSpace}
            conversation={activeConversation}
            messages={messages}
            streaming={streaming}
            queuedPosition={queuedPosition}
            onSend={handleSend}
            onToggleDocPanel={() => setDocPanelOpen((v) => !v)}
            docPanelOpen={docPanelOpen}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            readOnly={!canWrite}
            onOpenVectorGraph={() => setVectorGraphOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
            shareToken={shareToken}
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
                  onDelete={setDeleteDocId}
                  onClose={() => setDocPanelOpen(false)}
                  readOnly={!canUpload}
                />
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center text-slate-500 dark:text-slate-400">
          <p className="text-sm">{t("app.workspace.createFirstSpace")}</p>
          {!shareMode && (
            <button
              onClick={() => setSpaceModal({ open: true, editing: null })}
              className="rounded-lg bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover"
            >
              {t("app.workspace.newSpace")}
            </button>
          )}
        </div>
      )}

      <SpaceModal
        open={spaceModal.open}
        initial={spaceModal.editing}
        onClose={() => setSpaceModal({ open: false, editing: null })}
        onSubmit={spaceModal.editing ? handleUpdateSpace : handleCreateSpace}
      />

      <SpaceSharingPanel
        open={sharingOpen && isOwner}
        space={activeSpace}
        onClose={() => setSharingOpen(false)}
      />

      {activeSpace && (
        <VectorGraphOverlay
          open={vectorGraphOpen}
          spaceId={activeSpace.id}
          shareToken={shareToken}
          onClose={() => setVectorGraphOpen(false)}
        />
      )}

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

      <ConfirmDialog
        open={!!deleteDocId}
        title={t("app.confirmDeleteDocument.title")}
        message={t("app.confirmDeleteDocument.message")}
        confirmLabel={t("common.delete")}
        onConfirm={handleDeleteDocument}
        onCancel={() => setDeleteDocId(null)}
      />
    </div>
  );
}
