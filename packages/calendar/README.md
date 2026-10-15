# @xeroneon/calendar

Xeroneon Cloud calendar + tasks core (XER-78 / Phase 2.1 of `xer71-cloud-plan`).

A dependency-light **RFC 5545** engine that powers the calendar service backend:

- **Timezones** — committed IANA transition table (`src/tz/tzdb.json`, 146 zones)
  + `resolveLocalToUtc` / `resolveUtcToLocal` / `offsetAtUtc`, generating correct
  UTC instants across DST boundaries.
- **Recurrence** (`recurrence/`) — FREQ (SECONDLY→YEARLY), INTERVAL, COUNT,
  UNTIL, BYMONTH/BYMONTHDAY/BYDAY (with ordinates)/BYYEARDAY/BYWEEKNO/BYHOUR/
  BYMINUTE/BYSECOND, BYSETPOS, WKST, EXDATE/RDATE. Expanded on the wall-clock
  calendar so authored local times (e.g. weekly 09:00) survive spring-forward.
- **iCal** (`ical/`) — RFC 5545 `VCALENDAR` serialize + parse: VEVENT, VTODO,
  75-octet folding, TEXT escaping, VTIMEZONE (correct DST RRULEs), ATTENDEE /
  ORGANIZER with the full invite vocabulary (PARTSTAT/ROLE/RSVP/delegation).
- **Tasks** (`tasks.ts`) — task = event with a completion model (`COMPLETED`,
  `PERCENT-COMPLETE`, status transitions), folded into the same service/feed.
- **Store** (`store.ts`) — in-memory calendar collection + CRUD + UTC-window
  occurrence expansion (Postgres persistence arrives with later phases).

## Usage

```ts
import { CalendarStore, serializeCalendar, expandRule } from '@xeroneon/calendar'

const store = new CalendarStore()
store.createCalendar('main', 'Main')
const ev = store.createItem('main', {
  kind: 'event', uid: 'evt_1', summary: 'Standup',
  dtstart: { kind: 'zoned', tzid: 'America/Los_Angeles',
             date: { year: 2026, month: 3, day: 2 }, time: { hour: 9, minute: 0, second: 0 } },
  duration: 'PT30M',
  recurrence: { freq: 'WEEKLY', byday: [{ weekday: 'MO' }, { weekday: 'WE' }, { weekday: 'FR' }] },
})
const ics = serializeCalendar(store.listItems(), { calendarName: 'Main' })
const occ  = store.expand({ rangeStartUtc: startSec, rangeEndUtc: endSec })
```

## Rebuilding the timezone table

`src/tz/tzdb.json` is generated from Python's real IANA tz database
(`zoneinfo`); the generator lives at a one-off `/tmp/gen_tzdb.py`. To regenerate
with more/fewer zones, edit that script's `ZONES` list and re-run, then copy the
output to `src/tz/tzdb.json`. The build step copies it into `dist/tz/`.

## Run checks

```sh
pnpm --filter @xeroneon/calendar lint
pnpm --filter @xeroneon/calendar typecheck
pnpm --filter @xeroneon/calendar test
pnpm --filter @xeroneon/calendar build
```
