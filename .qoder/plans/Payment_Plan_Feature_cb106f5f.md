# Payment Plan Feature — Implementation Plan

## Summary
Introduce payment plans that gate environment creation: admin creates a plan assignment for a seller (`/createSellerPlan` repurposed), which produces a `payment` record (status `CREATE`), a `payment_plan_user` record (state `CREATE`), and a public **payment URL** shown in a follow-up dialog and manually sent to the seller. Admin approves assignments (state `ACTIVE`, chosen active date) on a new Setup page; remaining quota of ACTIVE assignments gates the reworked Generate Product Link flow for both admin and seller. Seller confirms payment on the public payment page → admin gets a notification; a `bill` row is created when admin marks the payment `PAID`. Admin/seller bank accounts live in one `transfer_info` table (owner-typed) rendered by a shared collapsible component.

All backend work is in `publiclink-app` (port 9080, `/publiclink` base) except one gateway permit-all line. All new DB objects go in `publiclink-db` via Liquibase.

## Database — Liquibase (publiclink-app/src/main/resources/db/changelog)
Append **new** changesets after 020 in `db.changelog-master.xml` (never edit applied changesets; unique FK constraint names; backtick reserved words).

- `changeset-021-create-payment-plan.sql`
  - `payment_plan`: `plan_id BIGINT AI PK`, `plan_code VARCHAR(36) UNIQUE` (UUID, external identifier), `fee DECIMAL(15,2)`, `plan_day INT`, `env_count INT` (environments/links allowed — the quota unit), `description VARCHAR(250)`, `plan_state VARCHAR(50) DEFAULT 'ACTIVE'` (ACTIVE | DEACTIVE), `created_at`, `updated_at`.
  - Seed 8 ACTIVE catalog rows (`INSERT ... WHERE NOT EXISTS` by fee+plan_day): fee 3000/1 day, 10000/3 days, 15000/5 days, 15000/7 days, 20000/7 days, 20000/10 days, 25000/10 days, 30000/14 days — all `env_count = 1` (user listed only fees; day/env values are assumptions to confirm).
- `changeset-022-create-payment.sql`
  - `payment_plan_user`: `id BIGINT AI PK`, `plan_user_code VARCHAR(36) UNIQUE`, `user_id VARCHAR(50)` FK→`user(user_id)`, `plan_id` FK→`payment_plan`, `env_quota INT`, `used_count INT DEFAULT 0`, `plan_state VARCHAR(20) DEFAULT 'CREATE'` (CREATE | ACTIVE | DEACTIVE), `active_date DATETIME NULL`, `ended_date DATETIME NULL`, `created_at`, `updated_at`. One user may have N rows.
  - `payment`: `payment_id BIGINT AI PK`, `payment_code VARCHAR(36) UNIQUE`, `plan_user_id` FK→`payment_plan_user`, `amount DECIMAL(15,2)`, `currency VARCHAR(10) DEFAULT 'VND'`, `status VARCHAR(20) DEFAULT 'CREATE'` (CREATE | WAITING_CONFIRM | CONFIRMED | PAID | REJECTED), `payment_url VARCHAR(500)`, `seller_email VARCHAR(100) NULL`, `seller_phone VARCHAR(20) NULL`, `confirmed_at`, `paid_at`, `created_at`.
  - `bill`: `bill_id BIGINT AI PK`, `bill_code VARCHAR(36) UNIQUE`, `payment_id` FK→`payment`, `billed_amount DECIMAL(15,2)`, `note VARCHAR(250)`, `created_by VARCHAR(50)`, `created_at`. Created only on admin mark-PAID.
- `changeset-023-create-transfer-info.sql`
  - `transfer_info` (single table serving both `admin_transfer_info` and `seller_transfer_info` requirements): `transfer_info_id BIGINT AI PK`, `transfer_code VARCHAR(36) UNIQUE`, `user_id VARCHAR(50)` FK→`user`, `owner_type VARCHAR(10)` (ADMIN | SELLER), `transfer_issuer VARCHAR(100)` (bank short name / e-wallet), `issuer_full_name VARCHAR(150) NULL`, `type VARCHAR(20) DEFAULT 'BANK'` (BANK | EWALLET | OTHER), `transfer_number VARCHAR(50)`, `account_name VARCHAR(100) NULL`, `qr_image MEDIUMTEXT NULL` (base64, same convention as `picture.data`), `default_message VARCHAR(250) NULL` (QR scan transfer message), `status VARCHAR(20) DEFAULT 'ACTIVE'` (ACTIVE | DEACTIVE — DEACTIVE = removed by owner, soft delete), `is_default TINYINT(1) DEFAULT 0`, `created_at`, `updated_at`; index `(user_id, owner_type, status)`.

## Backend — publiclink-app
Layering per project rule: **controller → service (only place running `PublicLinkServiceTemplate.execute(ProcessCallback)`) → domain (`@Component`, owns `@Transactional`) → core (`Core*Service`, `@Transactional`, only layer touching entities/repositories, returns core models) → repository**. Controllers return `Mono<ResponseEntity<..>>` via `ResponseEntityConvertor` (Pattern C). No `.block()`; wrap sync domain calls with `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())`.

### Security rule (applies to every new API)
No DB ids in/out. External identifiers: `planCode`, `planUserCode`, `paymentCode`, `transferCode`, and `username`. Repository finders query by these codes (`findByPlanCode`, `findByPlanUserCodeIn`, `findByPaymentCode`, `findByTransferCodeAndUserId`, …). The payment URL token carries only `paymentCode` as claim.

### New packages / classes
- Entities (`entity/`): `PaymentPlan`, `PaymentPlanUser`, `Payment`, `Bill`, `TransferInfo` (Lombok `@Getter/@Setter/@NoArgsConstructor`, `@Column(updatable=false, insertable=false)` timestamps — mirror `Pricing`).
- Repositories (`repository/`): `PaymentPlanRepository`, `PaymentPlanUserRepository`, `PaymentRepository`, `BillRepository`, `TransferInfoRepository`. Paginated list queries with optional filters (state, username via `LEFT JOIN` user, fee range, date range) returning `Page<...>`; remember `PageRequest.of(page - 1, size)`.
- Core (`core/service/` + `core/model/`): `CorePaymentService` (payment + bill CRUD/state transitions), `CorePaymentPlanService` (catalog, plan-user CRUD, quota deduction), `CoreTransferInfoService` (transfer info CRUD, default-switching inside a transaction: clear other `is_default` for same user before setting one). Core models: `PaymentPlanModel`, `PlanUserModel`, `PaymentModel`, `TransferInfoModel`.
- Domain (`domain/paymentplan/`): 
  - `PaymentPlanService` — `createSellerPlan`, `checkPlanQuota`, `listUserPlans`, `listPlanUsers` (search/filter/paginate), `approvePlans(codes, activeDate)`, `rejectPlans(codes)`, `markPaid(paymentCode)`.
  - `PaymentDomainService` — public page data assembly, `confirmPayment`.
  - `TransferInfoDomain` — list/create/set-default/deactivate, resolving `owner_type` from `user.type` via `CoreUserService` (gateway forwards no roles).
  - All `@Transactional` methods here; they call core services and `LinkService`.
- Service (`service/`): `PaymentPlanAdminService`, `TransferInfoService` — each method = `publicLinkServiceTemplate.execute(new ProcessCallback<>() { preProcess → Assert validations; process → domain call })`, returning `Result<T>`.
- Link building: add `LinkBuilder.buildPaymentLink(String paymentToken)` → `/payment?token=...`. Payment token via existing `LinkService.generateSecureUrl("payment", {paymentCode}, expiry)` with configurable expiry `payment.link.expiry-ms` (default 30 days) in `application.properties`.

### `createSellerPlan` — repurposed (AdminController keeps path `/admin/v1/createSellerPlan`)
- New `CreateSellerPlanRequest`: `username`, plus either `planCode` **or** inline `newPlan { fee, planDay, envCount, description }`. New `CreateSellerPlanResponse`: `paymentCode`, `paymentUrl`, `sellerUsername`, `fee`, `planDay`, `envCount`, `status`.
- Flow in `PaymentPlanService.createSellerPlan` (single transaction): resolve user by username (`CoreUserService`) → resolve existing plan by `planCode` or create catalog row from inline fields → create `payment_plan_user` (state CREATE, quota = plan.env_count) → `CorePaymentService` creates `payment` (status CREATE, amount = fee) → outside/after commit-safe: `LinkService` generates token, persist `payment_url`, return it. No seller authorization involved.
- Remove old pricing logic: delete `AdminService.createSellerPlan` + `PlanService.createPricingPlanForSeller` usage from this endpoint (keep `PlanService` class only if still referenced elsewhere; otherwise remove). `CreatePlanForm.js` no longer calls it (see frontend).

### Quota check + deduction (Generate Product Link gate)
- New endpoint `POST /admin/v1/paymentPlan/check` → `{ username, planUserCode }` → `{ allowed, remaining, message }`: `remaining = env_quota - used_count` of the ACTIVE assignment; `allowed=false` when 0 or no ACTIVE assignment.
- Enforcement: inside `SaleEnvironmentServiceImpl.generateSaleEnvironment` transaction, call `PaymentPlanService` domain to deduct 1 from the seller's ACTIVE assignment with remaining quota (oldest `active_date` first); throw `ApplicationException(403, "No remaining environment quota. Please contact admin.")` when none — backend hard gate, UI check is UX only.

### Plan management APIs (admin) — new `PaymentPlanAdminController` (`/admin/v1/paymentPlan`)
- `POST /list` — body `Pagination<PlanListRequest>{ state (ACTIVE|ALL, default ACTIVE), usernameSearch, feeMin/feeMax, activeFrom/activeTo, page, size }` → paginated plan-user rows joined with plan + username; used by both Setup tables (CREATE-state approval table passes `state=CREATE`).
- `POST /approve` — `{ planUserCodes: [...], activeDate }` → CREATE→ACTIVE, sets `active_date`, `ended_date = active_date + plan_day`.
- `POST /reject` — `{ planUserCodes: [...] }` → →DEACTIVE (from CREATE or ACTIVE).
- `POST /payment/markPaid` — `{ paymentCode }` → payment CONFIRMED/WAITING_CONFIRM→PAID + create `bill` row in same transaction.
- `GET /catalog` — ACTIVE `payment_plan` rows for the select-plan dropdown (no pagination needed).

### Seller APIs — new `SellerPlanController` (`/api/v1/sellerPlan`)
- `GET /myPlans` — authenticated seller (username from `X-User-Id` header, as existing seller controllers do) → their plan-user rows with plan detail + remaining quota (powers seller step-1 plan select and Setup read-only plan list).

### Transfer info APIs — new `TransferInfoController` (`/api/v1/transferInfo`)
Role-agnostic; owner resolved from `X-User-Id` header + `user.type`:
- `POST /list` `{ status }`, `POST /create` `{ transferIssuer, issuerFullName, type, transferNumber, accountName, qrImage, defaultMessage, setDefault }`, `POST /setDefault` `{ transferCode }`, `POST /remove` `{ transferCode }` (→ DEACTIVE, owner-only check). First created row for a user auto-becomes default.

### Public payment page APIs — extend `PageController` (`/api/v1/publish`, already gateway permit-all)
- `POST /payment/info` `{ token }` — validate via `LinkService.validateLink` → `{ fee, planDay, envCount, description, estimatedActiveDate (today), estimatedEndDate (today + plan_day), amount, paymentStatus, transferInfos[] (admin ACTIVE rows, default first, incl. issuer/number/qrImage/defaultMessage) }`.
- `POST /payment/confirm` `{ token, email, phone }` — payment CREATE→WAITING_CONFIRM, stores contact fields; sends **admin notification** (see below); response guides "result within a few minutes via app chat / provided email / phone".

### Admin notification for payment confirm
Extend existing notification tables, no new schema: `Notification.targetType = 'PAYMENT'`, `NotificationRecipient.sellerUsername = admin username` (admins are `user.type='ADMIN'` rows). `CorePaymentService`/domain creates one recipient per admin user. Frontend: render `NotificationBell` for admin role too (currently seller-only in `Header.js`).

## Gateway — apiGateway
`SecurityConfig`: add `"/publiclink/api/v1/publish/payment/**"` to the existing permit-all list (covers `/payment/info` and `/payment/confirm`; `/api/v1/publish/**` may already cover it — verify and only add if needed).

## Frontend — frontend-publiclink (React + MUI, i18n vi/en)
Follow dev-fe conventions: i18n keys for all new text (`src/i18n/locales/{en,vi}`), copy-icon pattern, `PageContainer`/`SectionBlock`/`CardWrapper` layout components, `api` axios instance, `contextPath = "/publiclink"`.

### Routing & navigation
- `App.js`: add public route `/payment` → `PaymentPage`; ADMIN-protected `/setup` → `SetupPage`; SELLER-protected `/sellerSetup` → `SellerSetupPage`.
- `Header.js`: add "Setup" nav button per role (admin → `/setup`, seller → `/sellerSetup`); enable `NotificationBell` for admin.
- `AdminHomePage.js`: add **"Create Payment Plan"** button next to "Generate Product Link" opening `CreateSellerPlanDialog`.

### Admin — Create Payment Plan dialog (`form/CreateSellerPlanDialog.js`, new)
Single dialog: select user (Autocomplete over users from existing `/admin/v1/listUser`), select plan (`/paymentPlan/catalog` shown as "3,000 ₫ | 1 day | 1 link" rows) **or** inline create-new on one line (fee, plan day, env count, description — separate fields, no nested popup). Create → `POST /admin/v1/createSellerPlan` → on success open the **Next dialog**: payment URL + copy icon, hint that admin sends it to the seller manually; on error show Alert in same next-dialog pattern.

### Generate Product Link rework
- `CreatePlanForm.js` (admin): step 1 becomes select existing seller + select one of the seller's **ACTIVE** plans (from `/paymentPlan/list` filtered by username/state) — no plan → inline message "contact admin". **Next** → `POST /paymentPlan/check`; if `remaining = 0` show "Unable to create — 0 environments left, please contact admin for support" and stop; else step 2 (ProductForm) unchanged. Submit calls `generateRequestId` + `createSaleEnvironment` only — **remove the `createSellerPlan` call** (lines 212–223).
- Seller side: new `form/SellerGenerateForm.js` mirroring the same 2-step flow using `/api/v1/sellerPlan/myPlans` + `/paymentPlan/check` + `generateRequestId`/`createSaleEnvironment`; wired to a "Generate Product Link" button on `SellerHome`.

### Setup page (admin) — `page/SetupPage.js` (new), sections:
1. **Pending approvals**: `/paymentPlan/list` with `state=CREATE`; multi-select checkboxes → Approve (date picker for `activeDate`) / Reject.
2. **All plans**: `/paymentPlan/list` default `state=ACTIVE`, "All" toggle button reloads with `state=ALL`; multi-select → Activate/Deactivate (approve/reject APIs); row action "Mark paid" for linked payments (`/payment/markPaid`).
3. **My transfer info**: shared `TransferInfoManager` (below).
Both tables: MUI `DataGrid`/`Table` with server-side pagination; **search rule**: filter currently loaded rows in JS first; if 0 matches → re-query API with `usernameSearch` in the same `/list` payload (search/filter/paginator share one endpoint, differing payload fields only).

### Seller setup page — `page/SellerSetupPage.js` (new): `TransferInfoManager` + read-only list of own plans/quota from `/api/v1/sellerPlan/myPlans`.

### Shared transfer info component — `components/TransferInfoManager.js` (new)
Dropdown/accordion list (MUI `Accordion` per transfer info: issuer + logo, number, account name, QR image preview, default chip, default-message text). Actions: set default, remove (→ DEACTIVE). "Add transfer info" inline form: `type` select defaulting to **Bank**; when BANK, bank Autocomplete loads **static Vietnamese bank list** from `public/data/vn-banks.json` (new asset: ~50 banks with `shortName`, `fullName`, `logoUrl` from public bank-logo CDN, `napasCode`), populating `transferIssuer`/`issuerFullName`/logo; other fields (number, account name, QR image upload → base64, default message) free-form. Reused by admin and seller pages via `contextPath` API only (owner resolved server-side).

### Public payment page — `page/PaymentPage.js` (new, route `/payment?token=`)
Fetches `/api/v1/publish/payment/info`. Shows: plan info (fee, plan day, env count, description) with **estimated active date = today** and **estimated ended date = today + plan_day** (actual dates set at admin approval); admin transfer info card(s) — default one first — with QR image, number, issuer, and the default message explained as "content auto-filled after scanning the QR"; **Confirm Payment** button → small dialog collecting email/phone (prefilled if known) → `POST /payment/confirm` → success screen: "We received your confirmation. You will get the result within a few minutes via app chat, your provided email or phone number." If payment already WAITING_CONFIRM/PAID, show status instead of the button.

## Build order
1. Liquibase changesets 021–023 + master entries.
2. Entities, repositories, core services/models.
3. Domain classes (`PaymentPlanService`, `PaymentDomainService`, `TransferInfoDomain`), LinkBuilder/LinkService payment link.
4. Service-template services + controllers (admin, seller, transfer info, public payment) + `createSellerPlan` repurpose + quota deduction hook in `generateSaleEnvironment`.
5. Admin notification extension + gateway permit-all verification.
6. Frontend: vn-banks.json, TransferInfoManager, dialogs, Setup pages, PaymentPage, Generate-flow rework, Header/App routing, i18n en+vi.

## Test plan
- Backend: `mvn -pl publiclink-app -am compile` then run app against local MySQL; verify Liquibase applies 021–023 on both fresh and existing `publiclink-db` (no checksum errors). curl: catalog seed → createSellerPlan (existing plan + inline plan) → check → approve → createSaleEnvironment quota deduction → 403 at 0 remaining → payment info/confirm via token → markPaid creates bill.
- Frontend: `npm start`; walk admin flow (create plan dialog → next dialog copy link), open payment URL in a logged-out browser (permit-all), confirm → admin notification bell, setup page approve/reject/mark-paid with multi-select and search-fallback, transfer info CRUD for both roles, reworked generate flow blocked at 0 quota.
- Security check: no response payload contains raw DB ids; invalid/expired payment token rejected.

## Assumptions (flagged for confirmation)
- `payment_plan_user` columns were unspecified in the request — designed as above (quota `env_count`, `used_count`, state machine CREATE→ACTIVE/DEACTIVE, active/ended dates).
- The "number of environment that is remained" = `env_quota - used_count` on the ACTIVE assignment; quota unit is environments (links).
- Seed plan-day/env-count values (1/3/5/7/7/10/10/14 days, env_count=1) are placeholders — user gave fees only.
- `admin_transfer_info` and `seller_transfer_info` are implemented as one `transfer_info` table with `owner_type` (identical columns, shared component); split later only if needed.
- Bill rows are created when admin marks a payment PAID (no separate bill UI beyond the mark-paid action).
- Vietnamese bank list is a static frontend JSON asset, not a DB table/API.