'use client'

/**
 * Week/day time grid on the UI SDK span engine (XER-549).
 *
 * `createSpans` from `@ui-sdk/core` owns the drag math (draw on an empty track,
 * move a block, resize from an edge, keyboard move/resize, announcements,
 * auto-scroll). We only supply the geometry (a day is 0–1440 minutes, one track
 * per column) and the data projection from occurrences. `stackSpans` supplies
 * the lane each overlapping event draws in, so overlaps split the column width
 * instead of colliding.
 *
 * Nothing here renders a look: the parts are plain elements styled from
 * `calendar.css` with the app's `--cx-*` tokens.
 */
import { createChange, createSpans, definePrimitive, stackSpans, type SpansDraft } from '@ui-sdk/core'
import { createParts } from '@ui-sdk/react/primitive'
import { DAY_MINUTES, GRID_STEP, spanTimeLabel, type EventSpan } from '~/lib/span-model'

export type SpanChangeAction = 'draw' | 'move' | 'resize' | 'delete'

export interface WeekGridOptions {
  /** The spans to draw, projected from the occurrences on screen. */
  spans?: EventSpan[]
  /** The track keys on the grid, in visual order (day ISO strings). */
  days?: string[]
  /** Snap + keyboard step, in minutes. */
  step?: number
  /** What the grid announces per change; defaults to English in the SDK. */
  onSpansChange?: (
    spans: EventSpan[],
    details: { id: string; action: SpanChangeAction; reason: string; event?: Event },
  ) => void
}

interface WeekGridState {
  spans: EventSpan[]
  draft: SpansDraft<EventSpan> | null
}

let drawn = 0

const weekGrid = definePrimitive({
  name: 'cx-week-grid',
  options: {
    spans: 'value',
    days: 'list',
    step: 'number',
    onSpansChange: 'callback',
  },
  controlled: ['spans'],
  state: (options: WeekGridOptions) => ({
    spans: options.spans ?? [],
    draft: null,
  }),
  sync: (options) => ({ spans: options.spans ?? [] }),
  api: (context) => {
    const change = createChange(context)
    const spans = createSpans<WeekGridState, EventSpan>(context, {
      key: 'spans',
      draft: 'draft',
      axis: 'y',
      min: () => 0,
      max: () => DAY_MINUTES,
      step: () => context.options().step ?? GRID_STEP,
      minSize: () => GRID_STEP,
      overlap: true,
      tracks: () => context.options().days ?? [],
      // A drag on empty grid starts a real event. The dialog opens on the new
      // block (see TimeGrid), so the summary can be filled in before it is saved.
      create: (span) => ({
        ...span,
        id: `new-${++drawn}`,
        summary: 'New event',
        color: '#6366f1',
        kind: 'event',
        locked: false,
      }),
      // A click (no drag) makes a half-hour event, the sink's default.
      size: () => 30,
      disabled: (span) => span.locked,
      label: (span) => `${span.summary}, ${spanTimeLabel(span.start)} to ${spanTimeLabel(span.end)}`,
      createAutoScroll: { edge: 48 },
      set: (value, details) =>
        change('spans', value, {
          reason: details.reason,
          event: details.event,
          id: details.id,
          action: details.action,
        }),
    })
    return { spans }
  },
  slots: (slot) => ({
    grid: slot({}),
    track: slot<{ value: string }>({
      props: { value: 'string' },
      bind: (el, part) => part.api.spans.bindTrack(el, part.key),
      on: {
        pointerdown: (event, { api, key }) => api.spans.trackPointerdown(event, key),
      },
    }),
    span: slot<{ value: string }>({
      props: { value: 'string' },
      attrs: (state, { api, key }) => {
        const span = api.spans.spans(state).find((s) => s.id === key)
        if (!span) return {}
        const lanes = stackSpans(api.spans.spansOn(state, span.track))
        return {
          ...api.spans.spanAttrs(state, key),
          role: 'button',
          tabindex: '0',
          title: `${spanTimeLabel(span.start)} – ${spanTimeLabel(span.end)} ${span.summary}`,
          'aria-label': `${span.summary}, ${spanTimeLabel(span.start)} to ${spanTimeLabel(span.end)}`,
          'data-kind': span.kind,
          'data-locked': span.locked ? '' : undefined,
          'data-color': span.color,
          style: api.spans.spanStyle(span, lanes.get(span.id)),
        }
      },
      bind: (el, part) => part.api.spans.bindSpan(el, part.key),
      on: {
        pointerdown: (event, { api, key }) => api.spans.spanPointerdown(event, key),
        keydown: (event, { api, key }) => {
          api.spans.keydown(event, key)
        },
      },
    }),
  }),
})

export const { Root: WeekGrid, Grid: WeekGridCanvas, Track: WeekGridTrack, Span: WeekGridSpan } = createParts(weekGrid, {
  grid: 'div',
  track: 'div',
  span: 'div',
})

export type { EventSpan }
