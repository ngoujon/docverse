import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "../../hooks/usePageMeta";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { api, RateLimitedError, streamChat } from "../../api/client";
import { forgetSharedLink, rememberSharedLink } from "../../api/storage";
import type { Conversation, DocumentItem, Message, Space } from "../../types";
import SpaceRail from "../../components/workspace/SpaceRail";
import ConversationSidebar from "../../components/workspace/ConversationSidebar";
import ChatWindow from "../../components/workspace/ChatWindow";
import DocumentPanel from "../../components/workspace/DocumentPanel";
import SpaceModal, { type SpaceFormData } from "../../components/workspace/SpaceModal";
import SpaceSharingPanel from "../../components/workspace/SpaceSharingPanel";
import VectorGraphOverlay from "../../components/workspace/VectorGraphOverlay";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { pageTitle } from "../../brand";

/** What the confirmation dialog is about to delete. */
type PendingDelete = { kind: "space" | "conversation" | "document"; id: string } | null;

const DELETE_DIALOG_KEYS = {
  space: "app.confirmDeleteSpace",
  conversation: "app.confirmDeleteConversation",
  document: "app.confirmDeleteDocument",
} as const;

/** Interval at which documents still being indexed are re-polled. */
const DOCUMENT_POLL_MS = 3000;

/**
 * The workspace app: space rail, conversation sidebar, chat and documents.
 * Serves both a signed-in user's own spaces (/app/:spaceId) and a single
 * space opened through a share link (/share/:shareToken).
 */
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

  useEscapeToClose(mobileNavOpen, () => setMobileNavOpen(false));

  const [spaceModal, setSpaceModal] = useState<{ open: boolean; editing: Space | null }>({
    open: false,
    editing: null,
  });
  const [sharingOpen, setSharingOpen] = useState(false);
  const [vectorGraphOpen, setVectorGraphOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const abortRef = useRef<AbortController | null>(null);
  const didInitFromRoute = useRef(false);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;
  const canWrite = activeSpace ? activeSpace.my_role !== "admin_view" : false;
  const canUpload = activeSpace?.can_upload ?? false;
  const isOwner = activeSpace?.my_role === "owner";

  usePageMeta({
    title: activeConversation
      ? pageTitle(`${activeConversation.title} - ${activeSpace?.name ?? ""}`)
      : activeSpace
        ? pageTitle(activeSpace.name)
        : pageTitle(),
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
          if (user) {
            rememberSharedLink(user.id, { token: shareToken, spaceId: space.id, name: space.name, color: space.color });
          }
        })
        .catch(() => {
          setLoadError(t("app.share.invalid"));
          if (user) forgetSharedLink(user.id, shareToken);
        });
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
    const timer = setInterval(() => {
      api
        .listDocuments(activeSpaceId, shareToken)
        .then(setDocuments)
        .catch(() => {});
    }, DOCUMENT_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpaceId, documents]);

  const refreshConversations = (spaceId: string) => {
    api
      .listConversations(spaceId, shareToken)
      .then(setConversations)
      .catch(() => {});
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

  // ---- Conversations ----
  const handleCreateConversation = async () => {
    if (!activeSpaceId) return;
    const conv = await api.createConversation(activeSpaceId, shareToken);
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
  };

  // ---- Chat ----
  const handleSend = async (text: string, docIds: string[] = []) => {
    if (!activeConversationId || !activeSpaceId) return;

    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    const now = new Date().toISOString();

    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        conversation_id: activeConversationId,
        role: "user",
        content: text,
        sources: [],
        created_at: now,
      },
      {
        id: tempAssistantId,
        conversation_id: activeConversationId,
        role: "assistant",
        content: "",
        sources: [],
        created_at: now,
      },
    ]);

    // Applies `patch` to the optimistic message `id` as stream events arrive.
    const patchMessage = (id: string, patch: (m: Message) => Partial<Message>) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)));

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
            patchMessage(tempUserId, () => ({ id: event.id! }));
          } else if (event.type === "queued") {
            setQueuedPosition(event.position ?? 1);
          } else if (event.type === "token" && event.content) {
            setQueuedPosition(null);
            patchMessage(tempAssistantId, (m) => ({ content: m.content + event.content }));
          } else if (event.type === "done") {
            setQueuedPosition(null);
            patchMessage(tempAssistantId, (m) => ({ id: event.message_id || m.id, sources: event.sources || [] }));
            // The first question renames the conversation server-side.
            refreshConversations(activeSpaceId);
          }
        },
        shareToken,
        controller.signal,
        docIds,
      );
    } catch (err) {
      const reason = err instanceof RateLimitedError ? err.message : t("app.chat.connectionError");
      patchMessage(tempAssistantId, (m) => ({ content: m.content || `*${reason}*` }));
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

  // ---- Deletion (behind the confirmation dialog) ----
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    if (kind === "space") {
      await api.deleteSpace(id);
      const remaining = spaces.filter((s) => s.id !== id);
      setSpaces(remaining);
      if (activeSpaceId === id) setActiveSpaceId(remaining[0]?.id ?? null);
    } else if (kind === "conversation") {
      await api.deleteConversation(id, shareToken);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeConversationId === id) setActiveConversationId(remaining[0]?.id ?? null);
    } else {
      await api.deleteDocument(id, shareToken);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    }
    setPendingDelete(null);
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
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setMobileNavOpen(false)} />
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
            onDelete={(id) => setPendingDelete({ kind: "conversation", id })}
            onEditSpace={() => setSpaceModal({ open: true, editing: activeSpace })}
            onDeleteSpace={() => setPendingDelete({ kind: "space", id: activeSpace.id })}
            onOpenSharing={() => setSharingOpen(true)}
          />
        )}
      </div>

      {activeSpace ? (
        <>
          <ChatWindow
            space={activeSpace}
            documents={documents}
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
              <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setDocPanelOpen(false)} />
              <div className="fixed inset-y-0 right-0 z-40 lg:static lg:z-auto">
                <DocumentPanel
                  documents={documents}
                  onUpload={handleUpload}
                  onIngestUrl={handleIngestUrl}
                  onDelete={(id) => setPendingDelete({ kind: "document", id })}
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
        // Remount per edited space so the form starts from its values.
        key={spaceModal.editing?.id ?? "new"}
        open={spaceModal.open}
        initial={spaceModal.editing}
        onClose={() => setSpaceModal({ open: false, editing: null })}
        onSubmit={spaceModal.editing ? handleUpdateSpace : handleCreateSpace}
      />

      <SpaceSharingPanel open={sharingOpen && isOwner} space={activeSpace} onClose={() => setSharingOpen(false)} />

      {activeSpace && (
        <VectorGraphOverlay
          open={vectorGraphOpen}
          spaceId={activeSpace.id}
          shareToken={shareToken}
          onClose={() => setVectorGraphOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete ? t(`${DELETE_DIALOG_KEYS[pendingDelete.kind]}.title`) : ""}
        message={pendingDelete ? t(`${DELETE_DIALOG_KEYS[pendingDelete.kind]}.message`) : ""}
        confirmLabel={t("common.delete")}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
