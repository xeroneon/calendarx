/**
 * Calendar server functions — the web app's proxy to the CalendarX server's
 * `/api/calendar` (XER-79, extracted to CalendarX). Runs in the TanStack Start
 * web server and calls the typed SDK client, exactly like the cloud original.
 */
import { createServerFn } from '@tanstack/react-start'
import type { CalendarCollection, CalendarEvent, CalendarItem, CalendarTask, Occurrence } from '@calendax/sdk'
import { clientFor } from './api'

export const DEFAULT_CAL_KEY = 'main'

/** List named calendar collections. */
export const listCalendars = createServerFn({ method: 'GET' })
  .validator((d: Record<string, never>) => d)
  .handler(async (_ctx: { context?: unknown }): Promise<CalendarCollection[]> => {
    const { calendars } = await clientFor().calendar.listCalendars()
    return calendars
  })

/** List items in a calendar (optionally filtered by kind). */
export const listItems = createServerFn({ method: 'GET' })
  .validator((d: { key: string; kind?: 'event' | 'task' | 'all' }) => d)
  .handler(async (_ctx: { context?: unknown; data: { key: string; kind?: 'event' | 'task' | 'all' } }): Promise<{ calendar: CalendarCollection; items: CalendarItem[] }> =>
    clientFor().calendar.listItems(_ctx.data.key, _ctx.data.kind ?? 'all'))

/** Create an event or task. */
export const createItem = createServerFn({ method: 'POST' })
  .validator((d: { key: string; item: CalendarEvent | CalendarTask }) => d)
  .handler(async (_ctx: { context?: unknown; data: { key: string; item: CalendarEvent | CalendarTask } }): Promise<CalendarItem> => {
    const { item } = await clientFor().calendar.createItem(_ctx.data.key, _ctx.data.item)
    return item
  })

/** Update an existing item (edit summary, times, recurrence, completion). */
export const updateItem = createServerFn({ method: 'POST' })
  .validator((d: { key: string; uid: string; patch: Partial<CalendarEvent | CalendarTask> }) => d)
  .handler(async (_ctx: { context?: unknown; data: { key: string; uid: string; patch: Partial<CalendarEvent | CalendarTask> } }): Promise<CalendarItem> => {
    const { item } = await clientFor().calendar.updateItem(_ctx.data.key, _ctx.data.uid, _ctx.data.patch)
    return item
  })

/** Delete an item. */
export const deleteItem = createServerFn({ method: 'POST' })
  .validator((d: { key: string; uid: string }) => d)
  .handler(async (_ctx: { context?: unknown; data: { key: string; uid: string } }): Promise<void> => {
    await clientFor().calendar.deleteItem(_ctx.data.key, _ctx.data.uid)
  })

/** Expand recurring items into concrete occurrences over a UTC window. */
export const expand = createServerFn({ method: 'GET' })
  .validator((d: { key: string; start: string; end: string }) => d)
  .handler(async (_ctx: { context?: unknown; data: { key: string; start: string; end: string } }): Promise<Occurrence[]> => {
    const { occurrences } = await clientFor().calendar.expand(_ctx.data.key, _ctx.data.start, _ctx.data.end)
    return occurrences
  })