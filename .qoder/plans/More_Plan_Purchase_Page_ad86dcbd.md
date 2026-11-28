# More Plan Purchase Page

## Summary

Today a logged-in user who already owns a usable plan cannot buy anything: [SelfServicePlanService.buyPlan](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/service/SelfServicePlanService.java#L135-L138) returns state `ACTIVE` and refuses, and `/plans` is the one-shot onboarding screen. This adds a permanent "More plan" entry in the header, left of the Setup button (`header.setup` = "Cài đặt"), and a `/morePlan` page with two purchase modes:

- **Buy a plan** - pick any catalog plan again; a new `payment_plan_user` assignment + payment is created. Quota already sums across usable ACTIVE assignments (`CorePaymentPlanService.findRemainingQuota`) and coverage end is the max end date, so the new plan stacks with the running one. No DB change.
- **Add days** - self-service version of the admin extension: N days on one of the caller's own ACTIVE plans, priced at the daily rate (`extensionFee`, ceiling). Reuses `PaymentPlanService.createExtension` / `applyExtension`.

Both produce an ordinary "Waiting for pay" row; the admin verifies and marks paid exactly as now. Confirmed scope: **every role except Admin** (SELLER + BUYER).

## Backend - publiclink-app

### 1. New response DTO
`paymentplan/response/MorePlanStateResponse.java` (`@Data`), the single payload the page reads and polls:
- `state`: `READY` | `WAITING_TRANSFER` | `WAITING_CONFIRM` (constants on the class). Unlike onboarding there is no terminal `ACTIVE`: the catalog stays available whenever no order is open.
- `contactEmail` (prefills the transfer confirmation), `remainingQuota` (int, links still creatable), `coverageEndDate` (String, latest paid-for date or null).
- `activePlans`: `List<PlanUserModel>` - the caller's ACTIVE assignments, newest first, payment-enriched; these are the extension targets.
- `pendingPayment`: `PaymentInfoResponse` of the open order (plan purchase or extension), null when none.

### 2. Service methods in `SelfServicePlanService`
Add three public methods wrapped in `publicLinkServiceTemplate.execute` (same style as `selectPlan`), identity always the gateway `X-User-ID` value:

- `moreState(String username)` -> `buildMoreState(username)`.
- `buyMore(String username, SelectPlanRequest request)` - reuse the existing `SelectPlanRequest` (`planCode`).
- `extendMore(String username, ExtendPlanRequest request)` - reuse the existing `ExtendPlanRequest` (`planUserCode`, `days`).

Shared rules, in this order:
1. `requireSelfServiceAdmin()` - unchanged 500 when `app.payment.self-service-admin` is blank.
2. `assertLocalAccount(username)` - unchanged 400. **This is the admin exclusion**: admins have no `publiclink-db.user` row. Add an explicit type guard on the resolved `User`: only `SELLER` / `BUYER` may buy, anything else gets 403 "This account cannot buy plans." Buyers do have a local row (`SellerPaymentPlanDomain.provisionBuyerAccount` -> `coreUserService.createNewUser` with `UserType.BUYER`).
3. **One open order at a time** (existing invariant): `firstOpenOrder(assignmentsWithPayments(username))` non-null -> return `buildMoreState(...)` with that order's instructions instead of creating a second one. Never double-bill.
4. `buyMore` only: `assertPlanOnSale(planCode)`, then `paymentPlanService.createSellerPlan(createRequest, selfServiceAdmin)` + `PaymentCreatedEvent` with `buildPlanLabel(fee, planDay)`. **Deliberately no `hasUsablePlan` guard** - that guard is the whole reason this feature exists.
5. `extendMore` only: validate `days` 1..3650 (mirror `MAX_EXTEND_DAYS`); resolve the target **inside the caller's own assignment list** (`assignmentsWithPayments(username)` filtered by `planUserCode`) so ownership is enforced by construction - absent -> 403 "This plan does not belong to you."; require `planState == "ACTIVE"` and `extendDays == null` (an extension order cannot be extended) -> 400 otherwise. Then `paymentPlanService.createExtension(planUserCode, days, selfServiceAdmin)` + `PaymentCreatedEvent` with the same content label the admin flow uses (`"mở rộng môi trường thêm %d ngày"`, ASCII-normalised by `GenerateQRDomain`).
6. Both return `buildMoreState(username)`.

`buildMoreState` fills: `activePlans` from `paymentPlanService.activeAssignments(username)` + `enrichWithPayment`, `remainingQuota` from `paymentPlanService.remainingQuota`, `coverageEndDate` from `DateUtils.dateToString(paymentPlanService.planCoverageEnd(username))`, `contactEmail` from `coreUserService.findUserEntityByUsername`, and `pendingPayment`/`state` from `firstOpenOrder` + the existing `paymentInfoOf` (which already re-issues an aged-out link and already renders extension orders via `PaymentDomainService`).

### 3. Endpoints in [SellerPlanController.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/controller/SellerPlanController.java)
Same `Mono.fromCallable(...).subscribeOn(boundedElastic()).flatMap(ResponseEntityConvertor::convertToMonoResponseEntity)` pattern, `@RequestHeader(HeaderConstant.USER_ID_HEADER)`:
- `GET  /api/v1/sellerPlan/moreState`
- `POST /api/v1/sellerPlan/buyMore` body `{planCode}`
- `POST /api/v1/sellerPlan/extendMore` body `{planUserCode, days}`

**No gateway change**: `/publiclink/api/v1/sellerPlan/**` falls through to `.anyExchange().authenticated()` in `SecurityConfig`, so BUYER is already allowed; only `/publiclink/admin/v1/**` is role-restricted.

### 4. Reused unchanged
`createSellerPlan` / `createExtension`, `GenerateQRDomain.onPaymentCreated` (VietQR from the configured admin's default account), `PaymentDomainService.confirmPayment` (notifies `payment.createdBy` = the self-service admin, with the actionable PAYMENT reference), `markPaidAssignments` (activates a new plan, routes `extendDays != null` through `applyExtension`), `notifyPlanActivated`, the Setup page "Waiting for pay" table and the bell's Mark-paid dialog. Existing `/select`, `/current`, `/myPlans`, `/check` and `/plans` are untouched.

## Frontend - frontend-publiclink

### 1. Header entry - [Header.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/Header.js#L115-L133)
Insert immediately **before** the Setup button so it renders to its left:
```jsx
{isAuthenticated && normalizedRole !== "admin" && normalizedRole !== "badminton_admin" && (
  <Button component={RouterLink} to="/morePlan" variant="text">
    {t("header.morePlan")}
  </Button>
)}
```
Two supporting changes in the same file:
- `homeTarget`: anonymous -> `/login`, admin -> `/adminHome`, seller -> `/sellerHome`, **any other authenticated role -> `/morePlan`** (today buyers are sent to `/login`, which bounces them).
- Notification bell condition becomes `isAuthenticated && normalizedRole !== "admin" && normalizedRole !== "badminton_admin"` so a buyer sees the "Plan activated" notification. Safe: `/api/v1/seller/notifications/**` is identity-scoped (`X-User-ID`), not role-gated, and the bell's Mark-paid action only appears when a PAYMENT payload is resolved (admin-only by delivery).

### 2. Route - [App.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/App.js#L173-L199)
New guarded block (leave the SELLER-only block as is):
```jsx
<Route element={<ProtectedRoute allowedRoles={["SELLER", "BUYER"]} />}>
  <Route path="/morePlan" element={<Layout><MorePlanPage /></Layout>} />
</Route>
```

### 3. New page - `src/page/MorePlanPage.js`
Reuse `PageContainer`, `CardWrapper`, `SectionBlock`, `PaymentInfoPanel`, `formatVND`; theme tokens only (no hard-coded colours/radii).
- On mount `pubApi.get("/api/v1/sellerPlan/moreState")`; catalog from the existing permit-all `pubApi.get("/api/v1/publish/plans")` (`res.data?.items`). **Copy the fixed fetch pattern from `PlanSelectPage`**: `catalogLoading` must NOT be in the effect dependency array, and retry bumps a `catalogAttempt` counter - otherwise the in-flight request self-cancels and the spinner never stops.
- Summary card: remaining links (`remainingQuota`), covered-until date (`coverageEndDate`), and a compact table of `activePlans` (fee, days, `usedCount/envQuota`, state chip, active/end dates) reusing the `setup.column.*` labels.
- `Tabs`: **Buy a plan** (catalog card grid identical to `PlanSelectPage`, select -> `POST /buyMore`) and **Add days** (target plan dropdown from `activePlans`, days `TextField` min 1 max 3650, live preview of amount `Math.ceil(fee * days / planDay)` and new end date `max(now, endedDate) + days` - same maths as `ExtendPlanDialog` -> `POST /extendMore`). Empty state on the Add days tab when there is no ACTIVE plan.
- When `state` is `WAITING_TRANSFER` / `WAITING_CONFIRM`: hide the tabs, show the waiting banner + `PaymentInfoPanel` (`info=pendingPayment`, `token=pendingPayment.paymentToken`, `defaultEmail=contactEmail`), poll `moreState` every 20 s (same `POLL_INTERVAL_MS`), and on `onConfirmed` flip the local status to `WAITING_CONFIRM`. When the poll returns `READY` again after an order settled, refresh and show a success alert.
- Errors: `err?.response?.data?.message` first, i18n fallback; retry button re-runs `moreState`.

### 4. Buyer landing - [LoginPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/LoginPage.js#L115-L129)
After the admin branch and before the `hasUsablePlan()` navigation:
```js
if (primaryRole !== "seller") { navigate("/morePlan"); return; }
```
so buyers (and any future non-admin role) land on a page they are allowed to open instead of being bounced by the SELLER-only `/sellerHome` guard.

### 5. i18n - both `src/i18n/locales/en/translation.json` and `vi/translation.json`
- `header.morePlan`: "More plan" / "Gói bán hàng".
- New `morePlan` namespace: `title`, `subtitle`, `summary.remaining`, `summary.coverage`, `summary.empty`, `tabs.buy`, `tabs.extend`, `catalogTitle`, `catalogHint`, `catalogEmpty`, `selected`, `continueToPayment`, `buying`, `extend.target`, `extend.days`, `extend.currentEnd`, `extend.newEnd`, `extend.amount`, `extend.amountNote`, `extend.submit`, `extend.noActivePlan`, `waitingMessage`, `pollingNote`, `activated`, `retry`, `errors.load`, `errors.catalog`, `errors.buy`, `errors.extend`, `errors.pickFirst`, `errors.daysInvalid`.
- Reuse existing `payment.unit.day`, `payment.unit.link`, `payment.status.*`, `setup.column.*`, `common.loading`. Key parity between en and vi is mandatory.

## Test Plan

1. `mvn -pl publiclink-app -am compile` (backend compiles; no DB migration is needed).
2. `npx eslint src/page/MorePlanPage.js src/Header.js src/App.js src/page/LoginPage.js` and `node -e "JSON.parse(...)"` on both translation files plus a flattened key-parity check. **Do not run `npm run build`** - it regenerates tracked `build/` artifacts and dirties the repo.
3. Manual QA after the user restarts the app (restarts are manual by design):
   - Seller with a running plan: header shows "More plan" left of "Cài đặt"; `/morePlan` shows quota + coverage; buy a second plan -> transfer panel with the configured admin's VietQR -> declare -> admin Mark Paid -> `remainingQuota` grows and coverage end moves to the later date.
   - Add days tab: preview matches the charged amount; after Mark Paid the target plan's `endedDate` moves and the order row reads `EXTENDED` (no extra quota).
   - Second purchase attempt while an order is unpaid returns the same order (no duplicate payment row).
   - Admin account: no "More plan" entry; a direct `POST /buyMore` with an admin JWT gets 400/403, never an order.
   - Buyer account: login lands on `/morePlan`, bell visible, purchase works; `/sellerHome` still refuses buyers.

## Assumptions

- "Setting menu" = the header Setup button (`header.setup` = "Cài đặt"); the new entry is a header text button to its left, not an item inside the avatar dropdown.
- One open order at a time is kept: while a purchase or extension is unpaid, the page shows that order instead of offering a new one.
- A newly bought plan starts on the admin's activation date (today by default), so windows may overlap; quota summing and max-coverage already handle this, and no core/DB change is made.
- `app.payment.self-service-admin` must be set (already `thachnn` in dev/qa; prod via `SELF_SERVICE_ADMIN_USERNAME`), otherwise both modes answer the existing 500.