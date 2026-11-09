# Zalo Chat Bridge: Web Client ⇄ Zalo Admin

## Summary

Customers chat from a public chat widget in the frontend (no login, no Zalo account). Every customer message is delivered to the admin's **personal Zalo app** as a message from the business OA. The admin replies in Zalo (ideally with quote-reply); Zalo webhooks route the reply back to the originating customer's chat in real time. Message status is end-to-end: **sent → delivered → seen (admin opened the Zalo chat) → replied**. This is achieved with one OA ⇄ admin 1:1 DM thread that multiplexes all customers; `quote_msg_id` is the primary reply-routing key.

## Topology Decision

- **Transport**: one Zalo DM conversation between the business **Zalo OA** and the **admin's personal Zalo user**. Customers are multiplexed through it (each outbound OA message is prefixed `[Khách #42] ...`; the stored `message_id` maps it to a customer).
- **Admin side**: the admin's own Zalo app. Status "seen" = Zalo's `user_seen_message` webhook (fires when the admin opens the thread). No extra app required for the admin.
- **Typing status**: Zalo exposes no typing signal. Native statuses are Sent / Delivered / Seen / Replied / Failed. If "admin is typing…" is a hard requirement, enable **Mode B** below (admin answers from a mobile web console that pushes replies through the same Zalo bridge; typing/read events are then produced by our backend).
- **GMF group-per-customer** (admin chats as themselves in one Zalo group per customer) is a documented Phase-2 alternative if the single-thread inbox becomes noisy — trade-off: no seen/delivered webhooks for group messages.

## Key Changes

### 1. Zalo-side setup (manual, once — start first, it has lead time)
- Create a **Zalo OA** at oa.zalo.me logging in with the admin's **personal Zalo account** (a personal number is fine; no new SIM needed — only OAs expose APIs, personal chats never do). Verify the OA with the business/hộ-kinh-doanh license within 14 days (verified OA is required for OpenAPI; error `-211` otherwise). Choose the OA package per volume (start Cơ bản/free; the Tăng trưởng tier is the one marketed for API automation — confirm with Zalo sales).
- Create a **Zalo App** at developers.zalo.me: fill OAuth callback URL + Webhook URL + OA callback URL; select permission groups (send messages, manage user messages, receive message events, manage OA info); verify domain via `zalo_verifier<code>.html` under each URL prefix.
- OAuth v4 PKCE consent run by the OA admin → obtain access token (25h) + refresh token (3 months, rotating).
- **Admin binding**: the admin sends one DM "admin-link <one-time-code>" to the OA; the `user_send_text` webhook captures the admin's Zalo `user_id` and stores it as the designated admin (this also opens the 7-day interaction window).
- Subscribe webhook events: `user_send_text`, `user_received_message`, `user_seen_message`, `follow`, `unfollow`.

### 2. Backend — publiclink-app (WebFlux, mirrors existing patterns)
New package `com.qrpublic.apartment.chat` (or `zalo`): 
- `ZaloOaClient` — WebClient against `https://openapi.zalo.me/v3.0` (pattern of [SecurityCheckClient](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/integration/SecurityCheckClient.java)): `oa/message/cs` (text, `quote_msg_id` supported), `oa/listrecentchat`, `oa/conversation`, `oa/getprofile`, `oa/upload/image` (optional), `oa/quota/message`.
- `ZaloOAuthClient` — `oauth.zaloapp.com/v4/oa/access_token` (token + refresh, `secret_key` header, PKCE).
- `ZaloTokenService` — `@Scheduled` (pattern of [BackupScheduler](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/data-backup/src/main/java/com/qrpublic/apartment/databackup/scheduler/BackupScheduler.java)) refreshes before expiry, persists the rotating refresh token, alerts admins on failure.
- `ChatService` — conversation lifecycle, message persistence, status transitions, outbound queue (bounded, rate-capped ~10 msg/s, exponential backoff on Zalo `-210`).
- `ChatRouter` — reply routing: `quote_msg_id` → stored `zalo_message_id` → conversation; fallback: parse `[#<id>]`/`@<id>` text tag; final fallback: most recent unanswered conversation (single admin assumption).
- `ZaloWebhookController` — public endpoint `POST /publiclink/chat/v1/zalo/webhook`; verify `X-ZEvent-Signature = sha256(appId + data + timeStamp + OAsecretKey)` **before anything else**; ACK 200 in <2s; enqueue payload to RabbitMQ (pattern in [EventListener](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/service/msgconsumer/EventListener.java)); consumer dedupes on `msg_id`.
- `ChatApiController` — `POST /publiclink/chat/v1/conversation/start` (creates/resumes conversation, returns history), `POST /publiclink/chat/v1/message` (send), `GET /publiclink/chat/v1/history?since=<msgId>` (missed-message replay).
- WebSocket: WebFlux `WebSocketHandler` at `/publiclink/chat/v1/ws` (or STOMP) for live push; 25s heartbeat; server sends message + status events.

### 3. Data model — Liquibase changeset-021 (append-only, MariaDB-safe)
- `chat_conversation` — id (UUID), device_id, fingerprint_hash, ip_first/ip_last (hashed), user_agent, status (ACTIVE/IDLE/CLOSED), admin_zalo_user_id, last_message_at, created_at.
- `chat_message` — id, conversation_id, direction (CLIENT/ADMIN), content, status (SENT/DELIVERED/SEEN/REPLIED/FAILED), client_msg_id (unique — client retry dedupe), zalo_message_id (unique — webhook dedupe + quote routing), quote_of_zalo_message_id, error_code, created_at.
- `chat_device` — device_id (unique), fingerprint_hash, ip_hash, first_seen, last_seen (for the "n-times returning visitor" requirement).
- Rules from [Liquibase ownership memory](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/resources/db/changelog/db.changelog-master.xml): new changeset id appended in the master XML, never edit applied changesets, unique FK constraint names schema-wide, backtick reserved words.

### 4. Client identity & returning visitors (requirement 2)
- First visit: generate `device_id` UUID → localStorage + HttpOnly cookie; compute fingerprint hash (UA, language, screen, timezone, canvas/webgl hash, platform, CPU); record IP from **`X-Real-IP`** (never socket remote address — behind same-host nginx it is always 127.0.0.1).
- **MAC address is not obtainable from browsers** — dropped in favor of device_id + fingerprint + IP; this is acceptable under the "not highly restrictive" security bar.
- Return visit: match by device_id; if storage was cleared, fuzzy-match fingerprint + IP class (mobile CGNAT makes IP-only matching unreliable) and ask "Is this your conversation?" showing last-message preview before reattaching. Same device returns to the same conversation any number of times.
- "Losing the system": detect via WS close, `beforeunload`, `visibilitychange`, and heartbeat timeout (25s ×2); mark conversation IDLE, keep history forever; on reconnect the client sends `since=<lastMsgId>` and the server replays missed messages and statuses.

### 5. Message status model (requirement 3)
| Status | Trigger | Source |
|---|---|---|
| Sending | client submits | app |
| Sent | Zalo API ack (`message_id`, `sent_time`) | `oa/message/cs` response |
| Delivered | Zalo `user_received_message` webhook | admin device received it |
| Seen | Zalo `user_seen_message` webhook | **admin opened the Zalo chat** |
| Replied | Zalo `user_send_text` webhook (admin reply routed back) | admin answered |
| Failed | Zalo error code / timeout → retry once, then mark | API response |

- Typing ("admin is typing…"): **not available from Zalo**. Mode A (Zalo-only admin): show Seen as the highest pre-reply state (honest UI). Mode B (optional `chatConsole=true`): admin answers in a mobile-friendly web console (same backend); console emits typing + read events so the full status set including typing works. Mode B can run alongside Mode A.
- Statuses are pushed to the client over WebSocket; every status transition is persisted.

### 6. Frontend — chat widget (React + MUI + i18n en/vi)
- Floating chat button → chat panel (or dedicated route), similar patterns to [NotificationPage](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/NotificationPage.js); status icons ✓ / ✓✓ / eye / reply; auto-reconnect with message replay; "You are chatting as <device>" indicator; both translation files get `chat.*` keys.
- Optional Mode B: admin console page (route `/adminChat`, ADMIN role) with conversation list, per-conversation thread, typing/read broadcasting.

### 7. Gateway / nginx wiring
- Gateway: permit `/publiclink/chat/**` in [SecurityConfig](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/apiGateway/src/main/java/com/qrpublic/apartment/apiGateway/gatewayConfig/SecurityConfig.java) (authorities without ROLE_ prefix per project convention); reuse the existing Redis rate limiter for chat send endpoints (e.g., 5 msgs / 10s per device); WebSocket route needs the standard WS handshake upgrade headers.
- nginx: add `proxy_set_header Upgrade $http_upgrade; Connection "upgrade";` for the chat/ws location in [share-link.top.conf](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/deploy/nginx/share-link.top.conf); keep `X-Real-IP` intact (already set); reload with `nginx -t` first.
- Secrets in [publiclink.env.example](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/deploy/publiclink.env.example): `ZALO_APP_ID`, `ZALO_SECRET_KEY`, `ZALO_OA_SECRET_KEY`, `ZALO_OA_ID`, `ZALO_ADMIN_USER_ID`, `ZALO_ACCESS_TOKEN`, `ZALO_REFRESH_TOKEN`.

### 8. Security (acceptable level, per requirement 5)
- HTTPS/wss only (already in place); no login for chat clients — anonymous by device token.
- Webhook endpoint: strict signature verification (mandatory — this is the one endpoint that must not be lenient); rate-limited inbound processing; queue-based async.
- Rate limiting (gateway Redis), max message length (2,000 chars Zalo limit), content sanitization, hashed IP storage, no PII beyond what the user types; optional per-conversation mute/ban for spam. Deliberately no CAPTCHA/OTP in v1.

### 9. Concurrency & limits (requirement 4/6)
- **Web clients**: WebFlux/Netty handles thousands of WS connections on the current server; target **1,000 concurrent chat sessions per instance** with 25s heartbeats (safe headroom), scale horizontally by adding instances.
- **Zalo side**: one DM thread; outbound queue caps at ~10 msg/s with backoff on `-210` (Zalo publishes no hard rate limit). Inbound webhook must ACK <2s then process async (retries 30s→1h, dedupe by `msg_id`).
- **Practical multi-user limit**: the bottleneck is admin attention, not the system — with quote-reply routing, dozens of concurrent conversations in one thread degrade readability; if >50 concurrent customers are expected, move to Phase-2 GMF groups (group quota purchased per OA package).
- **Cost**: OA chat is free within the 48h interaction window (admin's own replies keep refreshing it); verify current package pricing with Zalo before committing.

## Test Plan
1. Zalo spike: API Explorer token → `getfollowers` / `oa/message/cs` / `listrecentchat`; register webhook; verify `user_received_message` + `user_seen_message` fire when the admin opens the DM on a real phone.
2. Round-trip test: web client sends → appears in admin Zalo with prefix tag; admin quote-replies → reply lands in the right conversation (assert via stored `quote_msg_id` mapping).
3. Status matrix test: Sent/Delivered/Seen/Replied/Failed each observed end-to-end and persisted.
4. Reconnect test: kill browser tab, kill network, return after 10 min → conversation and missed messages restored (device_id match; and fingerprint-match path after clearing storage).
5. Concurrency: load-test 500 WS clients sending 1 msg/30s → p95 status latency <2s; verify no Zalo `-210` (queue/backoff works).
6. Security: unsigned/forged webhook rejected 401; rate limiter blocks spam device; X-Real-IP recorded correctly (not 127.0.0.1).
7. Regression: gateway build + existing notifications flow unaffected.

## Assumptions & Risks
- Single admin (one Zalo user) in v1; multi-admin = later feature (tag `[admin:name]` or console mode).
- Admin trains themselves to use Zalo **quote-reply**; unquoted replies fall back to tag parsing / most-recent conversation.
- Zalo policy changes (2026 revamp: ZNS→ZBS, package tiers) may alter quotas/pricing — the abstraction keeps the bridge swappable.
- Verified OA + app approval lead time is the critical path; start immediately and build the web side in parallel against a stub Zalo client.
