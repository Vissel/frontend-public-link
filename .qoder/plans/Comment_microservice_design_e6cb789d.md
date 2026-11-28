# Comment Module Design (comment-app + frontend CommentSection)

## Summary

A new `comment-app` module in `VietQrApplication`, built exactly on the chat-app template: Spring WebFlux controllers over blocking JPA (`Mono.fromCallable` + `boundedElastic`), its own database `comment_schema` owned solely by its own Liquibase changelog, local-disk attachments with random storage keys, and gateway routing under the `/comment` prefix. Reads are public (anonymous buyers on sale links); writes require a JWT and take identity only from the gateway-forwarded `X-User-ID` header. The frontend gets one reusable `CommentSection` component, first mounted on `PublinkPage` for PRODUCT targets; future POST/GUIDELINE pages just mount it with different props.

## Target model (loose coupling, no cross-DB FKs)

- `target_type` enum: `PRODUCT` (existing feature), `POST`, `GUIDELINE` (future). `target_id` is a string; for PRODUCT it is `ProductDTO.productId` as a string.
- comment-app never validates that the target exists — same trust model chat-app uses. If validation is ever wanted, add an internal endpoint on publiclink-app later.

## Database: comment_schema (own Liquibase changelog)

`db/changelog/db.changelog-master.xml` with changeset 001 creating three tables:

**comment**
| column | notes |
|---|---|
| id BIGINT PK auto | |
| uuid VARCHAR(36) unique | public reference |
| target_type VARCHAR(20), target_id VARCHAR(64) | idx (target_type, target_id, root_id, last_activity_at) |
| parent_id BIGINT NULL | direct parent (any depth, FK self-ref) |
| root_id BIGINT NOT NULL | self for root comments; denormalized so thread queries are single-table |
| author_username VARCHAR(100) NOT NULL | from X-User-ID |
| author_display_name VARCHAR(255) | snapshot at write time (see Author snapshot) |
| content TEXT NOT NULL | max length property-checked, default 5000 |
| deleted TINYINT default 0 | soft delete keeps the tree intact |
| edited_at TIMESTAMP NULL | shows "(edited)" in UI |
| created_at TIMESTAMP | immutable |
| last_activity_at TIMESTAMP | on ROOT rows only: max(created_at) of the whole tree; the bump key |

**comment_attachment**
| column | notes |
|---|---|
| id PK, comment_id FK | |
| uuid VARCHAR(36) unique | used in download URL |
| kind VARCHAR(10) | IMAGE / FILE |
| file_name, mime_type, size_bytes | display metadata |
| storage_key VARCHAR(255) | random UUID + extension on local disk |

**comment_author_avatar** (server-side cache, not per-comment data)
| column | notes |
|---|---|
| username PK | |
| data_url MEDIUMTEXT | base64 avatar copied from the user service |
| fetched_at TIMESTAMP | refreshed at most once per hour per author |

Ordering rule implementing "newer higher; a reply lifts the whole tree": root comments are paged by `last_activity_at DESC`; posting a reply sets `last_activity_at = now()` on its root ancestor only. Replies inside a thread are returned `created_at ASC` (chat-like); the newest root activity is what surfaces the tree.

## Backend: comment-app module

New Maven module registered in root `pom.xml` `<modules>`; `pom.xml` cloned from chat-app minus web-push/BouncyCastle (webflux, data-jpa, liquibase, mysql-connector-j, validation, lombok, test deps). Package `com.qrpublic.apartment.comment`.

`application.properties`:
- `spring.webflux.base-path=/comment`, `server.port=${COMMENT_SERVER_PORT:9091}`, `server.address=${SERVER_ADDRESS:127.0.0.1}`
- `COMMENT_DB_URL / COMMENT_DB_USERNAME / COMMENT_DB_PASSWORD` per-profile exactly like `CHAT_DB_*` (dev: root@localhost; qa: dedicated newuser account — NOT newuser02/03, to stay clear of their hourly quotas; prod: MariaDBDialect override like chat-app)
- `comment.upload-dir=${COMMENT_UPLOAD_DIR:}`, `comment.max-image-bytes=5242880`, `comment.max-file-bytes=10485760`, `comment.max-attachments=4`, `comment.max-content-length=5000`
- `comment.user-service-url=${USER_SERVICE_URL:http://127.0.0.1:8082}`, `comment.publiclink-service-url=${PUBLICLINK_SERVICE_URL:http://localhost:9080}`

Layering mirrors chat-app: `controller/` → `service/` (template + ProcessCallback + Result) → `domain/` → `core/service` + `core/model` + `repository/` + `entity/`.

### HTTP API (path-split so gateway security is unambiguous)

Public reads (permit-all at gateway):
- `GET /comment/api/v1/public/comments?targetType=&targetId=&cursor=&limit=20` → root page: each root carries `replyCount`, `previewReplies` (first 2), `attachments`, author fields; cursor = last row's `last_activity_at`+`id`
- `GET /comment/api/v1/public/comments/{uuid}/replies?afterId=&limit=50` → thread replies ASC
- `GET /comment/api/v1/public/avatar/{username}` → cached author avatar data URL (404 when none; frontend falls back to initials)
- `GET /comment/api/v1/public/attachment/{uuid}` → byte-streaming download with stored mime type

Authenticated writes (JWT required, identity ONLY from `X-User-ID`; a body-supplied author is never trusted):
- `POST /comment/api/v1/write/comments` — multipart: `content`, `targetType`, `targetId`, optional `parentUuid`, 0..4 `files` (FilePart read with an early cap-abort, same as `ChatAttachmentHttp.readCapped`). Creates the comment + attachments in one transaction; if it is a reply, bumps the root's `last_activity_at`.
- `PUT /comment/api/v1/write/comments/{uuid}` — author-only content edit (attachments are immutable; edit sets `edited_at`)
- `DELETE /comment/api/v1/write/comments/{uuid}` — author-only soft delete; root with live descendants stays as a "deleted" placeholder

Internal (gateway `denyAll`, never public):
- `DELETE /comment/internal/v1/comments/{uuid}` — admin moderation delete

### Author snapshot and avatar

At write time, comment-app resolves the author once (in-memory cached, TTL 1h, best-effort with fallback to username on timeout — same pattern as chat-app's `chat.user-service-url` name resolution):
1. Display name: server-to-server `GET {publiclink}/api/v1/account/self` forwarding the caller's `X-User-ID` header → `publiclink-db.user.name` (the verified single display-name source; admins with no local row fall back to step 2). Fallback: user service `findByUsername` → `user_tbl.full_name`, then username.
2. Avatar: server-to-server `GET {user}/api/v1/user/avatar` with the same forwarded header (that path is permit-all at the gateway for internal callers; the public avatar exposure is the comment-app cache endpoint above, never a new public user-service route). Upsert into `comment_author_avatar`.

Stored on the comment row as `author_display_name` so historical comments keep the name they were posted under.

### Attachment safety

Port chat-app's `ChatAttachmentDomain` rules: extension allow-list (PNG/JPEG/WebP/GIF; PDF/TXT/CSV/Word/Excel/PowerPoint), magic-byte verification, no SVG, random storage key under `comment.upload-dir`, path-traversal-safe resolve, downloads only through the streaming endpoint. One difference from chat: comment attachments are publicly downloadable by uuid (comments are public); uuid unguessability is the capability.

## Gateway changes (apiGateway)

- `GatewayRoutesConfig`: new `@Value("${comment.service.url:http://localhost:9091}")` and route `.route("CommentApplication", r -> routed(r, "/comment/**", commentServiceUrl))` — the existing `routed()` helper already handles the `/apiGateway` base-path rewrite.
- `application.properties`: `comment.service.url=${COMMENT_SERVICE_URL:http://localhost:9091}`.
- `SecurityConfig`, inserted in the correct matcher order:
  - `.pathMatchers("/comment/internal/**").denyAll()` next to the existing `/chat/internal/**` rule
  - `.pathMatchers("/comment/api/v1/public/**").permitAll()` next to the chat public rule
  - writes need no rule: they fall under the existing `anyExchange().authenticated()` catch-all.

## Frontend (frontend-publiclink)

`src/api/commentApi.js` (mirrors `chatApi.js`): base `${config.baseURL}/comment/api/v1`; reads use a plain axios instance (anonymous visitors must work), writes use the JWT-attached client from `src/api/index.js`.

New components in `src/components/comment/`:
- `CommentSection.js` — props `{ targetType, targetId }`; owns paging state, mounts composer + root list + "load more".
- `CommentComposer.js` — multiline TextField (respect theme.js fullWidth default; explicit flex sizing per project convention), paperclip attach with previews and per-file size caps, disabled-with-login-hint for anonymous visitors, submit-then-clear per the standardized dialog/submit pattern.
- `CommentItem.js` — recursive render: `Avatar` loaded from `/public/avatar/{username}` with fallback to existing `util/avatar` `initialsOf`/`colorFromString`, wrapped in a MUI `Tooltip` showing the full display name on hover (the requirement); relative + absolute datetime via the project's dd/mm/yyyy rule; content (with "(edited)" marker); IMAGE thumbnails / FILE rows reusing the `ChatMessageContent` rendering idiom; Reply button opening an inline composer pre-addressed to that comment (deep replies store the true `parentUuid` but render capped at nesting level 3, showing "replying to @name"); Edit/Delete only when `AuthContext` username === `authorUsername`.
- Deleted roots with live replies render as a muted placeholder so the thread stays readable.

Integration: mount `<CommentSection targetType="PRODUCT" targetId={String(product.productId)} />` in `PublinkPage.js` — one thread per product card in `listProduct` (each product keeps its own thread; if the env has a single product it simply appears under that card).

i18n: add `comment.*` keys (title, placeholder, reply, edit, delete, deletedPlaceholder, loadMore, showReplies, attachLimit, loginToComment, edited) to both `src/i18n/locales/en/translation.json` and `vi/translation.json`.

## Ops / deployment artifacts

- `deploy/publiclink.env.example`: `COMMENT_SERVER_PORT=9091`, `COMMENT_DB_URL/USERNAME/PASSWORD`, `COMMENT_UPLOAD_DIR`.
- `deploy/systemd/publiclink-comment.service` cloned from `publiclink-chat.service` (own nologin service account convention noted; actual server user creation is a manual ops step).
- Dev/qa note in the module README section of the plan output: the schema must exist before first start (`CREATE DATABASE comment_schema; GRANT ALL ON comment_schema.* TO '<user>'@'localhost';`) — Liquibase only creates tables.

## Test plan

- Backend unit tests (`comment-app/src/test`): reply bumps root `last_activity_at`; root paging order; author-only edit/delete enforcement (X-User-ID vs author_username, internal admin delete); attachment allow-list + magic-byte rejection; multipart cap abort. Follow existing chat-app test style.
- Build: `mvn -pl comment-app -am package` (root build must still pass with the new module registered).
- Local probe: start comment-app on 9091 + gateway, curl the public list (anonymous 200), write without JWT (401 at gateway), write with JWT (201 + correct author snapshot), reply → verify root moved to top.
- Frontend: RTL test for CommentSection (hook declaration order and MUI-safe assertions per project test conventions); verify anonymous read renders initials-avatar fallback; `npm run build` must not dirty tracked artifacts beyond the intended change.

## Assumptions

- Replies within a thread display oldest-first; only the root ordering is newest/bumped-first (matches "bring all this tree to higher").
- Unlimited storage depth with frontend nesting capped at 3 levels; deep replies keep the true parent link for "replying to @name".
- Attachments are publicly downloadable by unguessable uuid because comment reads are public.
- POST/GUIDELINE targets need no backend change later — only new frontend pages mounting CommentSection.
- QA database user for comment_schema will be a new dedicated account (created manually), avoiding the shared newuser02/03 quota limits.