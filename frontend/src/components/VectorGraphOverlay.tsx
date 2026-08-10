import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { api } from "../api/client";
import type { VectorGraph, VectorGraphNode } from "../types";

interface Props {
  open: boolean;
  spaceId: string;
  shareToken?: string;
  onClose: () => void;
}

const PALETTE = ["#e01cc0", "#0891a8", "#e06a1f", "#b8860b", "#8b2fd6", "#10b981", "#3b82f6", "#f43f5e"];

function colorForDoc(docId: string): string {
  let hash = 0;
  for (let i = 0; i < docId.length; i++) hash = (hash * 31 + docId.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

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

  if (!open) return null;

  const handleWheel: React.WheelEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(6, Math.max(0.3, s * delta)));
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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-white">
            {t("app.vectorGraph.title")}
          </h2>
          {graph && (
            <p className="text-xs text-slate-400">
              {t("app.vectorGraph.nodeCount", { count: graph.nodes.length })}
              {graph.truncated ? ` - ${t("app.vectorGraph.truncated")}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setScale((s) => Math.min(6, s * 1.2))}
            className="rounded-lg border border-white/15 p-2 text-slate-300 hover:border-white/40 hover:text-white"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(0.3, s * 0.8))}
            className="rounded-lg border border-white/15 p-2 text-slate-300 hover:border-white/40 hover:text-white"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="rounded-lg border border-white/15 p-2 text-slate-300 hover:border-white/40 hover:text-white"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={onClose}
            className="ml-2 rounded-lg border border-white/15 p-2 text-slate-300 hover:border-white/40 hover:text-white"
          >
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
          <div className="flex h-full items-center justify-center text-slate-400">
            {t("app.vectorGraph.error")}
          </div>
        )}
        {!loading && !error && graph && graph.nodes.length === 0 && (
          <div className="flex h-full items-center justify-center text-slate-400">
            {t("app.vectorGraph.empty")}
          </div>
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
            <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: colorForDoc(hovered.doc_id) }}>
              {hovered.doc_name}
            </p>
            <p className="mt-1 text-xs text-slate-300">{hovered.text_preview}</p>
          </div>
        )}
      </div>
    </div>
  );
}
