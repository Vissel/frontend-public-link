# Self-Register Onboarding Flow

## Summary

New users onboard themselves in 3 screens: **Register** (account + email) -> **Login** -> **Select Plan & Pay** (catalog cards, VietQR transfer, confirm, wait for admin activation). Confirmed decisions: activation stays **manual admin verify** (existing Setup page "Mark Paid"); self-service payments go to a **configured receiving admin** (`app.payment.self-service-admin`). The existing invite-only register (`/api/v1/publish/register`) and token-link payment page (`/payment`) stay untouched.

User journey state machine on `/plans`: `NO_PLAN` (pick a plan) -> `CREATE` (transfer + confirm) -> `WAITING_CONFIRM` (poll until admin marks paid) -> `ACTIVE` (go to workspace).

## Backend — publiclink-app

### 1. Email persistence (DB + entity)
- New `src/main/resources/db/changelog/changeset-032-add-user-email.sql`: `ALTER TABLE user ADD COLUMN email VARCHAR(100) NULL;` + `<changeSet id="032">` entry in `db.changelog-master.xml`.
- [User.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/entity/User.java): add `private String email;`.
- `UserModel` + `SellerDTO`: add `email`; map it in `CoreUserService.createNewUser`, `findByUsername`, `toAssignmentModel` untouched. Set `authenticationMethod = BASIC` on self-registered rows.
- `UserRepository.findByFilters`: change the email predicate from `u.link LIKE` to `u.email LIKE` (currently searches the wrong column).
- Email is stored only in publiclink-db (contact info); user-service `user_tbl` is NOT changed. `payment.seller_email` still captured at confirm.

### 2. Open registration endpoint (public)
- `POST /api/v1/publish/self-register` in [PageController.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/controller/PageController.java) (already under gateway permit-all `publiclink/api/v1/publish/**`).
- New `SelfRegisterRequest` (`username`, `password` RSA-encrypted, `name`, `email` `@NotBlank @Email`) and `SelfRegisterResponse` (`username`, `message`).
- New `SelfRegisterService` using `PublicLinkServiceTemplate` + reactive `OperatedUserClient` chain (no `.block()`):
  1. `findUserByUsername` -> if `encodedPassword != null` return 409 "Username already exists".
  2. `createUser` with `role=SELLER`, encrypted password, fullName (reuse `UserRegisterRequest`).
  3. On success, create local row via `coreUserService.createNewUser` (with email, BASIC) inside `Mono.fromCallable(...).subscribeOn(boundedElastic())`; on local failure call `operatedUserClient.deleteUser` as compensation (mirrors existing register flow).
  4. `.timeout(5s)` + `.onErrorResume` on remote calls -> 503 with clear message.
- Username rule: 3-30 chars, alphanumeric + `._-` (validated both sides).

### 3. Public plan catalog (public)
- `GET /api/v1/publish/plans` in `PageController` -> `paymentPlanService.catalog()` (already filters ACTIVE) -> reuse `PlanCatalogResponse` shape (`items[{planCode, fee, planDay, envCount, description}]`).

### 4. Seller plan selection + state (JWT, X-User-ID)
In [SellerPlanController.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/controller/SellerPlanController.java), identity always from `HeaderConstant.USER_ID_HEADER`:
- `POST /api/v1/sellerPlan/select` body `{planCode}` -> new `SelfServicePlanService.selectPlan(username, planCode)`:
  - Guard: usable ACTIVE plan exists (`findUsableActiveByUserName`) -> 409 "You already have an active plan".
  - Idempotency: latest CREATE-state assignment with a CREATE/WAITING_CONFIRM payment -> return that payment's info instead of creating a duplicate.
  - Otherwise reuse `corePaymentPlanService.createAssignment` + `corePaymentService.createPayment(planUserCode, fee, selfServiceAdmin)` + `PaymentPlanService.buildPaymentUrl` pattern + publish `PaymentCreatedEvent` (triggers existing `GenerateQRDomain` VietQR creation), exactly like `PaymentPlanAdminService.createSellerPlan`.
  - `@Value("${app.payment.self-service-admin:}")` — blank -> 500 "Self-service payment is not configured" (fail fast, documented in `application.properties` comment).
  - Response: `PaymentInfoResponse` fields + `paymentToken` (extracted from the generated payment URL) so the screen can confirm without parsing URLs.
- `GET /api/v1/sellerPlan/current` -> `{ contactEmail, activePlan, pendingPayment }`:
  - `activePlan`: first of `findUsableActiveByUserName` (null if none).
  - `pendingPayment`: newest assignment in CREATE state whose latest payment is CREATE/WAITING_CONFIRM; build info via `PaymentDomainService.paymentInfo(token)`; token taken from stored `paymentUrl`, regenerated via existing `regeneratePaymentLinks` logic when `linkService.validateLink` fails (expired link keeps working). Include `paymentToken` + `contactEmail` (from user row) for confirm prefill.
  - New repo query: `PaymentPlanUserRepository.findByUserUserNameOrderByCreatedAtDesc(String username)`.
- Confirm payment: **reuse unchanged** `POST /api/v1/publish/payment/confirm` (token + email + phone; notifies receiving admin already).

### 5. Activation (unchanged) + seller notification
- Admin verifies transfer in existing Setup page -> `markPaid` -> plan ACTIVE. Self-service rows appear in the same queue because they are ordinary `payment` rows with `createdBy = selfServiceAdmin`.
- Small addition in `PaymentPlanService.markPaidAssignments`: after `activate(...)`, `coreNotificationService.notifyUsernames(List.of(username), "Plan activated", ...)` so the seller gets an in-app notification.

### 6. Gateway
- No code change: publish paths already permit-all; `/api/v1/sellerPlan/**` already JWT-guarded (myPlans/check work today). Verify rate-limiter config covers the two new publish endpoints.

## Frontend — frontend-publiclink

### 7. Screen 1: Register — new `src/page/SelfRegisterPage.js`, route `/register`
- Layout: `PageContainer maxWidth="sm"` + `CardWrapper`, matching LoginPage. Title + subtitle, then a 3-step guideline strip (MUI `Stepper`, non-linear, all steps shown): **1 Create account -> 2 Choose plan & transfer -> 3 Admin activates, start selling** with one-line descriptions.
- Fields: username, full name, **email (required, type=email, helper "used to contact you about your plan and payment")**, password (min 8, same rule as BuyerSetupPage), repeat password (live mismatch validation).
- Submit: fetch/cache RSA public key from `/api/v1/auth/public-key` (same sessionStorage pattern as RegisterPage), JSEncrypt password, `pubApi.post("/api/v1/publish/self-register", ...)`.
- Errors mapped: 409 -> "username taken", 400 -> validation message from body, 502/503/504 -> service unreachable, else generic.
- Success: `navigate("/login?username=<u>&next=/plans")` with a success note; footer link "Already have an account? Log in".

### 8. Screen 2: Login — edit `src/page/LoginPage.js`
- Add "New here? Create an account" `RouterLink` to `/register` under the submit button.
- Post-login seller routing: after `login()`, call `api.post("/api/v1/sellerPlan/check")`; `allowed=true` -> `/sellerHome`, otherwise -> `/plans` (covers NO_PLAN / NOT_STARTED / EXPIRED / QUOTA_EXHAUSTED). Honor `next` query param only for internal paths (`/plans`). Admin and `reqUuid` flows unchanged.

### 9. Screen 3: Plan & Payment — new `src/page/PlanSelectPage.js`, route `/plans` (ProtectedRoute SELLER)
- Header: title + same 3-step `Stepper`, current step derived from state (account done -> step 2 active; waiting -> step 3).
- On mount: `GET /api/v1/sellerPlan/current` (JWT via `api`). Render by state:
  - **No active plan, no pending payment**: fetch `GET /api/v1/publish/plans` via `pubApi`; render selectable plan cards (Grid of Cards: fee formatted VND, days, link quota, description, selected card gets `primary.main` border + check icon). "Continue to payment" -> `POST /api/v1/sellerPlan/select` -> switch to payment panel.
  - **Payment CREATE**: shared `PaymentInfoPanel` (below) with `paymentToken`; confirm dialog email prefilled from `contactEmail`, phone optional.
  - **WAITING_CONFIRM**: panel + info Alert "We received your confirmation. An admin verifies the transfer and activates your plan." + status Chip; poll `/current` every 20s (setInterval, cleaned on unmount; stop when active).
  - **ACTIVE**: success Alert + plan summary (window, quota) + contained Button "Go to my workspace" -> `/sellerHome`.
- Empty catalog / load errors: Alert + retry button.

### 10. Shared payment UI extraction
- New `src/components/PaymentInfoPanel.js`: move plan-summary card, VietQR card, transfer-accounts card (copy buttons, default highlight), confirm dialog from [PaymentPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/PaymentPage.js) into a reusable component taking `info`, `status`, `onConfirmed`, `defaultEmail`. Refactor PaymentPage to consume it (behavior unchanged); PlanSelectPage consumes it too. Copy helper moves to `src/util/clipboard.js` (dev-fe copy pattern).

### 11. Wiring
- `src/App.js`: add public `/register` route and `/plans` inside the SELLER `ProtectedRoute` block.
- `src/Header.js`: add "Register" outlined Button next to Login when unauthenticated.
- `src/page/SellerHome.js`: when plan check reason is NO_PLAN/NOT_STARTED, show an info Alert with a "Choose a plan" link to `/plans` (covers direct navigation).
- i18n: new namespaces `selfRegister`, `plans` in **both** `src/i18n/locales/en/translation.json` and `vi/translation.json`; add `login.registerLink`, `header.register`; reuse existing `payment.*`, `transferInfo.*`, `common.*` keys in the panel.

## Test Plan
- Backend: `mvn -pl publiclink-app -am package -DskipTests` compiles; start app so Liquibase runs changeset-032 (manual restart per project convention). Curl: self-register (new + duplicate 409), catalog, login, select (fresh + idempotent repeat + active-plan 409), current, confirm, admin markPaid -> current shows activePlan.
- Frontend: `npm run build` passes; run dev server and walk the full journey at desktop + mobile widths: register -> login -> plans -> select -> QR renders -> confirm -> waiting state polls -> (admin markPaid) -> active -> workspace. Verify invite register + old `/payment` link still work.
- i18n: switch EN/VI on all 3 screens, no missing keys.

## Assumptions
- Email is contact info only — no SMTP verification loop in this iteration.
- Receiving admin username is set in `publiclink-app` `application.properties` (`app.payment.self-service-admin`) before go-live; its default ACTIVE transfer account must exist (same requirement as admin-created payments).
- No auto payment reconciliation; admin verifies transfers manually as today.
- Self-registered accounts get SELLER role immediately; the existing quota gate (`/sellerPlan/check`) blocks link generation until a plan is ACTIVE.