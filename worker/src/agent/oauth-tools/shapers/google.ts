/**
 * Google Response Shaper — Calendar, Drive, Gmail, Sheets.
 * Registered under keys: 'google', 'google-calendar', 'google-sheets'
 */

import type { ShaperResult } from '../response-shaper.js'
import { compacted, passthrough, detectPagination } from '../response-shaper.js'

function compactCalendarEvent(e: Record<string, unknown>): Record<string, unknown> {
  const start = e.start as Record<string, unknown> | undefined
  const end = e.end as Record<string, unknown> | undefined
  const attendees = e.attendees as unknown[] | undefined
  return {
    id: e.id,
    summary: e.summary ?? null,
    start: start?.dateTime ?? start?.date ?? null,
    end: end?.dateTime ?? end?.date ?? null,
    status: e.status ?? null,
    htmlLink: e.htmlLink ?? null,
    attendees_count: attendees?.length ?? 0,
  }
}

function compactDriveFile(f: Record<string, unknown>): Record<string, unknown> {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType ?? null,
    webViewLink: f.webViewLink ?? null,
    modifiedTime: f.modifiedTime ?? null,
  }
}

function compactEmail(e: Record<string, unknown>): Record<string, unknown> {
  const payload = e.payload as Record<string, unknown> | undefined
  const headers = payload?.headers as Array<Record<string, string>> | undefined
  const getHeader = (name: string) => headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null
  return {
    id: e.id,
    threadId: e.threadId ?? null,
    snippet: e.snippet ?? null,
    from: getHeader('from'),
    to: getHeader('to'),
    subject: getHeader('subject'),
    date: getHeader('date'),
  }
}

function compactSpreadsheet(s: Record<string, unknown>): Record<string, unknown> {
  const sheets = s.sheets as Array<Record<string, unknown>> | undefined
  return {
    spreadsheetId: s.spreadsheetId,
    title: (s.properties as Record<string, unknown>)?.title ?? null,
    sheets: sheets?.map(sh => {
      const props = sh.properties as Record<string, unknown> | undefined
      return { sheetId: props?.sheetId, title: props?.title }
    }) ?? [],
  }
}

const CALENDAR_EVENT_ACTIONS = new Set(['list-events', 'list-upcoming-events', 'get-event'])
const DRIVE_FILE_ACTIONS = new Set(['list-files', 'search-files', 'get-file'])
const EMAIL_ACTIONS = new Set(['list-messages', 'search-messages', 'get-message'])
const SPREADSHEET_ACTIONS = new Set(['list-spreadsheets', 'get-spreadsheet'])
const CALENDAR_LIST_ACTIONS = new Set(['list-calendar-list'])

export function shapeGoogleResponse(actionName: string, result: unknown): ShaperResult {
  if (typeof result !== 'object' || result === null) return passthrough(result)
  const data = result as Record<string, unknown>

  if (CALENDAR_EVENT_ACTIONS.has(actionName)) {
    const items = data.items as Record<string, unknown>[] | undefined
    if (Array.isArray(items)) {
      const events = items.map(compactCalendarEvent)
      const pagination = detectPagination(data)
      return compacted(result, { results: events, _compact: true, ...pagination }, events.length)
    }
    // Single event
    if (data.id && data.summary !== undefined) {
      return compacted(result, compactCalendarEvent(data), 1)
    }
  }

  if (DRIVE_FILE_ACTIONS.has(actionName)) {
    const files = (data.files ?? data.items) as Record<string, unknown>[] | undefined
    if (Array.isArray(files)) {
      const items = files.map(compactDriveFile)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
    if (data.id && data.name !== undefined) {
      return compacted(result, compactDriveFile(data), 1)
    }
  }

  if (EMAIL_ACTIONS.has(actionName)) {
    const messages = data.messages as Record<string, unknown>[] | undefined
    if (Array.isArray(messages)) {
      const items = messages.map(compactEmail)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
    if (data.id && data.payload) {
      return compacted(result, compactEmail(data), 1)
    }
  }

  if (SPREADSHEET_ACTIONS.has(actionName)) {
    const files = data.files as Record<string, unknown>[] | undefined
    if (Array.isArray(files)) {
      const items = files.map(compactSpreadsheet)
      const pagination = detectPagination(data)
      return compacted(result, { results: items, _compact: true, ...pagination }, items.length)
    }
    if (data.spreadsheetId) {
      return compacted(result, compactSpreadsheet(data), 1)
    }
  }

  if (CALENDAR_LIST_ACTIONS.has(actionName)) {
    const items = data.items as Record<string, unknown>[] | undefined
    if (Array.isArray(items)) {
      const calItems = items.map(c => ({
        id: c.id,
        summary: c.summary ?? null,
        primary: c.primary ?? false,
        accessRole: c.accessRole ?? null,
      }))
      const pagination = detectPagination(data)
      return compacted(result, { results: calItems, _compact: true, ...pagination }, calItems.length)
    }
  }

  return passthrough(result)
}
