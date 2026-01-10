# Operations

This is the 3AM sheet.

## Health signals

- API responds: `GET /api/status`
- Websocket accepts: `GET /ws`
- Database writable: task creation succeeds

## First checks

1. `npm run dev` is running without errors
2. Port free: `lsof -i :4177` (or change `SCRUM_PORT`)
3. DB path exists and is writable (`.scrum/scrum.sqlite`)

## Restart

- Stop process
- `npm run dev` (dev) or `npm run build && npm start` (prod)

## Logs

Logs are structured. If something fails, capture:

- Full error
- Request path
- Timestamp
- Last 20 events from `/api/events`

## Rollback

SCRUM stores state only. To reset:

- Stop SCRUM
- Delete `.scrum/scrum.sqlite`
- Start SCRUM

