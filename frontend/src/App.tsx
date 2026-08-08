import { useEffect, useRef, useState } from "react";
import { api, streamChat } from "./api/client";
import type { Conversation, DocumentItem, HealthStatus, Message, Space } from "./types";
import SpaceRail from "./components/SpaceRail";
import ConversationSidebar from "./components/ConversationSidebar";
import ChatWindow from "./components/ChatWindow";
import DocumentPanel from "./components/DocumentPanel";
import SpaceModal from "./components/SpaceModal";
import ConfirmDialog from "./components/ConfirmDialog";

export default function App() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [docPanelOpen, setDocPanelOpen] = useState(true);

  const [spaceModal, setSpaceModal] = useState<{ open: boolean; editing: Space | null }>({
    open: false,
    editing: null,
  });
  const [deleteSpaceId, setDeleteSpaceId] = useState<string | null>(null);
  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  // Initial load
  useEffect(() => {
    api.listSpaces().then((list) => {
      setSpaces(list);
      if (list.length) setActiveSpaceId(list[0].id);
    });
    const checkHealth = () => api.health().then(setHealth).catch(() => setHealth(null));
    checkHealth();
    const t = setInterval(checkHealth, 15000);
    return () => clearInterval(t);
  }, []);

  // Load conversations + documents when active space changes
  useEffect(() => {
    if (!activeSpaceId) {
      setConversations([]);
      setDocuments([]);
      setActiveConversationId(null);
      return;
    }
    api.listConversations(activeSpaceId).then((list) => {
      setConversations(list);
      setActiveConversationId(list.length ? list[0].id : null);
    });
    api.listDocuments(activeSpaceId).then(setDocuments);
  }, [activeSpaceId]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    api.listMessages(activeConversationId).then(setMessages);
  }, [activeConversationId]);

  // Poll document processing status
  useEffect(() => {
    if (!activeSpaceId) return;
    const hasPending = documents.some(
      (d) => d.status === "pending" || d.status === "processing"
    );
    if (!hasPending) return;
    const t = setInterval(() => {
      api.listDocuments(activeSpaceId).then(setDocuments);
    }, 3000);
    return () => clearInterval(t);
  }, [activeSpaceId, documents]);

  const refreshConversations = (spaceId: string) => {
    api.listConversations(spaceId).then(setConversations);
  };

  // ---- Spaces ----
  const handleCreateSpace = async (data: { name: string; description: string; color: string }) => {
    const space = await api.createSpace(data.name, data.description, data.color);
    setSpaces((prev) => [space, ...prev]);
    setActiveSpaceId(space.id);
    setSpaceModal({ open: false, editing: null });
  };

  const handleUpdateSpace = async (data: { name: string; description: string; color: string }) => {
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
      setActiveSpaceId(remaining.length ? remaining[0].id : null);
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
    if (!deleteConvId) return;
    await api.deleteConversation(deleteConvId);
    const remaining = conversations.filter((c) => c.id !== deleteConvId);
    setConversations(remaining);
    if (activeConversationId === deleteConvId) {
      setActiveConversationId(remaining.length ? remaining[0].id : null);
    }
    setDeleteConvId(null);
  };

  const handleToggleWebSearch = async (v: boolean) => {
    if (!activeConversation) return;
    const updated = await api.updateConversation(activeConversation.id, {
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
    const controller = new AbortController();
    abortRef.current = controller;
    const webSearch = activeConversation?.web_search_enabled ?? false;

    try {
      await streamChat(
        activeConversationId,
        text,
        webSearch,
        (event) => {
          if (event.type === "user_message_id" && event.id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === tempUserId ? { ...m, id: event.id! } : m))
            );
          } else if (event.type === "token" && event.content) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, content: m.content + event.content } : m
              )
            );
          } else if (event.type === "done") {
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? { ...m, content: m.content || "*Erreur de connexion au serveur.*" }
            : m
        )
      );
    } finally {
      setStreaming(false);
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
    await api.deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0">
      <SpaceRail
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        onSelect={setActiveSpaceId}
        onCreate={() => setSpaceModal({ open: true, editing: null })}
        health={health}
      />

      {activeSpace ? (
        <>
          <ConversationSidebar
            space={activeSpace}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={setActiveConversationId}
            onCreate={handleCreateConversation}
            onDelete={setDeleteConvId}
            onEditSpace={() => setSpaceModal({ open: true, editing: activeSpace })}
            onDeleteSpace={() => setDeleteSpaceId(activeSpace.id)}
          />

          <ChatWindow
            space={activeSpace}
            conversation={activeConversation}
            messages={messages}
            streaming={streaming}
            onSend={handleSend}
            webSearch={activeConversation?.web_search_enabled ?? false}
            onToggleWebSearch={handleToggleWebSearch}
            onToggleDocPanel={() => setDocPanelOpen((v) => !v)}
            docPanelOpen={docPanelOpen}
          />

          {docPanelOpen && (
            <DocumentPanel
              documents={documents}
              onUpload={handleUpload}
              onIngestUrl={handleIngestUrl}
              onDelete={handleDeleteDocument}
            />
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
          <p className="text-sm">Creez votre premier espace de travail pour commencer.</p>
          <button
            onClick={() => setSpaceModal({ open: true, editing: null })}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Nouvel espace
          </button>
        </div>
      )}

      <SpaceModal
        open={spaceModal.open}
        initial={spaceModal.editing}
        onClose={() => setSpaceModal({ open: false, editing: null })}
        onSubmit={spaceModal.editing ? handleUpdateSpace : handleCreateSpace}
      />

      <ConfirmDialog
        open={!!deleteSpaceId}
        title="Supprimer cet espace ?"
        message="Tous les documents, conversations et messages associes seront definitivement supprimes."
        confirmLabel="Supprimer"
        onConfirm={handleDeleteSpace}
        onCancel={() => setDeleteSpaceId(null)}
      />

      <ConfirmDialog
        open={!!deleteConvId}
        title="Supprimer cette conversation ?"
        message="Cette action est irreversible."
        confirmLabel="Supprimer"
        onConfirm={handleDeleteConversation}
        onCancel={() => setDeleteConvId(null)}
      />
    </div>
  );
}
