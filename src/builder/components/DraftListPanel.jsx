/**
 * DraftListPanel — DOS-style panel listing all drafts.
 *
 * Drafts are event templates: { kind, tags, content, _draft: { id, ... } }
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import DOSPanel from '../../components/ui/DOSPanel.jsx';
import DOSButton from './ui/DOSButton.jsx';
import ImportPreviewPanel from './ImportPreviewPanel.jsx';
import { validateEvent } from '../eventBuilder.js';
import { validateImport, loadAnswers, parseJsonLenient } from '../draftStore.js';
import { validateWorld, verifyPuzzleHashes } from '../validateWorld.js';

function getTagValue(event, name) {
  return event.tags?.find((t) => t[0] === name)?.[1] || null;
}

export default function DraftListPanel({
  drafts,
  events,
  worldSlug,
  publishStatus,
  onClose,
  onEdit,
  onDelete,
  onPublish,
  onNew,
  onImport,
  onExport,
  onBulkPublish,
  onDeleteAll,
  onImportScenarios,
  pendingImportData,
  onPendingImportConsumed,
  zIndex,
}) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(null); // draft to publish
  const [confirmPublishAll, setConfirmPublishAll] = useState(false);
  const [expandedValidation, setExpandedValidation] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // { validation, data }
  const [publishProgress, setPublishProgress] = useState(null); // { total, published, failed }
  const fileRef = useRef(null);
  const scenarioFileRef = useRef(null);
  const pendingConsumed = useRef(false);

  // Auto-trigger import preview from pending Lobby import
  useEffect(() => {
    if (pendingImportData && !pendingConsumed.current && events) {
      pendingConsumed.current = true;
      try {
      const publishedEvents = events instanceof Map ? [...events.entries()].filter(([, e]) => !e._isDraft) : [];
      const validation = validateImport(worldSlug, pendingImportData, publishedEvents);
      for (const event of (validation.valid || [])) {
        const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] || '?';
        const result = validateEvent(event);
        for (const issue of result.errors) validation.warnings.push(`${dTag}: ${issue.message}`);
        for (const issue of result.warnings) validation.warnings.push(`${dTag}: ${issue.message}`);
      }
      const publishedEventsFlat = publishedEvents.map(([, e]) => e);
      const combinedEvents = [...drafts, ...(validation.valid || []), ...publishedEventsFlat];
      const dedupMap = new Map();
      for (const e of combinedEvents) {
        const d = e.tags?.find((t) => t[0] === 'd')?.[1];
        if (d) dedupMap.set(d, e);
      }
      const answers = { ...loadAnswers(worldSlug), ...(pendingImportData.answers || {}) };
      const worldResult = validateWorld([...dedupMap.values()], answers);
      for (const issue of worldResult.errors) validation.warnings.push(`${issue.dTag}: ${issue.message}`);
      for (const issue of worldResult.warnings) validation.warnings.push(`${issue.dTag}: ${issue.message}`);
      setImportPreview({ validation, data: pendingImportData });
      if (onPendingImportConsumed) onPendingImportConsumed();
      } catch (err) {
        console.error('[pending import]', err);
      }
    }
  }, [pendingImportData, events]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate all drafts upfront (per-event + cross-event)
  const validations = useMemo(() => {
    const map = {};
    // Per-event validation
    for (const draft of drafts) {
      const id = draft._draft?.id;
      if (id) map[id] = validateEvent(draft);
    }
    // Cross-event world validation
    const answers = loadAnswers(worldSlug);
    const worldResult = validateWorld(drafts, answers);
    // Merge world-level issues into per-event results by d-tag
    const dTagToId = {};
    for (const draft of drafts) {
      const dTag = getTagValue(draft, 'd');
      const id = draft._draft?.id;
      if (dTag && id) dTagToId[dTag] = id;
    }
    for (const issue of worldResult.errors) {
      const id = dTagToId[issue.dTag];
      if (id && map[id]) {
        map[id].errors.push(issue);
        map[id].valid = false;
      }
    }
    for (const issue of worldResult.warnings) {
      const id = dTagToId[issue.dTag];
      if (id && map[id]) {
        map[id].warnings.push(issue);
      }
    }
    for (const issue of (worldResult.hints || [])) {
      const id = dTagToId[issue.dTag];
      if (id && map[id]) {
        if (!map[id].hints) map[id].hints = [];
        map[id].hints.push(issue);
      }
    }
    return { map, puzzlesToVerify: worldResult.puzzlesToVerify || [], dTagToId };
  }, [drafts, worldSlug]);

  // Async puzzle hash verification
  useEffect(() => {
    if (validations.puzzlesToVerify.length === 0) return;
    verifyPuzzleHashes(validations.puzzlesToVerify).then((hashErrors) => {
      if (hashErrors.length === 0) return;
      // Merge hash errors into validation map
      for (const issue of hashErrors) {
        const id = validations.dTagToId[issue.dTag];
        if (id && validations.map[id]) {
          validations.map[id].errors.push(issue);
          validations.map[id].valid = false;
        }
      }
      // Force re-render
      setConfirmDelete((prev) => prev);
    });
  }, [validations.puzzlesToVerify]); // eslint-disable-line react-hooks/exhaustive-deps

  // Import preview is showing — render that instead
  if (importPreview) {
    return (
      <ImportPreviewPanel
        zIndex={zIndex ? zIndex + 10 : 60}
        validation={importPreview.validation}
        onConfirm={() => {
          // Import only the valid events
          onImport({ events: importPreview.validation.valid, answers: importPreview.data.answers || {} });
          setImportPreview(null);
        }}
        onClose={() => setImportPreview(null)}
      />
    );
  }

  return (
    <DOSPanel title="DRAFTS" onClose={onClose} minWidth="30em" zIndex={zIndex} noPadding>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(80vh - 6em)', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, padding: '0.5rem 0.75rem 0' }}>
      {drafts.length === 0 && (
        <div style={{ color: 'var(--colour-dim)' }}>No drafts yet.</div>
      )}

      {drafts.map((draft) => {
        const id = draft._draft?.id;
        const eventType = getTagValue(draft, 'type') || '?';
        const title = getTagValue(draft, 'title') || getTagValue(draft, 'd') || 'untitled';
        const validation = validations.map[id];
        const isValid = validation?.valid;
        const hasWarnings = validation?.warnings?.length > 0;
        const isExpanded = expandedValidation === id;

        return (
          <div key={id} style={{ borderBottom: '1px solid var(--colour-dim)' }}>
            <div className="flex items-center gap-2 py-1">
              {/* Validation indicator — click to expand details */}
              <span
                className="shrink-0 cursor-pointer"
                style={{
                  color: !isValid ? 'var(--colour-error)' : hasWarnings ? 'var(--colour-dim)' : 'var(--colour-highlight)',
                  fontSize: '0.7rem',
                  width: '1em',
                  textAlign: 'center',
                }}
                onClick={() => setExpandedValidation(isExpanded ? null : id)}
                title={!isValid ? 'Has errors — click for details' : hasWarnings ? 'Has warnings — click for details' : 'Valid'}
              >
                {!isValid ? '✗' : hasWarnings ? '⚠' : '✓'}
              </span>

              <span
                className="shrink-0 px-1"
                style={{ color: 'var(--colour-dim)', fontSize: '0.6rem' }}
              >
                [{eventType}]
              </span>
              <span className="flex-1 truncate" style={{ color: 'var(--colour-text)' }}>
                {title}
              </span>

              {confirmDelete === id ? (
                <span className="flex gap-1 items-center">
                  <span style={{ color: 'var(--colour-error)', fontSize: '0.6rem' }}>Delete?</span>
                  <DOSButton onClick={() => { onDelete(id); setConfirmDelete(null); }} colour="error">
                    Yes
                  </DOSButton>
                  <DOSButton onClick={() => setConfirmDelete(null)} colour="dim">
                    No
                  </DOSButton>
                </span>
              ) : confirmPublish === id ? (
                <span className="flex gap-1 items-center">
                  <span style={{ color: 'var(--colour-error)', fontSize: '0.6rem' }}>Publish?</span>
                  <DOSButton onClick={() => { onPublish(draft); setConfirmPublish(null); }} colour="error">
                    Yes
                  </DOSButton>
                  <DOSButton onClick={() => setConfirmPublish(null)} colour="dim">
                    No
                  </DOSButton>
                </span>
              ) : (
                <span className="flex gap-1">
                  <DOSButton onClick={() => onEdit(draft)} colour="text">
                    Edit
                  </DOSButton>
                  <DOSButton onClick={() => setConfirmPublish(id)} colour="highlight" disabled={!isValid}>
                    Pub
                  </DOSButton>
                  <DOSButton onClick={() => setConfirmDelete(id)} colour="error">
                    Del
                  </DOSButton>
                </span>
              )}
            </div>

            {/* Expanded validation details */}
            {isExpanded && validation && (
              <div className="pb-1 pl-4" style={{ fontSize: '0.6rem' }}>
                {validation.errors.map((err, i) => (
                  <div key={`e${i}`} style={{ color: 'var(--colour-error)' }}>✗ {err.message}</div>
                ))}
                {validation.warnings?.map((warn, i) => (
                  <div key={`w${i}`} style={{ color: 'var(--colour-dim)' }}>⚠ {warn.message}</div>
                ))}
                {validation.hints?.map((hint, i) => (
                  <div key={`h${i}`} style={{ color: 'var(--colour-muted, #666)' }}>💡 {hint.message}</div>
                ))}
                {isValid && !hasWarnings && (
                  <div style={{ color: 'var(--colour-highlight)' }}>✓ Ready to publish</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      </div>{/* end scrollable list */}
      <div className="flex gap-2 flex-wrap shrink-0" style={{ borderTop: '1px solid var(--colour-dim)', padding: '0.5rem 0.75rem' }}>
        {/* Import */}
        <DOSButton onClick={() => fileRef.current?.click()} colour="dim">
          Import
        </DOSButton>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const data = parseJsonLenient(reader.result);
                  const publishedArr = events instanceof Map ? [...events.entries()].filter(([, e]) => !e._isDraft) : [];
                  const validation = validateImport(worldSlug, data, publishedArr);
                  // Run per-event validation — surface issues as warnings
                  for (const event of validation.valid) {
                    const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] || '?';
                    const result = validateEvent(event);
                    for (const issue of result.errors) {
                      validation.warnings.push(`${dTag}: ${issue.message}`);
                    }
                    for (const issue of result.warnings) {
                      validation.warnings.push(`${dTag}: ${issue.message}`);
                    }
                  }
                  // Run cross-event validation on combined set (published + drafts + new imports, deduped by d-tag)
                  const seen = new Set();
                  const combinedEvents = [];
                  // New imports take priority, then drafts, then published
                  for (const ev of [...validation.valid, ...drafts, ...(events ? [...events.values()] : [])]) {
                    const d = ev.tags?.find((t) => t[0] === 'd')?.[1];
                    if (d && !seen.has(d)) { seen.add(d); combinedEvents.push(ev); }
                  }
                  const answers = { ...loadAnswers(worldSlug), ...(data.answers || {}) };
                  const worldResult = validateWorld(combinedEvents, answers);
                  // Merge world warnings into import warnings
                  for (const issue of worldResult.warnings) {
                    validation.warnings.push(`${issue.dTag}: ${issue.message}`);
                  }
                  for (const issue of worldResult.errors) {
                    validation.warnings.push(`⚠ ${issue.dTag}: ${issue.message}`);
                  }
                  // Surface hints separately
                  if (!validation.hints) validation.hints = [];
                  for (const issue of (worldResult.hints || [])) {
                    validation.hints.push(`💡 ${issue.dTag}: ${issue.message}`);
                  }
                  setImportPreview({ validation, data });
                } catch {
                  // Invalid JSON — ignore
                }
              };
              reader.readAsText(file);
            }
            e.target.value = '';
          }}
        />

        {/* Export */}
        {drafts.length > 0 && (
          <DOSButton onClick={onExport} colour="dim">
            Export
          </DOSButton>
        )}

        {/* Import Scenarios */}
        {onImportScenarios && (
          <>
            <input
              ref={scenarioFileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const data = JSON.parse(ev.target.result);
                    onImportScenarios(data);
                  } catch { alert('Invalid JSON'); }
                  e.target.value = '';
                };
                reader.readAsText(file);
              }}
            />
            <DOSButton onClick={() => scenarioFileRef.current?.click()} colour="dim">
              Import Scenarios
            </DOSButton>
          </>
        )}

        {/* Publish failure warning */}
        {publishStatus?.failed > 0 && !publishProgress && (
          <div style={{ fontSize: '0.6rem', color: 'var(--colour-error)', marginBottom: '0.25rem' }}>
            ⚠ Last publish: {publishStatus.failed}/{publishStatus.total} failed
            {Object.keys(publishStatus.relayErrors || {}).length > 0 && (
              <span style={{ color: 'var(--colour-dim)' }}>
                {' '}({Object.entries(publishStatus.relayErrors).map(([url, n]) => {
                  try { return `${new URL(url).hostname}: ${n}`; } catch { return `${url}: ${n}`; }
                }).join(', ')})
              </span>
            )}
            {' — '}republish to retry
          </div>
        )}

        {/* Bulk publish */}
        {drafts.length > 0 && (
          <DOSButton
            onClick={() => { setConfirmPublishAll(true); setConfirmDeleteAll(false); }}
            colour={publishProgress ? 'dim' : 'highlight'}
            disabled={!!publishProgress}
          >
            Publish All ({drafts.length})
          </DOSButton>
        )}

        {/* Delete all */}
        {drafts.length > 0 && (
          <DOSButton
            onClick={() => { setConfirmDeleteAll(true); setConfirmPublishAll(false); }}
            colour={publishProgress ? 'dim' : 'error'}
            disabled={!!publishProgress}
          >
            Delete All
          </DOSButton>
        )}

        {/* Confirmation rows — below the buttons */}
        {confirmPublishAll && !publishProgress && (
          <div className="flex gap-1 items-center mt-1" style={{ fontSize: '0.65rem' }}>
            <span style={{ color: 'var(--colour-error)' }}>
              Publish {drafts.length} events to relays?
            </span>
            <DOSButton onClick={() => {
              setConfirmPublishAll(false);
              setPublishProgress({ total: drafts.length, published: 0, failed: 0 });
              onBulkPublish((progress) => {
                setPublishProgress(progress);
                if (progress.published + progress.failed >= progress.total) {
                  setTimeout(() => setPublishProgress(null), 1500);
                }
              });
            }} colour="error">
              Yes
            </DOSButton>
            <DOSButton onClick={() => setConfirmPublishAll(false)} colour="dim">
              No
            </DOSButton>
          </div>
        )}
        {publishProgress && (
          <div className="mt-1" style={{ fontSize: '0.65rem' }}>
            <div style={{ color: 'var(--colour-dim)', marginBottom: '0.25rem' }}>
              Publishing {publishProgress.published}/{publishProgress.total}...
            </div>
            <div style={{
              background: 'var(--colour-bg, #000)',
              height: '0.5rem',
              width: '100%',
              border: '1px solid var(--colour-text)',
            }}>
              <div style={{
                background: publishProgress.failed > 0 ? 'var(--colour-error)' : 'var(--colour-highlight)',
                height: '100%',
                width: `${Math.round(((publishProgress.published + publishProgress.failed) / publishProgress.total) * 100)}%`,
                transition: 'width 0.2s',
              }} />
            </div>
          </div>
        )}
        {confirmDeleteAll && (
          <div className="flex gap-1 items-center mt-1" style={{ fontSize: '0.65rem' }}>
            <span style={{ color: 'var(--colour-error)' }}>
              Delete all {drafts.length} drafts?
            </span>
            <DOSButton onClick={() => { onDeleteAll(); setConfirmDeleteAll(false); }} colour="error">
              Yes
            </DOSButton>
            <DOSButton onClick={() => setConfirmDeleteAll(false)} colour="dim">
              No
            </DOSButton>
          </div>
        )}
      </div>{/* end footer */}
      </div>{/* end flex wrapper */}
    </DOSPanel>
  );
}
