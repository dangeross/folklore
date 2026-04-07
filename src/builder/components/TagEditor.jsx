/**
 * TagEditor — Data-driven tag editor component.
 *
 * Renders dynamic fields from tagSchema.js based on event type.
 * Supports add/remove tags, field editing, and event-ref search.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TAG_SCHEMAS, TAGS_BY_EVENT_TYPE, getTagSchema, valuesToTag, tagToValues, ACTION_TARGET_FIELD } from '../tagSchema.js';
import DOSButton from './ui/DOSButton.jsx';
import InlineList from './ui/InlineList.jsx';
import { previewSound, playOneShotRef, stopPreview } from '../../services/sound.js';

// Map event types to guide page IDs
const EVENT_TYPE_GUIDE_MAP = {
  world: '01-getting-started',
  place: '01-getting-started',
  portal: '01-getting-started',
  item: '02-items-and-features',
  feature: '02-items-and-features',
  npc: '04-characters',
  dialogue: '04-characters',
  clue: '05-puzzles',
  puzzle: '05-puzzles',
  quest: '06-quests',
  recipe: '09-recipes',
  consequence: '07-combat',
  sound: '08-sound',
  payment: '10-payments',
};

/** Tooltip — styled info icon that shows description on hover */
function Tooltip({ text }) {
  if (!text) return null;
  const [show, setShow] = useState(false);
  const iconRef = useRef(null);
  const [above, setAbove] = useState(true);

  const handleEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setAbove(rect.top > 80); // show below if too close to top
    }
    setShow(true);
  };

  return (
    <span
      ref={iconRef}
      className="inline-block cursor-help ml-1"
      style={{ position: 'relative' }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <span
        style={{
          color: 'var(--colour-dim)',
          fontSize: '0.55rem',
          verticalAlign: 'middle',
        }}
      >
        [?]
      </span>
      {show && (
        <span
          style={{
            position: 'absolute',
            ...(above
              ? { bottom: '120%' }
              : { top: '120%' }),
            left: 0,
            backgroundColor: 'var(--colour-bg)',
            border: '1px solid var(--colour-dim)',
            color: 'var(--colour-text)',
            padding: '4px 8px',
            fontSize: '0.6rem',
            minWidth: '200px',
            maxWidth: '320px',
            whiteSpace: 'normal',
            zIndex: 20,
            lineHeight: '1.3',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** Returns the guide page URL for an event type, or null */
function getGuideUrl(eventType) {
  const pageId = EVENT_TYPE_GUIDE_MAP[eventType];
  return pageId ? `/guide/${pageId}` : null;
}

export { Tooltip, getGuideUrl };

/** Input styled for DOS aesthetic */
function DOSInput({ value, onChange, placeholder, type = 'text', className = '', style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      {...(type === 'number' ? { step: 'any' } : {})}
      className={`bg-transparent outline-none font-mono text-xs px-1 ${className}`}
      style={{
        color: 'var(--colour-text)',
        border: '1px solid var(--colour-dim)',
        width: '100%',
        ...style,
      }}
    />
  );
}

function DOSTextarea({ value, onChange, placeholder, rows = 3, style = {} }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="bg-transparent outline-none font-mono text-xs px-1 w-full resize-y"
      style={{
        color: 'var(--colour-text)',
        border: '1px solid var(--colour-dim)',
        ...style,
      }}
    />
  );
}

/** Themed dropdown replacing native <select> — portaled to float above panel */
// Unique ID counter for dropdown instances
let dropdownIdCounter = 0;

function DOSSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState(null);
  const instanceId = useRef(++dropdownIdCounter);

  // Reposition on open, scroll, and resize
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    function updatePos() {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ left: rect.left, bottom: window.innerHeight - rect.top, width: rect.width });
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  // Close when another dropdown opens
  useEffect(() => {
    function onOtherOpen(e) {
      if (e.detail !== instanceId.current) setOpen(false);
    }
    document.addEventListener('dropdown-open', onOtherOpen);
    return () => document.removeEventListener('dropdown-open', onOtherOpen);
  }, []);

  // Broadcast open
  useEffect(() => {
    if (open) document.dispatchEvent(new CustomEvent('dropdown-open', { detail: instanceId.current }));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <>
      <div
        ref={triggerRef}
        className="flex items-center cursor-pointer px-1 w-full"
        style={{ border: '1px solid var(--colour-dim)', minHeight: '1.5em' }}
        onClick={() => setOpen(!open)}
      >
        <span className="flex-1 text-xs truncate" style={{ color: value ? 'var(--colour-text)' : 'var(--colour-dim)' }}>
          {value || placeholder || 'Select...'}
        </span>
        <span style={{ color: 'var(--colour-dim)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && pos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="font-mono text-xs"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: pos.left,
            bottom: pos.bottom,
            width: pos.width,
            backgroundColor: 'var(--colour-bg)',
            border: '1px solid var(--colour-dim)',
            maxHeight: '12em',
            overflowY: 'auto',
            zIndex: 1200,
            boxShadow: '2px -2px 0 var(--colour-dim)',
          }}
        >
          {placeholder && (
            <div
              className="px-1 py-0.5 cursor-pointer hover:opacity-80"
              style={{ color: 'var(--colour-dim)' }}
              onClick={() => { onChange(''); setOpen(false); }}
            >
              {placeholder}
            </div>
          )}
          {options.map((opt) => (
            <div
              key={opt}
              className="px-1 py-0.5 cursor-pointer hover:opacity-80"
              style={{
                color: opt === value ? 'var(--colour-highlight)' : 'var(--colour-text)',
                backgroundColor: opt === value ? 'var(--colour-dim)' : 'transparent',
              }}
              onClick={() => { onChange(opt); setOpen(false); }}
            >
              {opt}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

/** Event ref selector — searchable dropdown portaled to float above panel */
function EventRefSelect({ value, onChange, events, eventTypeFilter, placeholder: placeholderProp, prefixOptions = [] }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState(null);
  const instanceId = useRef(++dropdownIdCounter);

  // Reposition on open, scroll, and resize
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    function updatePos() {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ left: rect.left, bottom: window.innerHeight - rect.top, width: rect.width });
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  // Close when another dropdown opens
  useEffect(() => {
    function onOtherOpen(e) {
      if (e.detail !== instanceId.current) setOpen(false);
    }
    document.addEventListener('dropdown-open', onOtherOpen);
    return () => document.removeEventListener('dropdown-open', onOtherOpen);
  }, []);

  // Broadcast open
  useEffect(() => {
    if (open) document.dispatchEvent(new CustomEvent('dropdown-open', { detail: instanceId.current }));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const options = useMemo(() => {
    if (!events) return [];
    const results = [];
    for (const [aTag, event] of events) {
      const typeTag = event.tags.find((t) => t[0] === 'type')?.[1];
      if (typeTag === 'player-state') continue;
      if (eventTypeFilter && typeTag !== eventTypeFilter) continue;
      const title = event.tags.find((t) => t[0] === 'title')?.[1] || '';
      const dTag = event.tags.find((t) => t[0] === 'd')?.[1] || '';
      results.push({ aTag, title, dTag, type: typeTag });
    }
    results.sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.title || '').localeCompare(b.title || ''));
    return results;
  }, [events, eventTypeFilter]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) =>
      o.title.toLowerCase().includes(q) ||
      o.dTag.toLowerCase().includes(q) ||
      o.aTag.toLowerCase().includes(q)
    );
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const found = options.find((o) => o.aTag === value);
    // Check prefix options first
    const prefixMatch = prefixOptions.find((p) => p.value === value);
    if (prefixMatch) return prefixMatch.label;
    return found ? `${found.title || found.dTag}` : value.split(':').slice(2).join(':');
  }, [value, options, prefixOptions]);

  return (
    <>
      <div
        ref={triggerRef}
        className="flex items-center cursor-pointer px-1 w-full"
        style={{ border: '1px solid var(--colour-dim)', minHeight: '1.5em' }}
        onClick={() => setOpen(!open)}
      >
        <span className="flex-1 text-xs truncate" style={{ color: value ? 'var(--colour-text)' : 'var(--colour-dim)' }}>
          {selectedLabel || placeholderProp || 'Select event...'}
        </span>
        <span style={{ color: 'var(--colour-dim)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && pos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="font-mono text-xs"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: pos.left,
            bottom: pos.bottom,
            width: pos.width,
            backgroundColor: 'var(--colour-bg)',
            border: '1px solid var(--colour-dim)',
            maxHeight: '12em',
            overflowY: 'auto',
            zIndex: 1200,
            boxShadow: '2px -2px 0 var(--colour-dim)',
          }}
        >
          <DOSInput
            value={search}
            onChange={setSearch}
            placeholder="Search..."
            style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
          />
          {prefixOptions.map((popt) => (
            <div
              key={popt.value}
              className="px-1 py-0.5 cursor-pointer hover:opacity-80"
              style={{
                color: popt.value === value ? 'var(--colour-highlight)' : 'var(--colour-text)',
                backgroundColor: popt.value === value ? 'var(--colour-dim)' : 'transparent',
                borderBottom: '1px solid var(--colour-dim)',
              }}
              onClick={() => { onChange(popt.value); setOpen(false); setSearch(''); }}
            >
              {popt.label}
            </div>
          ))}
          {filtered.length === 0 && prefixOptions.length === 0 && (
            <div className="px-1 py-1" style={{ color: 'var(--colour-dim)' }}>No matches</div>
          )}
          {filtered.map((opt) => (
            <div
              key={opt.aTag}
              className="px-1 py-0.5 cursor-pointer hover:opacity-80"
              style={{
                color: opt.aTag === value ? 'var(--colour-highlight)' : 'var(--colour-text)',
                backgroundColor: opt.aTag === value ? 'var(--colour-dim)' : 'transparent',
              }}
              onClick={() => { onChange(opt.aTag); setOpen(false); setSearch(''); }}
            >
              <span style={{ color: opt.aTag === value ? 'var(--colour-bg)' : 'var(--colour-dim)' }}>[{opt.type}]</span> {opt.title || opt.dTag}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

/** Compute exit slots already used by portal events for a given place ref */
function getUsedSlots(placeRef, events) {
  if (!placeRef || !events) return [];
  const used = new Set();
  for (const [, ev] of events) {
    const type = ev.tags?.find((t) => t[0] === 'type')?.[1];
    if (type !== 'portal') continue;
    const exits = ev.tags.filter((t) => t[0] === 'exit');
    const matchesPlace = exits.some((e) => e[1] === placeRef);
    if (!matchesPlace) continue;
    for (const e of exits) {
      if (e[1] === placeRef && e[2]) used.add(e[2]);
    }
  }
  return [...used];
}

/** Render a single field based on its type */
function TagField({ field, value, onChange, events, tagName, siblingValues }) {
  // Special case: exit slot on portals shows free slots when place is selected
  if (tagName === 'exit' && field.name === 'slot' && siblingValues?.['place-ref'] && events) {
    const placeRef = siblingValues['place-ref'];
    const placeEvent = events.get(placeRef);
    if (placeEvent) {
      // Collect all slots defined on the place event
      const placeSlots = [];
      for (const t of placeEvent.tags.filter((t) => t[0] === 'exit')) {
        if (t[1] && !t[1].startsWith('30078:')) placeSlots.push(t[1]); // slot-only: ["exit", "north"]
        else if (t[2]) placeSlots.push(t[2]); // extended: ["exit", "30078:...", "north", "label"]
      }
      // Filter out slots already used by portals
      const usedSlots = getUsedSlots(placeRef, events);
      const freeSlots = placeSlots.filter((s) => !usedSlots.includes(s));
      if (freeSlots.length > 0 || value) {
        const slots = [...freeSlots];
        if (value && !slots.includes(value)) slots.unshift(value);
        return <DOSSelect value={value} onChange={onChange} options={slots} />;
      }
    }
  }

  switch (field.type) {
    case 'text':
      return <DOSInput value={value} onChange={onChange} placeholder={field.placeholder} />;
    case 'aliases': {
      const items = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
      return (
        <InlineList
          compact
          items={items}
          onChange={(newItems) => onChange(newItems.join(', '))}
          placeholder={field.placeholder || 'Add alias...'}
        />
      );
    }
    case 'number':
      return <DOSInput value={value} onChange={onChange} placeholder={field.placeholder} type="number" />;
    case 'textarea':
      return <DOSTextarea value={value} onChange={onChange} placeholder={field.placeholder} />;
    case 'select':
      return <DOSSelect value={value} onChange={onChange} options={field.options} placeholder="Select..." />;
    case 'event-ref':
      return <EventRefSelect value={value} onChange={onChange} events={events} eventTypeFilter={field.eventTypeFilter} placeholder={field.placeholder} prefixOptions={field.prefixOptions || []} />;
    default:
      return <DOSInput value={value} onChange={onChange} placeholder={field.placeholder} />;
  }
}

/**
 * Resolve dynamic field override for trigger target fields.
 * When a trigger tag has an 'action' select, the 'target' field adapts
 * its type and placeholder based on the selected action.
 */
function resolveField(field, fieldName, values) {
  const action = values.action;
  if (!action) return field;
  const override = ACTION_TARGET_FIELD[action];
  if (!override) return field;
  if (fieldName === 'event-ref' && override.eventRefOverride) {
    return { ...field, ...override.eventRefOverride };
  }
  if (fieldName !== 'target') return field;
  return { ...field, type: override.type, placeholder: override.placeholder, eventTypeFilter: override.eventTypeFilter };
}

/** Check if the event-ref field should be hidden based on the selected action */
function shouldHideField(field, values) {
  if (field.hidden) return true;
  if (field.name !== 'event-ref') return false;
  const action = values.action;
  if (!action) return false;
  const override = ACTION_TARGET_FIELD[action];
  return override?.hidesEventRef === true;
}

/** Drag handle for sortable tag rows */
function DragHandle({ listeners, attributes, disabled }) {
  return (
    <span
      {...listeners}
      {...attributes}
      className="shrink-0 inline-flex items-center"
      style={{
        color: disabled ? 'transparent' : 'var(--colour-dim)',
        cursor: disabled ? 'default' : 'grab',
        fontSize: '0.75rem',
        lineHeight: 1,
        padding: '0 2px',
        marginTop: '3px',
        touchAction: 'none',
        userSelect: 'none',
      }}
      title={disabled ? '' : 'Drag to reorder'}
    >
      ⠿
    </span>
  );
}

/** Sortable wrapper for tag rows */
function SortableTagItem({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ listeners, attributes, isDragging })}
    </div>
  );
}

/** Play button for sound-ref tags — resolves ref, plays loop or one-shot based on role */
function SoundRefPlayButton({ soundRef, role, volume, events }) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => { stopPreview(); }, []);

  if (!soundRef) return null;

  const isLoop = role === 'ambient' || role === 'layer' || !role;

  const handleClick = async () => {
    if (playing) {
      stopPreview();
      setPlaying(false);
      return;
    }
    if (isLoop) {
      const soundEvent = events?.get(soundRef);
      if (!soundEvent) return;
      const ok = await previewSound(soundEvent.tags);
      setPlaying(ok);
    } else {
      const vol = parseFloat(volume) || 1.0;
      await playOneShotRef(soundRef, vol);
    }
  };

  return (
    <button
      onClick={handleClick}
      title={playing ? 'Stop' : isLoop ? 'Preview (loop)' : 'Preview (once)'}
      style={{
        color: playing ? 'var(--colour-error)' : 'var(--colour-highlight)',
        background: 'none',
        border: '1px solid currentColor',
        font: 'inherit',
        fontSize: '0.6rem',
        padding: '1px 4px',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {playing ? '■' : '▶'}
    </button>
  );
}

function TagRow({ tagName, tag, fields, onChange, onRemove, dragListeners, dragAttributes, dragDisabled, events }) {
  const values = tagToValues(tag, fields);
  const schemaDesc = TAG_SCHEMAS[tagName]?.desc;

  function updateField(fieldName, newValue) {
    const updated = { ...values, [fieldName]: newValue };
    onChange(valuesToTag(tagName, updated, fields));
  }

  return (
    <div className="flex gap-1 items-start mb-1">
      <DragHandle listeners={dragListeners} attributes={dragAttributes} disabled={dragDisabled} />
      <span
        className="shrink-0 px-1 mt-0.5 flex flex-col items-start gap-0.5"
        style={{ color: 'var(--colour-text)', minWidth: '8em', fontSize: '0.65rem' }}
      >
        <span>{tagName}<Tooltip text={schemaDesc} /></span>
        {tagName === 'sound' && (
          <SoundRefPlayButton
            soundRef={values['sound-ref']}
            role={values['role']}
            volume={values['volume']}
            events={events}
          />
        )}
        {values.action === 'sound' && values.target?.startsWith('30078:') && (
          <SoundRefPlayButton
            soundRef={values.target}
            role="effect"
            volume="1"
            events={events}
          />
        )}
      </span>
      <div className="flex-1 flex flex-col gap-0.5">
        {fields.map((field) => {
          if (shouldHideField(field, values)) return null;
          const resolved = resolveField(field, field.name, values);
          return (
            <div key={field.name}>
              <TagField
                field={resolved}
                value={values[field.name] || ''}
                onChange={(v) => updateField(field.name, v)}
                events={events}
                tagName={tagName}
                siblingValues={values}
              />
            </div>
          );
        })}
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 cursor-pointer mt-0.5"
        style={{ color: 'var(--colour-error)', background: 'none', border: 'none', font: 'inherit', padding: '0 2px' }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * TagEditor component.
 *
 * @param {Object} props
 * @param {string} props.eventType - e.g. 'place', 'portal'
 * @param {string[][]} props.tags - current tag arrays
 * @param {function} props.onChange - called with updated tags array
 * @param {Map} props.events - known events for event-ref dropdowns
 */
// Logical ordering for sound event tags — groups from most to least commonly used
const SOUND_TAG_ORDER = [
  // Source (locked at top by schema)
  'note', 's', 'oscillator', 'noise',
  // Core playback
  'gain', 'slow', 'fast', 'pan',
  // Envelope
  'attack', 'sustain', 'decay', 'release',
  // Filters
  'lpf', 'hpf', 'vowel', 'bpf', 'bpq', 'lpq', 'hpq', 'ftype',
  // Distortion / bit
  'crush', 'shape', 'distort', 'coarse',
  // Reverb
  'room', 'roomsize', 'roomfade', 'roomlp', 'roomdim',
  // Delay
  'delay', 'delaytime', 'delayfeedback',
  // Effects
  'rev', 'palindrome', 'jux', 'arp', 'degrade-by',
  // Phaser
  'phaser', 'phaserdepth', 'phasercenter', 'phasersweep',
  // Sample control
  'n', 'begin', 'end', 'speed', 'cut', 'loop', 'loop-begin', 'loop-end', 'loop-at',
  'clip', 'chop', 'striate', 'fit',
  // LP envelope
  'lpenv', 'lpattack', 'lpdecay', 'lpsustain', 'lprelease',
  // HP envelope
  'hpenv', 'hpattack', 'hpdecay', 'hpsustain', 'hprelease',
  // BP envelope
  'bpenv', 'bpattack', 'bpdecay', 'bpsustain', 'bprelease',
  // Pitch envelope
  'penv', 'pattack', 'pdecay', 'prelease', 'pcurve', 'panchor', 'fanchor',
  // FM synthesis
  'fm', 'fmh', 'fmattack', 'fmdecay', 'fmsustain', 'fmenv',
  // Vibrato / tremolo
  'vib', 'vibmod', 'tremolodepth', 'tremolosync', 'tremoloskew', 'tremolophase', 'tremoloshape',
  // Advanced / misc
  'postgain', 'velocity', 'compressor', 'orbit', 'dry', 'xfade', 'early', 'late',
  'swing', 'iter', 'ply',
];

function soundTagOrder(name) {
  const i = SOUND_TAG_ORDER.indexOf(name);
  return i === -1 ? SOUND_TAG_ORDER.length : i;
}

/** Custom themed dropdown for adding tags — portaled to float above panel */
function AddTagDropdown({ options, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState(null);
  const instanceId = useRef(++dropdownIdCounter);

  // Close when another dropdown opens
  useEffect(() => {
    function onOtherOpen(e) {
      if (e.detail !== instanceId.current) setOpen(false);
    }
    document.addEventListener('dropdown-open', onOtherOpen);
    return () => document.removeEventListener('dropdown-open', onOtherOpen);
  }, []);

  // Broadcast open
  useEffect(() => {
    if (open) document.dispatchEvent(new CustomEvent('dropdown-open', { detail: instanceId.current }));
  }, [open]);

  // Reposition on open, scroll, and resize
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    function updatePos() {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ left: rect.left, bottom: window.innerHeight - rect.top, width: rect.width });
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase();
    return options.filter((name) => {
      if (!q) return true;
      const label = TAG_SCHEMAS[name]?.label || '';
      return name.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    });
  }, [options, search]);

  return (
    <>
      <div
        ref={triggerRef}
        className="flex items-center cursor-pointer px-1 py-0.5"
        style={{
          border: '1px solid var(--colour-dim)',
          color: 'var(--colour-dim)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(!open)}
      >
        <span className="flex-1 text-xs">+ Add tag...</span>
        <span>{open ? '▲' : '▼'}</span>
      </div>

      {open && pos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="font-mono text-xs"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: pos.left,
            bottom: pos.bottom,
            width: pos.width,
            backgroundColor: 'var(--colour-bg)',
            border: '1px solid var(--colour-dim)',
            maxHeight: '16em',
            overflowY: 'auto',
            zIndex: 1200,
            boxShadow: '2px -2px 0 var(--colour-dim)',
          }}
        >
          <DOSInput
            value={search}
            onChange={setSearch}
            placeholder="Search tags..."
            style={{ borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
          />
          {filteredOptions.map((name) => {
            const schema = TAG_SCHEMAS[name];
            const desc = schema?.desc || schema?.label || name;
            return (
              <div
                key={name}
                className="px-1 py-0.5 cursor-pointer hover:opacity-80"
                style={{
                  color: 'var(--colour-text)',
                  backgroundColor: 'transparent',
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { onSelect(name); setOpen(false); setSearch(''); }}
                title={desc}
              >
                <span style={{ color: 'var(--colour-highlight)' }}>{name}</span>
                <span style={{ color: 'var(--colour-dim)', marginLeft: '0.5em', fontSize: '0.6rem' }}>{schema?.label || name}</span>
              </div>
            );
          })}
          {filteredOptions.length === 0 && (
            <div className="px-1 py-1" style={{ color: 'var(--colour-dim)' }}>No matches</div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default function TagEditor({ eventType, tags, onChange, events }) {
  const [tagSearch, setTagSearch] = useState('');

  // Available tags for this event type (excluding auto-managed ones)
  const availableTags = useMemo(() => {
    const allowed = TAGS_BY_EVENT_TYPE[eventType] || [];
    const filtered = allowed.filter((name) => {
      const schema = TAG_SCHEMAS[name];
      if (!schema) return false;
      if (schema.auto) return false; // d, t, type are auto-managed
      // Non-repeatable: only show if not already present
      if (!schema.repeatable && !schema.variants?.place?.repeatable && !schema.variants?.portal?.repeatable) {
        const exists = tags.some((t) => t[0] === name);
        if (exists) return false;
      }
      return true;
    });
    // Sort sound tags alphabetically
    if (eventType === 'sound') {
      filtered.sort((a, b) => a.localeCompare(b));
    }
    return filtered;
  }, [eventType, tags]);

  function canMoveTag(tags, index, direction, evType) {
    if (evType !== 'sound') return true;
    const SOURCES = new Set(['note', 'noise']);
    const tagName = tags[index]?.[0];
    const targetIndex = index + direction;
    // Source tags are locked at position 0
    if (SOURCES.has(tagName)) return false;
    // Non-source tags can't move into position 0 if a source is there
    if (targetIndex === 0 && SOURCES.has(tags[0]?.[0])) return false;
    return true;
  }

  function addTag(tagName) {
    const schema = getTagSchema(tagName, eventType);
    if (!schema) return;
    // Create empty tag with correct number of fields
    const emptyTag = [tagName, ...schema.fields.map(() => '')];
    // Sound source tags (note, noise) must be first
    if (eventType === 'sound' && (tagName === 'note' || tagName === 'noise')) {
      onChange([emptyTag, ...tags]);
    } else {
      onChange([...tags, emptyTag]);
    }
  }

  function updateTag(index, newTag) {
    const updated = [...tags];
    updated[index] = newTag;
    onChange(updated);
  }

  function removeTag(index) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function moveTag(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= tags.length) return;
    // Check sound event constraints
    if (eventType === 'sound') {
      const SOURCES = new Set(['note', 'noise']);
      const tagName = tags[fromIndex]?.[0];
      if (SOURCES.has(tagName)) return; // Source tags locked at 0
      if (toIndex === 0 && SOURCES.has(tags[0]?.[0])) return; // Can't displace source
    }
    const updated = [...tags];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    onChange(updated);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = tagIds.indexOf(active.id);
    const toIndex = tagIds.indexOf(over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    moveTag(fromIndex, toIndex);
  }

  // Stable IDs for sortable — use index-based since tags can repeat
  const tagIds = tags.map((_, i) => `tag-${i}`);

  // Check if a tag at index is drag-disabled (sound source tags)
  function isDragDisabled(index) {
    if (eventType !== 'sound') return false;
    const SOURCES = new Set(['note', 'noise']);
    return SOURCES.has(tags[index]?.[0]);
  }

  const searchActive = eventType === 'sound' && tagSearch.trim().length > 0;

  // When search is active, render filtered plain rows (no drag-and-drop)
  const renderTagRow = (tag, i) => {
    const schema = getTagSchema(tag[0], eventType);
    if (!schema) {
      return (
        <div key={i} className="flex gap-1 items-center mb-1">
          <span className="shrink-0 px-1" style={{ color: 'var(--colour-dim)', minWidth: '8em', fontSize: '0.65rem' }}>
            {tag[0]}
          </span>
          <span className="flex-1 text-xs" style={{ color: 'var(--colour-dim)' }}>
            {tag.slice(1).join(' | ')}
          </span>
          <button
            onClick={() => removeTag(i)}
            className="shrink-0 cursor-pointer"
            style={{ color: 'var(--colour-error)', background: 'none', border: 'none', font: 'inherit', padding: '0 2px' }}
          >
            ×
          </button>
        </div>
      );
    }
    return (
      <TagRow
        key={i}
        tagName={tag[0]}
        tag={tag}
        fields={schema.fields}
        onChange={(newTag) => updateTag(i, newTag)}
        onRemove={() => removeTag(i)}
        dragListeners={null}
        dragAttributes={null}
        dragDisabled={true}
        events={events}
      />
    );
  };

  return (
    <div>
      {/* Tag search — sound events only */}
      {eventType === 'sound' && (
        <div className="mb-2">
          <DOSInput
            value={tagSearch}
            onChange={setTagSearch}
            placeholder="Filter tags..."
          />
        </div>
      )}

      {/* Existing tags */}
      {searchActive ? (
        // Filtered plain list — no drag-and-drop while searching
        <div>
          {tags.map((tag, i) => {
            if (!tag[0].toLowerCase().includes(tagSearch.toLowerCase())) return null;
            return renderTagRow(tag, i);
          })}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tagIds} strategy={verticalListSortingStrategy}>
            {tags.map((tag, i) => {
              const schema = getTagSchema(tag[0], eventType);
              const disabled = isDragDisabled(i);
              if (!schema) {
                return (
                  <SortableTagItem key={tagIds[i]} id={tagIds[i]} disabled={disabled}>
                    {({ listeners, attributes }) => (
                      <div className="flex gap-1 items-center mb-1">
                        <DragHandle listeners={listeners} attributes={attributes} disabled={disabled} />
                        <span className="shrink-0 px-1" style={{ color: 'var(--colour-dim)', minWidth: '8em', fontSize: '0.65rem' }}>
                          {tag[0]}
                        </span>
                        <span className="flex-1 text-xs" style={{ color: 'var(--colour-dim)' }}>
                          {tag.slice(1).join(' | ')}
                        </span>
                        <button
                          onClick={() => removeTag(i)}
                          className="shrink-0 cursor-pointer"
                          style={{ color: 'var(--colour-error)', background: 'none', border: 'none', font: 'inherit', padding: '0 2px' }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </SortableTagItem>
                );
              }
              return (
                <SortableTagItem key={tagIds[i]} id={tagIds[i]} disabled={disabled}>
                  {({ listeners, attributes }) => (
                    <TagRow
                      tagName={tag[0]}
                      tag={tag}
                      fields={schema.fields}
                      onChange={(newTag) => updateTag(i, newTag)}
                      onRemove={() => removeTag(i)}
                      dragListeners={listeners}
                      dragAttributes={attributes}
                      dragDisabled={disabled}
                      events={events}
                    />
                  )}
                </SortableTagItem>
              );
            })}
          </SortableContext>
        </DndContext>
      )}

      {/* Add tag — themed dropdown, adds immediately on selection */}
      {availableTags.length > 0 && (
        <div className="mt-2">
          <AddTagDropdown options={availableTags} onSelect={addTag} />
        </div>
      )}
    </div>
  );
}
