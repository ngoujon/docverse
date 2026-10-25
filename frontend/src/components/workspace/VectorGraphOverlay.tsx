import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { api } from "../../api/client";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import type { VectorGraph, VectorGraphNode } from "../../types";

interface Props {
  open: boolean;
  spaceId: string;
  shareToken?: string;
  onClose: () => void;
}

// Fluent Corp hero-gradient hues, readable on the navy background.
const PALETTE = ["#635bff", "#00c4ff", "#ff6b8b", "#ffcb57", "#a960ee", "#34d399", "#90e0ff", "#f97316"];

const toolbarButton = "rounded-lg border border-white/15 p-2 text-slate-300 hover:border-white/40 hover:text-white";
const MIN_SCALE = 0.3;
const MAX_SCALE = 6;

/** Stable color per document, so all chunks of one file share a hue. */
function colorForDoc(docId: string): string {
  let hash = 0;
  for (let i = 0; i < docId.length; i++) hash = (hash * 31 + docId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Full-screen, pannable/zoomable map of the space's indexed chunks (2D
 * projection computed by the backend), colored by source document. */
export default function VectorGraphOverlay({ open, spaceId, shareToken, onClose }: Props) {
  const { t } = useTranslation();
  const [graph, setGraph] = useState<VectorGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<VectorGraphNode | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    api
      .vectorGraph(spaceId, shareToken)
      .then(setGraph)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, spaceId, shareToken]);

  const nodesById = useMemo(() => {
    const map = new Map<string, VectorGraphNode>();
    graph?.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [graph]);

  useEscapeToClose(open, onClose);

  if (!open) return null;

  // Wheel zooms, drag pans; the transform is applied to the root <g>.
  const handleWheel: React.WheelEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * delta)));
  };

  const handleMouseDown: React.MouseEventHandler<SVGSVGElement> = (e) => {
    dragging.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };
  const handleMouseMove: React.MouseEventHandler<SVGSVGElement> = (e) => {
    if (!dragging.current) return;
    setOffset({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
  };
  const stopDrag = () => {
    dragging.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label={t("app.vectorGraph.title")}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-white">{t("app.vectorGraph.title")}</h2>
          {graph && (
            <p className="text-xs text-slate-400">
              {t("app.vectorGraph.nodeCount", { count: graph.nodes.length })}
              {graph.truncated ? ` - ${t("app.vectorGraph.truncated")}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s * 1.2))}
            aria-label={t("app.vectorGraph.zoomIn")}
            className={toolbarButton}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(MIN_SCALE, s * 0.8))}
            aria-label={t("app.vectorGraph.zoomOut")}
            className={toolbarButton}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
            aria-label={t("app.vectorGraph.resetView")}
            className={toolbarButton}
          >
            <RotateCcw size={14} />
          </button>
          <button onClick={onClose} aria-label={t("common.close")} className={`ml-2 ${toolbarButton}`}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-slate-400">
            <Loader2 size={18} className="animate-spin" /> {t("common.loading")}
          </div>
        )}
        {!loading && error && (
          <div className="flex h-full items-center justify-center text-slate-400">{t("app.vectorGraph.error")}</div>
        )}
        {!loading && !error && graph && graph.nodes.length === 0 && (
          <div className="flex h-full items-center justify-center text-slate-400">{t("app.vectorGraph.empty")}</div>
        )}
        {!loading && !error && graph && graph.nodes.length > 0 && (
          <svg
            className="h-full w-full cursor-grab active:cursor-grabbing"
            viewBox="-140 -140 280 280"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
          >
            <g transform={`translate(${offset.x / scale} ${offset.y / scale}) scale(${scale})`}>
              {graph.edges.map((e, i) => {
                const a = nodesById.get(e.source);
                const b = nodesById.get(e.target);
                if (!a || !b) return null;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="white"
                    strokeOpacity={0.08}
                    strokeWidth={0.4}
                  />
                );
              })}
              {graph.nodes.map((n) => (
                <circle
                  key={n.id}
                  cx={n.x}
                  cy={n.y}
                  r={hovered?.id === n.id ? 2.6 : 1.6}
                  fill={colorForDoc(n.doc_id)}
                  stroke={hovered?.id === n.id ? "white" : "none"}
                  strokeWidth={0.5}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered((h) => (h?.id === n.id ? null : h))}
                />
              ))}
            </g>
          </svg>
        )}

        {hovered && (
          <div className="pointer-events-none absolute bottom-4 left-4 max-w-sm rounded-lg border border-white/15 bg-slate-900/95 p-3 shadow-panel">
            <p className="text-xs font-semibold" style={{ color: colorForDoc(hovered.doc_id) }}>
              {hovered.doc_name}
            </p>
            <p className="mt-1 text-xs text-slate-300">{hovered.text_preview}</p>
          </div>
        )}
      </div>
    </div>
  );
}
