/**
 * ReferenceGraph — Reference connectivity view for world events.
 *
 * Shows all events as nodes and their cross-references as edges.
 * Selecting a node highlights its direct connections and dims everything else.
 * Multiple edges between the same node pair render as parallel offset lines.
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import {
  ReactFlow,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useInternalNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ── Skip types — internal/meta events with no gameplay references ────────────
const SKIP_TYPES = new Set(['vouch', 'revoke', 'player-state', 'report']);

// ── Edge type constants ──────────────────────────────────────────────────────
const EDGE_TYPES = ['placement', 'requires', 'action', 'portal', 'dialogue'];

const EDGE_COLOURS = {
  placement: '#4a9eff',  // blue   — entity placed in container
  requires:  '#ff6b6b',  // red    — dependency / gate
  action:    '#ffd700',  // gold   — on-* trigger target
  portal:    '#00e676',  // green  — navigation connection
  dialogue:  '#bf5af2',  // purple — NPC dialogue chain
};

const EDGE_DASH = {
  placement: '3 3',
  dialogue:  '2 4',
};

// ── Node colour by event type ────────────────────────────────────────────────
// Hardcoded so nodes are visually distinct regardless of world theme
// (CSS variables collapse to 2–3 values in most themes).
const TYPE_COLOURS = {
  world:       '#e0e0e0',  // white   — unique root node
  place:       '#26c6da',  // cyan    — navigation nodes
  portal:      '#00e676',  // green   — matches portal edges
  npc:         '#ffb300',  // amber   — characters
  dialogue:    '#bf5af2',  // purple  — matches dialogue edges
  item:        '#4a9eff',  // blue    — matches placement edges
  feature:     '#66bb6a',  // sage    — interactables
  clue:        '#dce775',  // lime    — information / discovery
  puzzle:      '#ff7043',  // orange  — challenges
  recipe:      '#78909c',  // slate   — crafting
  quest:       '#ffd54f',  // yellow  — objectives
  consequence: '#ef5350',  // red     — matches requires/error edges
  sound:       '#9e9e9e',  // gray       — ambient / passive
  payment:     '#ffd54f',  // yellow  — same family as quest
};

// ── Floating edge helpers ────────────────────────────────────────────────────

/**
 * Compute where the line from `center` toward `other` intersects the node
 * rectangle (width × height, centred on `center`).
 */
function rectIntersection(center, other, w, h) {
  const dx = other.x - center.x;
  const dy = other.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const hw = w / 2, hh = h / 2;
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(scaleX, scaleY);
  return { x: center.x + dx * s, y: center.y + dy * s };
}

// ── Custom node — module-level to prevent XYFlow re-registration ─────────────
function RefNode({ data }) {
  const colour = TYPE_COLOURS[data.eventType] ?? 'var(--colour-text)';
  return (
    <div style={{
      width: NODE_W, height: NODE_H,
      border: `1px ${data.isDraft ? 'dashed' : 'solid'} ${colour}`,
      background: 'color-mix(in srgb, #0a0a0a 92%, #222)',
      color: colour,
      fontSize: '0.5rem',
      fontFamily: 'inherit',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2px 4px',
      cursor: 'pointer',
      opacity: data.dimmed ? 0.15 : 1,
      transition: 'opacity 0.1s',
      textAlign: 'center',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* Invisible handles at all four sides — floating edge logic overrides the
          actual attachment point, but XYFlow still needs handles to exist. */}
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, width: 0, height: 0 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, width: 0, height: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 0, height: 0 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, width: 0, height: 0 }} />
      <div style={{ fontSize: '0.38rem', opacity: 0.6, lineHeight: 1 }}>
        [{data.eventType}]
      </div>
      <div style={{
        fontWeight: 'bold', lineHeight: 1.2,
        overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 4px',
      }}>
        {data.label}
      </div>
    </div>
  );
}

// ── Edge label text from metadata ────────────────────────────────────────────
function edgeLabelText(data) {
  if (!data) return '';
  const { edgeType, trigger, verb, stateGuard, requiredState, negated, slot, entityType } = data;
  if (edgeType === 'action') {
    const { actionType } = data;
    const parts = [trigger || 'on-?'];
    if (verb)        parts.push(verb);
    if (stateGuard)  parts.push(`[${stateGuard}]`);
    if (actionType)  parts.push(actionType);
    return parts.join(' · ');
  }
  if (edgeType === 'requires') {
    const base = negated ? 'requires-not' : 'requires';
    return requiredState ? `${base} · ${requiredState}` : base;
  }
  if (edgeType === 'portal')    return slot || 'portal';
  if (edgeType === 'placement') return entityType || 'placed';
  if (edgeType === 'dialogue') {
    if (!data.gated) return 'dialogue';
    return data.gateState ? `dialogue · req: ${data.gateState}` : 'dialogue · gated';
  }
  return edgeType;
}

// ── Custom edge — floating attachment + parallel offset ───────────────────────
function ParallelEdge({ source, target, data, style, markerEnd }) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const sw = sourceNode.measured?.width  ?? NODE_W;
  const sh = sourceNode.measured?.height ?? NODE_H;
  const tw = targetNode.measured?.width  ?? NODE_W;
  const th = targetNode.measured?.height ?? NODE_H;

  const srcCenter = {
    x: sourceNode.internals.positionAbsolute.x + sw / 2,
    y: sourceNode.internals.positionAbsolute.y + sh / 2,
  };
  const tgtCenter = {
    x: targetNode.internals.positionAbsolute.x + tw / 2,
    y: targetNode.internals.positionAbsolute.y + th / 2,
  };

  const src = rectIntersection(srcCenter, tgtCenter, sw, sh);
  const tgt = rectIntersection(tgtCenter, srcCenter, tw, th);

  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = -dy / len;
  const perpY =  dx / len;
  const offset = data?.parallelOffset ?? 0;

  const x1 = src.x + perpX * offset;
  const y1 = src.y + perpY * offset;
  const x2 = tgt.x + perpX * offset;
  const y2 = tgt.y + perpY * offset;

  // Label position — stagger along the line for parallel edges so labels don't
  // stack on top of each other. parallelOffset encodes the group index:
  // (i - (N-1)/2) * SPACING, so dividing by SPACING recovers a centred index.
  const fracIdx = offset / 8; // e.g. -1, 0, 1 for a 3-edge group
  const t = 0.5 + fracIdx * 0.1; // spread labels at 40%, 50%, 60% etc.
  const midX = x1 + (x2 - x1) * t;
  const midY = y1 + (y2 - y1) * t;

  const colour = EDGE_COLOURS[data?.edgeType] ?? 'var(--colour-dim)';

  return (
    <>
      <path
        d={`M ${x1},${y1} L ${x2},${y2}`}
        style={style}
        markerEnd={markerEnd}
        fill="none"
      />
      {data?.showLabel && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
            pointerEvents: 'none',
            background: '#0a0a0a',
            border: `1px solid ${colour}`,
            color: colour,
            fontSize: '0.42rem',
            fontFamily: 'inherit',
            padding: '2px 5px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
          }}>
            {edgeLabelText(data)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Module-level constants — XYFlow compares by reference; recreating per render
// causes full node/edge teardown.
const refNodeTypes  = { ref: RefNode };
const parallelEdgeTypes = { parallel: ParallelEdge };

// ── Data functions ───────────────────────────────────────────────────────────

/**
 * Build raw nodes and edges from the events Map.
 */
function eventsToReferenceGraph(events) {
  if (!events || events.size === 0) return { rawNodes: [], rawEdges: [] };

  const rawNodes = [];
  const rawEdges = [];
  const edgeIdSet = new Set();

  // Plain portals (no requires/state) are hidden as nodes — they'd just duplicate
  // what the map view shows. Gated/stateful portals are kept as nodes because
  // their conditional relationships are meaningful in the refs view.
  const plainPortals = new Set(); // refs of portals to suppress as nodes
  for (const [ref, event] of events) {
    const eventType = event.tags?.find(t => t[0] === 'type')?.[1] ?? '';
    if (eventType !== 'portal') continue;
    const tags = event.tags || [];
    const isInteresting = tags.some(t =>
      t[0] === 'requires' || t[0] === 'requires-not' || t[0] === 'state'
    );
    if (!isInteresting) plainPortals.add(ref);
  }

  // Build event type index for validation
  const eventTypeMap = new Map(); // ref → eventType
  for (const [ref, event] of events) {
    const eventType = event.tags?.find(t => t[0] === 'type')?.[1] ?? '';
    if (SKIP_TYPES.has(eventType)) continue;
    if (plainPortals.has(ref)) continue; // suppress plain portals as nodes
    eventTypeMap.set(ref, eventType);
  }

  // Build nodes
  for (const [ref, event] of events) {
    const eventType = event.tags?.find(t => t[0] === 'type')?.[1] ?? '';
    if (SKIP_TYPES.has(eventType)) continue;
    if (plainPortals.has(ref)) continue;
    const label = event.tags?.find(t => t[0] === 'title')?.[1]
      || event.tags?.find(t => t[0] === 'd')?.[1]?.split(':').pop()
      || ref.split(':').pop()
      || '?';
    rawNodes.push({
      id: ref,
      type: 'ref',
      position: { x: 0, y: 0 },
      data: { ref, eventType, label, isDraft: !!event._isDraft, author: event.pubkey },
    });
  }

  // Edge helper — validates + deduplicates
  function pushEdge({ source, target, edgeType, tagName, tagIdx, meta = {} }) {
    if (source === target) return;
    if (!eventTypeMap.has(source) || !eventTypeMap.has(target)) return;
    const id = `${source}::${target}::${edgeType}::${tagName}::${tagIdx}`;
    if (edgeIdSet.has(id)) return;
    edgeIdSet.add(id);
    rawEdges.push({ id, source, target, edgeType, data: { edgeType, ...meta } });
  }

  // Scan all events for references
  for (const [ref, event] of events) {
    const eventType = event.tags?.find(t => t[0] === 'type')?.[1] ?? '';
    if (SKIP_TYPES.has(eventType)) continue;

    const tags = event.tags || [];

    tags.forEach((tag, tagIdx) => {
      const name = tag[0];

      // Entity placement (place → entity)
      if (['item', 'feature', 'npc', 'clue', 'sound'].includes(name)) {
        const target = tag[1];
        if (typeof target === 'string' && target.startsWith('30078:')) {
          pushEdge({ source: ref, target, edgeType: 'placement', tagName: name, tagIdx,
            meta: { entityType: name } });
        }
        return;
      }

      // Requires gates
      if (name === 'requires' || name === 'requires-not') {
        const target = tag[1];
        if (typeof target === 'string' && target.startsWith('30078:')) {
          const requiredState = tag[2] || '';
          pushEdge({ source: ref, target, edgeType: 'requires', tagName: name, tagIdx,
            meta: { negated: name === 'requires-not', requiredState } });
        }
        return;
      }

      // Portal connections — emit both directed edges
      if (name === 'exit' && eventType === 'portal') {
        return; // handled as a group below
      }

      // Dialogue links
      if (name === 'dialogue') {
        const nodeRef = tag[1];
        if (typeof nodeRef === 'string' && nodeRef.startsWith('30078:')) {
          // Requires gate at tag[2], required state at tag[3]
          const reqRef   = tag[2];
          const reqState = tag[3] || '';
          const hasReq   = typeof reqRef === 'string' && reqRef.startsWith('30078:');
          pushEdge({ source: ref, target: nodeRef, edgeType: 'dialogue', tagName: name, tagIdx,
            meta: { gated: hasReq, gateState: reqState } });
          if (hasReq) {
            pushEdge({ source: ref, target: reqRef, edgeType: 'requires',
              tagName: `${name}-req`, tagIdx,
              meta: { negated: false, requiredState: reqState } });
          }
        }
        return;
      }

      // Dialogue option → next node
      if (name === 'option') {
        const nextRef = tag[2];
        if (typeof nextRef === 'string' && nextRef.startsWith('30078:')) {
          pushEdge({ source: ref, target: nextRef, edgeType: 'dialogue', tagName: name, tagIdx });
        }
        return;
      }

      // Action targets — scan ALL values in on-* tags for event refs
      if (name.startsWith('on-')) {
        // Extract trigger metadata per trigger type
        let verb = '', stateGuard = '';
        const isRef = v => typeof v === 'string' && v.startsWith('30078:');
        if (name === 'on-interact') {
          verb       = tag[1] || '';
          stateGuard = tag[2] || '';
        } else if (name === 'on-enter' || name === 'on-exit' || name === 'on-timer') {
          stateGuard = !isRef(tag[1]) ? (tag[1] || '') : '';
        } else if (name === 'on-drop') {
          stateGuard = !isRef(tag[2]) ? (tag[2] || '') : '';
        } else if (name === 'on-counter' || name === 'on-health' || name === 'on-player-health') {
          stateGuard = tag[3] || ''; // threshold acts as the guard
        }
        for (let i = 1; i < tag.length; i++) {
          const val = tag[i];
          if (typeof val === 'string' && val.startsWith('30078:')) {
            // The action type (give-item, set-state, consequence, …) always
            // sits immediately before the event ref in every on-* tag shape.
            const prev = i > 0 ? tag[i - 1] : '';
            const actionType = (typeof prev === 'string' && prev && !prev.startsWith('30078:') && prev !== name)
              ? prev : '';
            // traverse targets a portal ref, not a place — resolve through to
            // the portal's exit destinations so the edge points to the actual place.
            if (actionType === 'traverse') {
              const portalEvent = events.get(val);
              if (portalEvent) {
                const exitTags = (portalEvent.tags || []).filter(t => t[0] === 'exit');
                exitTags.forEach((exit, exitIdx) => {
                  const placeRef = exit[1];
                  if (typeof placeRef === 'string' && placeRef.startsWith('30078:')) {
                    pushEdge({ source: ref, target: placeRef, edgeType: 'action',
                      tagName: name, tagIdx: `${tagIdx}-${i}-${exitIdx}`,
                      meta: { trigger: name, verb, stateGuard, actionType: 'traverse' } });
                  }
                });
              }
            } else {
              pushEdge({ source: ref, target: val, edgeType: 'action',
                tagName: name, tagIdx: `${tagIdx}-${i}`,
                meta: { trigger: name, verb, stateGuard, actionType } });
            }
          }
        }
        return;
      }
    });

    // Portal connections
    if (eventType === 'portal') {
      const exits = tags.filter(t => t[0] === 'exit');
      if (plainPortals.has(ref)) {
        // Plain portal: one undirected edge with combined slot label (e.g. "east/west")
        if (exits.length >= 2) {
          const src  = exits[0][1];
          const tgt  = exits[1][1];
          if (typeof src === 'string' && src.startsWith('30078:') &&
              typeof tgt === 'string' && tgt.startsWith('30078:')) {
            const slot = exits.map(e => e[2] || '').filter(Boolean).join('/');
            pushEdge({ source: src, target: tgt, edgeType: 'portal',
              tagName: 'exit', tagIdx: '0->1', meta: { slot } });
          }
        }
      } else {
        // Gated/stateful portal: keep as node, connect portal↔place
        for (let i = 0; i < exits.length; i++) {
          const placeRef = exits[i][1];
          const slot     = exits[i][2] || '';
          if (typeof placeRef === 'string' && placeRef.startsWith('30078:')) {
            pushEdge({ source: ref, target: placeRef, edgeType: 'portal',
              tagName: 'exit', tagIdx: i, meta: { slot } });
          }
        }
      }
    }
  }

  return { rawNodes, rawEdges };
}

// Node dimensions used by layout and RefNode
const NODE_W = 140;
const NODE_H = 40;

/**
 * Compute force-directed layout positions. Mutates node positions.
 * Runs the simulation synchronously for a fixed number of ticks.
 * All edge types participate — connected nodes cluster naturally.
 */
function computeLayout(nodes, edges) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Build deduplicated simulation links (skip unknown endpoints)
  const simLinks = [];
  const seen = new Set();
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    const key = [edge.source, edge.target].sort().join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    simLinks.push({
      source: edge.source, target: edge.target, edgeType: edge.edgeType,
      sourceEventType: nodeById.get(edge.source)?.data?.eventType ?? '',
      targetEventType: nodeById.get(edge.target)?.data?.eventType ?? '',
    });
  }

  // Seed positions in a circle to give the simulation a clean start
  const R = Math.max(200, nodes.length * 12);
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    n.x = R * Math.cos(angle);
    n.y = R * Math.sin(angle);
  });

  const LINK_DISTANCE = { portal: 160, placement: 160, dialogue: 90, requires: 180, action: 200 };
  const LINK_STRENGTH = { portal: 0.2, placement: 0.4, dialogue: 0.8, requires: 0.4, action: 0.35 };
  function linkParams(d) {
    if (d.edgeType === 'dialogue') return { dist:  90, str: 0.8 };
    if (d.edgeType === 'portal')   return { dist: 160, str: 0.2 };
    return {
      dist: LINK_DISTANCE[d.edgeType] ?? 180,
      str:  LINK_STRENGTH[d.edgeType] ?? 0.35,
    };
  }

  forceSimulation(nodes)
    .force('link', forceLink(simLinks)
      .id(d => d.id)
      .distance(d => linkParams(d).dist)
      .strength(d => linkParams(d).str))
    .force('charge', forceManyBody().strength(-800).distanceMax(500))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(NODE_W * 0.8))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .stop()
    .tick(600);

  // d3 sets x/y as node centres; XYFlow wants top-left
  for (const node of nodes) {
    node.position = { x: node.x - NODE_W / 2, y: node.y - NODE_H / 2 };
  }
}

/**
 * Assign perpendicular parallel offsets to edges sharing the same node pair.
 * Called after filtering so visible edges are always centered.
 * Mutates edge.data.parallelOffset.
 */
function assignParallelOffsets(edges) {
  const SPACING = 8;
  const pairGroups = new Map();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join('::');
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key).push(edge);
  }
  for (const group of pairGroups.values()) {
    const N = group.length;
    group.forEach((edge, i) => {
      edge.data = { ...edge.data, parallelOffset: (i - (N - 1) / 2) * SPACING };
    });
  }
  return edges;
}

/**
 * Build inline style for an edge given its type, highlight state, and fade state.
 */
function buildEdgeStyle(edgeType, highlighted, faded) {
  return {
    stroke: EDGE_COLOURS[edgeType] ?? 'var(--colour-dim)',
    strokeWidth: highlighted ? 2 : 1,
    strokeDasharray: EDGE_DASH[edgeType],
    opacity: faded ? 0.05 : 1,
  };
}

/**
 * Build markerEnd for an edge — arrowheads on action and requires edges only.
 */
function buildMarker(edgeType) {
  if (edgeType !== 'action' && edgeType !== 'requires') return undefined;
  return { type: MarkerType.ArrowClosed, color: EDGE_COLOURS[edgeType], width: 12, height: 12 };
}

// ── ReferenceGraph component ─────────────────────────────────────────────────

export default function ReferenceGraph({
  events, selectedRef, onSelectRef, onOpenSidebar, onEditEvent, trustSet, clientMode,
}) {
  const [activeFilters, setActiveFilters] = useState(() => new Set(EDGE_TYPES));
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState(() => new Set());

  // 1. Build raw graph
  const { rawNodes, rawEdges } = useMemo(
    () => eventsToReferenceGraph(events),
    [events]
  );

  // Unique event types present in the world (for node filter chips)
  const allNodeTypes = useMemo(
    () => [...new Set(rawNodes.map(n => n.data.eventType))].sort(),
    [rawNodes]
  );

  // 2. Compute layout positions (uses all nodes — filtering doesn't affect layout)
  const layoutNodes = useMemo(() => {
    const nodes = rawNodes.map(n => ({ ...n, position: { x: 0, y: 0 } }));
    computeLayout(nodes, rawEdges);
    return nodes;
  }, [rawNodes, rawEdges]);

  // 3a. Filter nodes by type
  const visibleNodes = useMemo(
    () => layoutNodes.filter(n => !hiddenNodeTypes.has(n.data.eventType)),
    [layoutNodes, hiddenNodeTypes]
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map(n => n.id)),
    [visibleNodes]
  );

  // 3b. Filter edges by type and visible endpoints
  const filteredRawEdges = useMemo(
    () => rawEdges.filter(e =>
      activeFilters.has(e.edgeType) &&
      visibleNodeIds.has(e.source) &&
      visibleNodeIds.has(e.target)
    ),
    [rawEdges, activeFilters, visibleNodeIds]
  );

  // 4. Assign parallel offsets after filtering (so visible edges are centered)
  const offsetEdges = useMemo(
    () => assignParallelOffsets(filteredRawEdges.map(e => ({ ...e, data: { ...e.data } }))),
    [filteredRawEdges]
  );

  // 5. Apply selection highlighting
  const { styledNodes, styledEdges } = useMemo(() => {
    if (!selectedRef) {
      return {
        styledNodes: visibleNodes.map(n => ({ ...n, data: { ...n.data, dimmed: false } })),
        styledEdges: offsetEdges.map(e => ({
          ...e,
          type: 'parallel',
          style: buildEdgeStyle(e.edgeType, false, false),
          markerEnd: buildMarker(e.edgeType),
        })),
      };
    }
    const connected = new Set();
    for (const e of offsetEdges) {
      if (e.source === selectedRef) connected.add(e.target);
      if (e.target === selectedRef) connected.add(e.source);
    }
    const highlighted = new Set([selectedRef, ...connected]);
    return {
      styledNodes: visibleNodes.map(n => ({
        ...n,
        data: { ...n.data, dimmed: !highlighted.has(n.id) },
      })),
      styledEdges: offsetEdges.map(e => {
        const touches = e.source === selectedRef || e.target === selectedRef;
        return {
          ...e,
          type: 'parallel',
          style: buildEdgeStyle(e.edgeType, touches, !touches),
          markerEnd: buildMarker(e.edgeType),
          data: { ...e.data, showLabel: touches && e.edgeType !== 'placement' },
        };
      }),
    };
  }, [layoutNodes, offsetEdges, selectedRef]);

  // 6. XYFlow state
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(styledNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(styledEdges);

  // Sync styled nodes and edges into XYFlow state
  useEffect(() => { setNodes(styledNodes); }, [styledNodes, setNodes]);
  useEffect(() => { setEdges(styledEdges); }, [styledEdges, setEdges]);

  const onNodesChange = onNodesChangeInternal;

  const onNodeClick = useCallback((_, node) => {
    const ref = node.data?.ref;
    if (ref === selectedRef) {
      onOpenSidebar?.(ref); // second click opens sidebar
    } else {
      onSelectRef(ref);
    }
  }, [onSelectRef, onOpenSidebar, selectedRef]);

  const onPaneClick = useCallback(() => {
    onSelectRef(null);
  }, [onSelectRef]);

  const toggleFilter = useCallback((et) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      next.has(et) ? next.delete(et) : next.add(et);
      return next;
    });
  }, []);

  const toggleNodeType = useCallback((nt) => {
    setHiddenNodeTypes(prev => {
      const next = new Set(prev);
      next.has(nt) ? next.delete(nt) : next.add(nt);
      return next;
    });
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0a' }}>
      {/* Filter chips */}
      <div style={{
        position: 'absolute', top: 14, left: 8, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 4,
        fontFamily: 'inherit',
      }}>
        {/* Node type filters */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {allNodeTypes.map(nt => {
            const active = !hiddenNodeTypes.has(nt);
            const colour = TYPE_COLOURS[nt] ?? 'var(--colour-dim)';
            return (
              <button
                key={nt}
                onClick={() => toggleNodeType(nt)}
                style={{
                  background: active
                    ? `color-mix(in srgb, ${colour} 20%, #0a0a0a)`
                    : '#0a0a0a',
                  border: `1px solid ${active ? colour : 'var(--colour-dim)'}`,
                  color: active ? colour : 'var(--colour-dim)',
                  font: 'inherit', fontSize: '0.5rem',
                  padding: '3px 6px', cursor: 'pointer',
                }}
              >
                {nt}
              </button>
            );
          })}
        </div>
        {/* Edge type filters */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {EDGE_TYPES.map(et => {
            const active = activeFilters.has(et);
            const colour = EDGE_COLOURS[et];
            return (
              <button
                key={et}
                onClick={() => toggleFilter(et)}
                style={{
                  background: active
                    ? `color-mix(in srgb, ${colour} 20%, #0a0a0a)`
                    : '#0a0a0a',
                  border: `1px solid ${active ? colour : 'var(--colour-dim)'}`,
                  color: active ? colour : 'var(--colour-dim)',
                  font: 'inherit', fontSize: '0.5rem',
                  padding: '3px 6px', cursor: 'pointer',
                }}
              >
                {et}
              </button>
            );
          })}
        </div>
      </div>


      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={refNodeTypes}
        edgeTypes={parallelEdgeTypes}
        defaultEdgeOptions={{ type: 'parallel' }}
        nodesDraggable={false}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 0.6 }}
        minZoom={0.05}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--colour-dim)" gap={40} size={1} style={{ opacity: 0.1 }} />
        <Controls showInteractive={false} style={{ bottom: 10, left: 10 }} />
      </ReactFlow>
    </div>
  );
}
