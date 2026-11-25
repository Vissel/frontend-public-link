# Badminton Court Booking Feature

## Summary
New product type `BADMINTON_COURT` (third option in the product form). Its sale page replaces the product cards with a court grid: up to 6 seller-configured courts, each with a weekly schedule (day of week, open/close time, slot length, price per slot). A signed-in player books one frame, pays via the seller's bank transfer QR (same component style as PaymentInfoPanel), confirms the transfer, the seller is notified and confirms/rejects; on the seller's decision the player receives a notification and an auto-generated message lands in their chat widget (chat-app). Mirrors the yoga feature end to end.

## Booking state machine
`badminton_booking.status`: `PENDING_PAYMENT` (created; slot blocked) -> `WAITING_CONFIRM` (player confirmed transfer; seller notified) -> `CONFIRMED` | `REJECTED` (seller decision; player notified + chat message). `CANCELLED` from the first two states. Any booking not in (CANCELLED, REJECTED) blocks its frame; conflict check is a transactional SELECT inside the booking transaction.

## 1. Database (publiclink-app Liquibase)
New `src/main/resources/db/changelog/changeset-035-create-badminton.sql`, registered in `db.changelog-master.xml`:
- `badminton_court`: court_id PK, court_code VARCHAR(36) UNIQUE, env_id FK sale_environment, court_name VARCHAR(100), active TINYINT(1). Max 6 per env enforced in service.
- `badminton_court_schedule`: schedule_id PK, court_id FK, day_of_week TINYINT (1-7), open_time TIME, close_time TIME, slot_minutes INT, price_vnd DECIMAL; UNIQUE (court_id, day_of_week).
- `badminton_booking`: booking_id PK, booking_code VARCHAR(36) UNIQUE, court_id FK, schedule_id FK (price snapshot source), booking_date DATE, start_time TIME, end_time TIME, buyer_username VARCHAR(50) NOT NULL, buyer_name VARCHAR(100), price_vnd DECIMAL, status VARCHAR(20) DEFAULT 'PENDING_PAYMENT', note VARCHAR(255), created_at/updated_at; KEY (court_id, booking_date, status).

## 2. publiclink-app backend
New packages mirroring `domain/yoga` + `yoga` (request/response):
- Entities `entity/BadmintonCourt.java`, `BadmintonCourtSchedule.java`, `BadmintonBooking.java`; repositories under `repository/`.
- Core: `core/model/BadmintonCourtModel.java`, `BadmintonBookingModel.java`; `core/service/CoreBadmintonService.java` — court/schedule CRUD (with the 6-court cap per env), booking persistence, slot conflict check, frame generation (split schedule into `slot_minutes` frames for a concrete date), status transitions.
- `domain/badminton/BadmintonEnvAccess.java` — clone of YogaEnvAccess checking productType `BADMINTON_COURT` (resolveForRead/Booking/Seller + assertAlive). Add `TYPE_BADMINTON = "BADMINTON_COURT"` constant next to `CoreYogaEnvironmentService.TYPE_YOGA` and reuse that service for env resolution.
- `domain/badminton/BadmintonBookingDomain.java` — grid assembly (courts + frames + booking state + `sellerView` + `myBookings`), `book` (caller username REQUIRED, else 401 "Please sign in"; price snapshotted from schedule), `paymentConfirm` (-> WAITING_CONFIRM, notify seller), `cancel`, `confirm`/`reject` (seller-only; -> CONFIRMED/REJECTED, notify player + inject chat message).
- `domain/badminton/BadmintonCourtDomain.java` — seller court/schedule management with ownership checks.
- Controllers following the yoga pattern: `controller/BadmintonPublicController.java` at `/api/v1/publish/badminton` (grid, book, payment/confirm, cancel, my) and `controller/BadmintonSellerController.java` at `/api/v1/badminton/seller` (courts/save, courts/delete, bookings, bookings/confirm, bookings/reject). Services `service/BadmintonService.java` + `BadmintonSellerService.java` wrap domains in the existing `PublicLinkServiceTemplate` / `ProcessCallback` style (see YogaService/YogaSellerService).
- DTOs under `badminton/request` and `badminton/response` (purpose-specific, omit unused fields per project convention).
- Notifications: `CoreNotificationService.notifyUsernames(...)` with referenceType `COURT_BOOKING`, referenceCode = bookingCode. To the env seller on payment confirm; to the buyer on confirm/reject. Plain-text rendering in the bell (same as YOGA_BOOKING); no NotificationService change needed.
- Chat injection: new `integration/ChatMessageClient.java` — WebClient to `chat.service.url` (new property, e.g. `http://localhost:9090`), POSTs `{ownerUsername, content}` to chat-app (verify chat-app base-path `/chat`, so path `/chat/api/v1/chat/system-message`). Failure is logged and swallowed (booking state must never roll back because chat is down).

## 3. chat-app
- New endpoint `POST /api/v1/chat/system-message` (`ChatController` or a small dedicated controller) with `{ownerUsername, content}`.
- New method in `ChatMessageDomain`: find the player's latest open conversation by owner (CoreChatService.findLatestConversationByOwner); if none/closed, register a synthetic device row and createConversation(ownerUsername). Append via `coreChatService.saveMessage(conversationId, ChatDirectionEnum.ADMIN, content, ...)`, advance status to SENT (console-style, no Zalo mirror), then `chatEventPublisher.publishMessage` + `markUnread`/`publishConversation` so the player's open widget live-updates and the badge shows.
- No gateway change: publiclink-app calls chat-app directly (same trust model as ChatAccountDomain -> user service).

## 4. Gateway
No changes: `/publiclink/api/v1/publish/**` is permit-all and `/api/v1/badminton/seller/**` falls under `anyExchange().authenticated()` (same as yoga seller endpoints). `Badminton_Admin` role already exists in SecurityConfig if admin management is later wanted.

## 5. Frontend
- `src/form/ProductForm.js`: add `BADMINTON_COURT` to the ToggleButtonGroup with hint text ("courts + time frames page").
- `src/page/PublinkPage.js`: `const isBadminton = saleSpace.productType === "BADMINTON_COURT"`; render `<BadmintonSection token={token} transferInfo={saleSpace.transferInfo} />` and hide the product cards / order form like the yoga branch. Keep EnvironmentTransferCard visible (it is the seller's bank account the payment panel also shows).
- New `src/components/BadmintonSection.js` (modeled on YogaSection): date navigation (day by day), grid with time-frame rows x up to 6 court columns (FREE green / BOOKED gray / MINE highlighted), frame click opens the book dialog. Seller view: courts manager (create/edit/delete with weekly schedule + price; disabled at 6 courts) and a bookings dialog with Confirm / Reject. Player view: book -> payment dialog showing the seller's transfer QR (reuse the EnvironmentTransferCard styling: portrait QR, account number/name, copy buttons) + "I have transferred" confirm button, then poll the booking status (e.g. every 15 s) until CONFIRMED/REJECTED so the seller's decision appears in the player's UI. "My bookings" list with cancel.
- Auth gating: booking requires a signed-in account; anonymous click opens a prompt linking to `/login?next=<current saleUrl path>` and `/register` (LoginPage already honours in-app `?next=` and SelfRegisterPage exists for BUYER accounts; pass `next` through register -> login).
- i18n: add `badminton.*` keys to both `src/i18n/**` en and vi files (parity is checked by flattening both).

## 6. Test plan
- Backend unit tests (publiclink-app): slot conflict blocking, 6-court cap, price snapshot, state transitions, unauthorized confirm (non-seller). chat-app: system-message creates conversation when missing and appends when present (ChatIdentityDomainTest style).
- Manual QA: create a BADMINTON_COURT product, add 2 courts with schedules, book as a buyer (register -> login -> return via next), pay + confirm, seller confirm -> player bell notification + chat widget message; verify frame stays blocked for other users and frees on reject/cancel.

## Assumptions
- One booking = one frame (no multi-frame selection in v1).
- Price comes from the schedule row; the product price field is not used for badminton bookings.
- The 6-court cap is per sale page for now; plan-quota-driven court counts are future work (per user: "will be changed in the future to reflect with the plan payment").