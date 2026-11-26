# Plan Group Separation: PRODUCT vs BOOKING

## Summary

`payment_plan` gains a `plan_group` column (`PRODUCT` | `BOOKING`). Existing rows stay `PRODUCT` with today's prices untouched; 8 new `BOOKING` rows are seeded. `user` gains `plan_purpose`, chosen on `/register` and used to filter which group the plan screens show. Environment creation hard-blocks a group mismatch. `/morePlan` gains a third **Convert** tab that swaps a paid plan for a more expensive one in the same group, charging only `newFee - currentFee`.

Colors come from existing theme tokens, so no `theme.js` change: `PRODUCT` = `primary` (`#0f4c81` blue), `BOOKING` = `secondary` (`#ef6c36` orange). Both groups are text-labelled everywhere in addition to colour.

## Database (Liquibase, publiclink-app owns all DDL)

### `changeset-036-add-plan-group.sql` (new)
```sql
ALTER TABLE payment_plan
    ADD COLUMN plan_group VARCHAR(20) NOT NULL DEFAULT 'PRODUCT';
```
Then 8 idempotent inserts keyed on the full `(fee, plan_day, env_count, plan_group)` triple, because `PRODUCT` already owns colliding `(fee, plan_day)` pairs such as `15000/7`:

| fee | plan_day | env_count |
|---|---|---|
| 5000 | 1 | 1 |
| 15000 | 7 | 1 |
| 20000 | 7 | 3 |
| 20000 | 14 | 1 |
| 25000 | 14 | 3 |
| 25000 | 30 | 1 |
| 30000 | 30 | 3 |
| 35000 | 30 | 5 |

Each uses the changeset-021 idiom `SELECT UUID(), ... WHERE NOT EXISTS (SELECT 1 FROM payment_plan WHERE fee = ? AND plan_day = ? AND env_count = ? AND plan_group = 'BOOKING')`, with `plan_state = 'ACTIVE'` and descriptions in the existing style (`'5,000 VND / 1 day / 1 environment at a time'`). Changesets 021 and 024 are **not** edited (checksum validation).

### `changeset-037-add-plan-conversion.sql` (new)
```sql
ALTER TABLE `user`
    ADD COLUMN plan_purpose VARCHAR(20) NULL;

ALTER TABLE payment_plan_user
    ADD COLUMN converts_plan_user_code VARCHAR(36) NULL,
    ADD COLUMN convert_fee_delta DECIMAL(15,2) NULL;
```
`plan_purpose` is nullable exactly like changeset-033's `email`: every pre-existing account and every admin-created account keeps `NULL`, which the code reads as `PRODUCT`. Both new `payment_plan_user` columns are nullable so every existing row stays a normal assignment.

Register both in [db.changelog-master.xml](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/resources/db/changelog/db.changelog-master.xml) as `changeSet id="036"` and `id="037"`, author `thach`, after the existing 035 entry.

## Backend: group in the catalog

### New `model/PlanGroup.java`
Enum `PRODUCT`, `BOOKING` alongside `UserType`, with two static helpers:
- `fromPurpose(String)` — lenient, `BOOKING` only on an exact case-insensitive match, otherwise `PRODUCT`.
- `fromProductType(String)` — `YOGA_BOOKING` / `BADMINTON_COURT` map to `BOOKING`; `STANDARD` and `null` map to `PRODUCT`. Reuses the constants already in [CoreYogaEnvironmentService](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/core/service/CoreYogaEnvironmentService.java).

### Entities and models
- [PaymentPlan.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/entity/PaymentPlan.java): `@Column(name = "plan_group", nullable = false, length = 20) private String planGroup = "PRODUCT";`
- [PaymentPlanUser.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/entity/PaymentPlanUser.java): `convertsPlanUserCode` and `convertFeeDelta` (`BigDecimal`), documented as the conversion-order marker in the same style as the existing `extendDays` javadoc.
- [User.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/entity/User.java): `@Column(name = "plan_purpose", length = 20) private String planPurpose;`
- `PaymentPlanModel`: add `planGroup`.
- [PlanUserModel.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/core/model/PlanUserModel.java): add `planGroup`, `convertsPlanUserCode`, `convertFeeDelta`.
- [PaymentModel.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/core/model/PaymentModel.java): add `convertsPlanUserCode`, set in `CorePaymentService.toModel` from `assignment.getConvertsPlanUserCode()` right beside the existing `.extendDays(...)`.

### Repository
[PaymentPlanRepository](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/repository/PaymentPlanRepository.java) gains a group-filtered read, ordered so the frontend grid reads cheapest-first:
```java
@Query("SELECT p FROM PaymentPlan p WHERE p.planState = 'ACTIVE' AND p.planGroup = :planGroup "
     + "ORDER BY p.fee ASC, p.planDay ASC, p.envCount ASC")
List<PaymentPlan> findAllActiveByGroup(@Param("planGroup") String planGroup);
```
`findAllActive` stays as-is for the admin catalog, which must see both groups.

### Core service
[CorePaymentPlanService](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/core/service/CorePaymentPlanService.java):
- `findActivePlansByGroup(String planGroup)` wrapping the new query.
- `toPlanModel` maps `planGroup`.
- `createPlan(fee, planDay, envCount, description)` keeps its signature and delegates to a new 5-arg overload taking `planGroup`, so the admin create path is unchanged by default.
- `toAssignmentModel` gains a conversion branch mirroring the existing extension branch. Order of checks matters: `convertsPlanUserCode != null` first (fee = `convertFeeDelta`, the amount actually due), then `extendDays != null` (existing prorated fee), then the plain plan fee.

### DTOs
- `CreateCatalogPlanRequest` / `CreatedPlanResponse`: add `planGroup`; `PaymentPlanService.createCatalogPlan` defaults a blank value to `PRODUCT` and passes it into the new overload.
- [PlanCatalogResponse.PlanItem](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/paymentplan/response/PlanCatalogResponse.java): add `planGroup`.
- [ListPlanUserResponse.PlanUserItem](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/paymentplan/response/ListPlanUserResponse.java): add `planGroup`, `convertsPlanUserCode`, `convertFeeDelta`, mapped in `PaymentPlanAdminService.toItem` (around line 407).
- `SelfServiceStateResponse` and [MorePlanStateResponse](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/paymentplan/response/MorePlanStateResponse.java): add `planPurpose` so the screens know which group to fetch without a second call.

### Public catalog filtering
[PageController](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/controller/PageController.java) `/api/v1/publish/plans` gains `@RequestParam(required = false) String group`, forwarded to `SelfServicePlanService.publicCatalog(group)`. Blank `group` returns every active plan (each carrying `planGroup`) so the register screen can still preview both; a non-blank value routes to `findActivePlansByGroup`. The endpoint stays permit-all, so no gateway change.

## Backend: purpose captured at registration

### [SelfRegisterRequest](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/user/request/SelfRegisterRequest.java)
Add `planPurpose`, documented as `PRODUCT` for normal links / `BOOKING` for yoga and badminton, defaulting to `PRODUCT` when blank.

### [SelfRegisterService](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/service/SelfRegisterService.java)
Normalise next to the existing role normalisation (line 71):
```java
String planPurpose = PlanGroup.fromPurpose(request.getPlanPurpose()).name();
```
Thread it through `registerRemoteThenLocal` → `createRemoteAccount` → `writeLocalAccount` → `coreUserService.createSelfRegistered`. The remote account service is untouched: purpose is a publiclink-db business fact, not an identity fact, so `toCreateRequest` does not change.

### [CoreUserService](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/core/service/CoreUserService.java)
`createSelfRegistered` gains a fifth `planPurpose` parameter and sets it on the new `User`. The existing 4-arg method is kept as an overload delegating with `null`, so `createSelfRegisteredSeller` and the invite flow (`createNewUser`) are unchanged and keep producing `NULL` = legacy `PRODUCT`.

### Purpose switching
`SelfServicePlanService.changePurpose(username, ChangePlanPurposeRequest)` exposed as `POST /api/v1/sellerPlan/purpose` on [SellerPlanController](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/controller/SellerPlanController.java). It exists because conversion is same-group only, so a user who picked the wrong purpose at registration needs an explicit escape hatch. Behaviour:
- `purchasingAccountOrThrow(username)` — same gate as `buyMore`, so admins get 400 and non-SELLER/BUYER get 403.
- Refuse with 400 when `firstOpenOrder(assignments) != null`: an unpaid order belongs to the old group and the one-open-order rule would otherwise strand it. Message names the open order.
- Otherwise persist the new purpose on the `user` row and return `buildState(username)`.

## Backend: hard block on the wrong group

### Repository
[PaymentPlanUserRepository](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/repository/PaymentPlanUserRepository.java) gains group-filtered twins of the two window queries, each adding `JOIN ppu.plan p` and `AND p.planGroup = :planGroup`:
- `findUsableActiveByUserNameAndGroup(username, now, planGroup)`
- `findUsableActiveByUserNameForUpdateAndGroup(username, now, planGroup)` with the same `@Lock(PESSIMISTIC_WRITE)`
- `findActiveByUserNameAndGroup(username, planGroup)`

The unfiltered originals stay: `SellerHome`'s banner, `LoginPage`'s redirect probe and `SaleWindowEditDialog`'s coverage read are all group-agnostic and must keep working.

### [PlanGateModel](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/core/model/PlanGateModel.java)
Add `REASON_WRONG_GROUP = "WRONG_GROUP"` and a `planGroup` field carrying the group that was required.

### CorePaymentPlanService
Add `evaluate(username, planGroup)`, `findRemainingQuota(username, planGroup)` and `consumeOne(username, planGroup)`. The group-aware `evaluate` decides in this order, so a seller who paid for the other kind is told that rather than being told they have no plan:
1. `findActiveByUserName` empty → `NO_PLAN`.
2. Group-filtered usable non-empty → `OK`, with `deadline` from the assignment that supplied the slot.
3. Group-filtered active non-empty but outside its window → reuse `blockedGate` (`NOT_STARTED` / `EXPIRED` / `QUOTA_EXHAUSTED`).
4. Otherwise → `WRONG_GROUP`, message naming the required group and pointing at `/morePlan`.

`consumeOne(username, planGroup)` increments `used_count` on a row from the group-filtered `ForUpdate` query and returns the `WRONG_GROUP` gate when that list is empty but the unfiltered one is not.

### PaymentPlanService
`evaluate(username, planGroup)`, `remainingQuota(username, planGroup)` and `consumeQuotaOrThrow(username, planGroup)` overloads; the existing single-arg methods delegate with `null` meaning "any group".

### [SaleEnvironmentServiceImpl.createSaleEnvironment](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/saleenv/impl/SaleEnvironmentServiceImpl.java) (lines 164-204)
This is the single enforcement point, and it already has the product type in hand:
```java
final String planGroup = PlanGroup.fromProductType(
        requestObject.getProductRequest() == null ? null
                : requestObject.getProductRequest().getProductType()).name();
final PlanGateModel planPreview = paymentPlanService.evaluate(sellerUsername, planGroup);
...
paymentPlanService.consumeQuotaOrThrow(sellerUsername, planGroup);
```
A null product request keeps today's behaviour (`PRODUCT`), and the read-only preview still runs before the window is resolved, so a `WRONG_GROUP` refusal spends no slot.

### [CheckPlanRequest](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/paymentplan/request/CheckPlanRequest.java) / checkPlan
Add an optional `productType`. `PaymentPlanAdminService.checkPlan` calls the group-aware `evaluate` when it is present and the group-agnostic one when blank, so `SellerHome`'s body-less `POST /sellerPlan/check` keeps its current banner semantics. `CheckPlanResponse` gains `planGroup`. `SellerPlanController.check` takes `@RequestBody(required = false) CheckPlanRequest` and still overrides `username` from the `X-User-ID` header, never from the body.

### Onboarding guard
`SelfServicePlanService.hasUsablePlan` becomes group-aware on the caller's stored purpose (`paymentPlanService.remainingQuota(username, purposeOf(username)) > 0`), so a `BOOKING`-purpose account that only owns a `PRODUCT` plan is offered the catalog instead of being told it is already covered. `firstOpenOrder` stays group-agnostic on purpose: the one-open-order rule is about money, not about product type.

## Backend: plan conversion

### CorePaymentPlanService
```java
@Transactional
public PlanUserModel createConversionAssignment(String sourcePlanUserCode, String targetPlanCode)
```
- Source must be `ACTIVE` and must not itself be an order (`extendDays == null && convertsPlanUserCode == null`).
- Target must exist and `target.planGroup` must equal `source.plan.planGroup`; a mismatch is a `ValidationException` (conversion never crosses groups).
- `delta = target.fee - source.plan.fee` must be `> 0`; the non-positive path never reaches here because the service layer answers it without opening an order.
- Writes an order row: `plan` = target, `envQuota` = 0, `usedCount` = 0, `planState` = `CREATE`, `convertsPlanUserCode` = source code, `convertFeeDelta` = delta. It grants nothing by itself, exactly like an extension row.

```java
@Transactional
public PlanUserModel applyConversion(String conversionPlanUserCode)
```
Implements the chosen "restart window, new quota" semantics by mutating the **source** assignment in place rather than adding a third row, so no `sale_environment` reference is disturbed:
- `source.plan` = target plan, `source.envQuota` = `target.envCount`, `source.usedCount` = 0
- `source.activeDate` = now, `source.endedDate` = now + `target.planDay`
- `source.planState` stays `ACTIVE`
- the order row is closed as `CONVERTED`, mirroring how `applyExtension` closes its row as `EXTENDED`

The order row is the audit trail: it names the target plan, the source code, the delta and the payment, so "on date X plan Y became plan Z for D VND" stays recoverable without extra columns.

### PaymentPlanService.createConversion
Mirrors `createExtension` (lines 331-354): create the order, `corePaymentService.createPayment(order.getPlanUserCode(), order.getFee(), adminUsername)` — where `getFee()` is the delta, so the money row is the difference and not the full price — build and store the payment URL, and return a new `ConvertPlanResponse` (`sourcePlanUserCode`, `conversionPlanUserCode`, `targetPlanCode`, `feeDelta`, `targetFee`, `targetPlanDay`, `targetEnvCount`, `paymentCode`, `paymentUrl`, `status`, `newActiveDate`, `newEndedDate`).

### markPaidAssignments
[PaymentPlanService.markPaidAssignments](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/domain/paymentplan/PaymentPlanService.java) (lines 274-301) gains a branch ahead of the existing extension check, so a paid conversion applies immediately:
```java
if (assignment.getConvertsPlanUserCode() != null) {
    corePaymentPlanService.applyConversion(planUserCode);
    converted++;
} else if (assignment.getExtendDays() != null) { ... }
```
Notify the seller through `coreNotificationService.notifyUsernames` with reference type `PLAN`, swallowing failures exactly as `notifyPlanActivated` does, so a notification error never undoes a paid conversion.

### [PaymentDomainService.toInfoResponse](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/domain/paymentplan/PaymentDomainService.java) (lines 97-129)
Add a conversion branch before the extension one: when `payment.getConvertsPlanUserCode() != null`, set `fee` to `payment.getAmount()` (the delta the buyer actually transfers), keep `planDay` / `envCount` from the target plan, and set `estimatedActiveDate` = today, `estimatedEndDate` = today + `planDay`, matching the restart-window semantics.

### SelfServicePlanService.convertPlan
`POST /api/v1/sellerPlan/convert` with `ConvertPlanRequest { planUserCode, targetPlanCode }`, answering `MorePlanStateResponse` extended with a `conversionOutcome` object `{ result, feeDelta, targetFee, targetPlanDay, targetEnvCount }` where `result` is `ORDER_CREATED` or `NO_PAYMENT`.

Flow, reusing the `extendOwnPlan` shape (lines 413-455):
1. `requireSelfServiceAdmin()`, `purchasingAccountOrThrow(username)`, `assertPlanOnSale(targetPlanCode)`.
2. Ownership is settled by searching `planUserCode` only inside the caller's own `assignmentsWithPayments`, so another account's plan is simply not there → 403.
3. Source must be `ACTIVE` and not an order.
4. Target group must equal source group → 400 with a message naming both groups.
5. `delta = targetFee - sourceFee`:
   - **`delta > 0`** → refuse when `firstOpenOrder(assignments) != null` (hand the open order back, same as `buyMore`), otherwise `createConversion`, publish `PaymentCreatedEvent` with the delta as the amount and a Vietnamese transfer content in the `EXTEND_CONTENT` style (`"chuyển đổi gói %d VND"`), return `ORDER_CREATED` plus `pendingPayment`.
   - **`delta <= 0`** → no order row and no payment row at all. Call `corePaymentPlanService.applyConversionDirectly(source, target)` (a variant of `applyConversion` that takes the two codes, since there is no order row to read) inside a `@Transactional` boundary, notify the seller and the `selfServiceAdmin`, and return `NO_PAYMENT` with the signed delta so the UI can state how much was forfeited.

## Frontend: register purpose step

### [SelfRegisterPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/SelfRegisterPage.js)
- Add `planPurpose: ""` to the `form` state.
- Render the selector **only when `!isPlayerReturn`** — a player arriving from the badminton page with `next=/api/v1/publish/saleUrl...` becomes a `BUYER` and never buys a plan, so showing it a plan-purpose choice would be noise.
- Two full-width selectable `Card` + `CardActionArea` tiles, text only (no icons, per the project's icon-free MUI constraint), each with a coloured left border and a coloured `Chip` label:
  - `PRODUCT` — `primary` colour, title `selfRegister.purpose.product.title`, description naming normal product sale links.
  - `BOOKING` — `secondary` colour, title `selfRegister.purpose.booking.title`, description naming yoga class and badminton court booking links.
- Selected tile gets `borderColor: <group>.main`, `borderWidth: 2` and a `selected` chip, reusing the selection idiom already in `PlanSelectPage`'s plan cards.
- `validate()` adds `next.planPurpose = t("selfRegister.errors.purposeRequired")` when empty; the submit button stays enabled so the error surfaces in place.
- `afterNote` becomes purpose-specific: `selfRegister.purpose.product.afterNote` / `selfRegister.purpose.booking.afterNote`, so the user is told before submitting which plan list they are about to see.
- POST body gains `planPurpose: form.planPurpose`.

Purpose is **not** threaded through the login navigation state; `SelfServiceStateResponse.planPurpose` is the single source of truth once signed in.

## Frontend: grouped, coloured plan screens

### Shared group presentation
Add `src/util/planGroup.js` exporting one map, so the colour and the wording never drift between screens:
```js
export const PLAN_GROUP = {
  PRODUCT: { color: "primary",   productTypes: ["STANDARD"] },
  BOOKING: { color: "secondary", productTypes: ["YOGA_BOOKING", "BADMINTON_COURT"] },
};
export const groupColor = (group) => PLAN_GROUP[group]?.color || "primary";
```
Both `PlanSelectPage` and `MorePlanPage` render a heading row per group: a `Chip` with `color={groupColor(group)}` and label `plans.group.<GROUP>.label`, plus `plans.group.<GROUP>.hint` explaining in plain words what that group can and cannot create. The CTA button uses `color={groupColor(group)}` with `variant="contained"`, giving the two groups visibly different buttons.

### [PlanSelectPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/PlanSelectPage.js)
- Read `purpose = state?.planPurpose || "PRODUCT"` and fetch `/api/v1/publish/plans?group=${purpose}`; add `purpose` to the catalog effect dependency list and reset `catalogLoaded` when it changes, otherwise the switch below would keep showing the stale group.
- `catalogHint` is replaced by the group-specific hint; the grid, selection and `handleBuy` are unchanged apart from the button colour.
- Below the grid, a `Link`-styled button `plans.switchPurpose.link` opens a confirm `Dialog` stating that switching changes which plans are offered and that an open order blocks it. On confirm, `POST /api/v1/sellerPlan/purpose` with the other group, then `setState(res.data)` and force a catalog refetch via `setCatalogLoaded(false)` plus the existing `catalogAttempt` bump. Hidden entirely while an order is open, matching the backend refusal.
- The `STATE_ACTIVE` alert gains a group chip so the seller can see what they actually own.

### [MorePlanPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/MorePlanPage.js) — Buy tab
Filter the catalog fetch by `state.planPurpose` the same way, and add a `planGroup` chip column to the "What you pay for now" table so a mixed account can tell its plans apart. `remainingQuota` stays the honest cross-group total; the per-plan chips provide the breakdown.

## Frontend: Convert tab

Third `Tab` in `MorePlanPage`, rendered only when `!isOpenOrder && state`, labelled `morePlan.tabs.convert`.

- **Source picker**: `TextField select` over `activePlans.filter(p => p.extendDays == null && p.convertsPlanUserCode == null)`, the same ownership-safe filter the Extend tab already applies, with each option showing fee, days, links and the group label.
- **Target grid**: fetched from `/api/v1/publish/plans?group=<sourceGroup>`, excluding `source.planCode` itself, rendered with the existing card idiom and the group colour. Refetched when the source selection changes group.
- **Difference panel**, computed client-side as `delta = Number(target.fee) - Number(source.fee)`:
  - `delta > 0` → `Alert severity="info"` with `morePlan.convert.payMore` interpolated with `formatVND(delta)`; contained button `color={groupColor(sourceGroup)}`, label `morePlan.convert.submitPay`.
  - `delta === 0` → `Alert severity="warning"` with `morePlan.convert.samePrice`: the plan changes immediately, nothing is charged, no refund.
  - `delta < 0` → `Alert severity="warning"` with `morePlan.convert.loseMoney`, interpolating `formatVND(Math.abs(delta))` and stating explicitly that this amount **is not refunded and is lost**, that the plan still changes immediately, and that the new window restarts today with the new plan's link count. Button `color="warning"`, variant `outlined`, label `morePlan.convert.submitAcceptLoss`.
  - Every case also shows `morePlan.convert.restartNote`: the new plan starts today for its full length and its link quota replaces the old one; links already created keep running to their own end date.
- **Submit**: `POST /api/v1/sellerPlan/convert` with `{ planUserCode, targetPlanCode }`.
  - `result === "ORDER_CREATED"` → `setState(res.data)`; the existing open-order branch renders `PaymentInfoPanel` with the delta amount, and the existing 20s polling waits for the admin.
  - `result === "NO_PAYMENT"` → render `Alert severity="success"` with `morePlan.convert.noPaymentSuccess`, then navigate Home. Resolve Home with the same rule [Header.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/Header.js) uses (lines 42-49): `seller` → `/sellerHome`, any other non-admin signed-in role → `/morePlan`. Use a short `setTimeout` after painting the success alert, or better a `done` state flag with a `Button` to `/sellerHome`, so the message is actually readable before the route changes.
- Errors reuse `setError` with `err?.response?.data?.message || t("morePlan.errors.convert")`.

## Frontend: admin and queue surfaces

- [CreateSellerPlanDialog.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/form/CreateSellerPlanDialog.js): the admin catalog now returns both groups, so add a group `Chip` to each Existing-plan row, a group filter above the list, and a group selector in the New-plan tab posting `planGroup` in `CreateCatalogPlanRequest`. Without this an admin could re-create the exact mistake the separation exists to prevent.
- [SetupPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/SetupPage.js) (around line 415): extend the existing `row.extendDays` special-case chip with a sibling branch for `row.convertsPlanUserCode`, so a conversion queue row reads "converts plan" instead of an unexplained `0/0`.
- [SellerGenerateForm.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/form/SellerGenerateForm.js) (lines 123-135): map `data.reason === "WRONG_GROUP"` to `t("sellerGenerate.wrongGroup")` alongside the existing `QUOTA_EXHAUSTED` mapping, and render the group of each of the seller's own plans in the step-1 list so the mismatch is visible before the 403 arrives from `createSaleEnvironment`.
- [SellerHome.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/SellerHome.js) (lines 287-301): `WRONG_GROUP` is a real, actionable state, so it must **not** join `QUOTA_EXHAUSTED` in the suppressed-reason condition; `sellerHome.planBanner.WRONG_GROUP` renders with the existing "buy a plan" action button pointing at `/morePlan`.

## i18n

Add matching keys to **both** [en/translation.json](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/i18n/locales/en/translation.json) and [vi/translation.json](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/i18n/locales/vi/translation.json) (parity is checked by flattening both files):

- `plans.group.PRODUCT.{label,hint}`, `plans.group.BOOKING.{label,hint}`, `plans.switchPurpose.{link,dialogTitle,dialogBody,confirm,cancel,failed}`
- `selfRegister.purpose.{title,helper}`, `selfRegister.purpose.product.{title,description,afterNote}`, `selfRegister.purpose.booking.{title,description,afterNote}`, `selfRegister.errors.purposeRequired`
- `morePlan.tabs.convert`, `morePlan.convert.{hint,source,target,difference,payMore,samePrice,loseMoney,restartNote,submitPay,submitAcceptLoss,submitting,noPaymentSuccess,goHome,samePlan,noTarget}`, `morePlan.errors.convert`
- `sellerHome.planBanner.WRONG_GROUP`, `sellerGenerate.wrongGroup`
- `setup.column.planGroup`, `setup.chip.conversion`

The `loseMoney` string is the one that must be unambiguous: it names the forfeited amount, says it is not refunded, and says the conversion still happens.

## Test Plan

Backend (`mvn -q -pl publiclink-app -am test`, surefire reports are the source of truth, not the logged stack traces):
- `PlanGroupTest` — `fromProductType` for `STANDARD`/`null`/`YOGA_BOOKING`/`BADMINTON_COURT`/unknown, `fromPurpose` leniency.
- `CorePaymentPlanServiceConversionTest` — delta must be positive; cross-group target refused; `applyConversion` restarts the window from today, sets `envQuota` to the target's `envCount`, resets `usedCount` to 0, and closes the order as `CONVERTED`.
- Group-gate test — a seller with only a `PRODUCT` plan evaluating for `BOOKING` gets `WRONG_GROUP`, not `NO_PLAN`; with no plans at all still `NO_PLAN`; an expired same-group plan still `EXPIRED`.
- `SelfServicePlanServiceTest` — `convertPlan` with `delta <= 0` creates no `payment_plan_user` row and no `payment` row and returns `NO_PAYMENT`; with `delta > 0` returns `ORDER_CREATED` and an open order; a source not owned by the caller is 403; an open order blocks a positive-delta conversion.

Frontend (`npm test`, `npx eslint src`):
- Extend the existing suite with a `MorePlanPage` convert-tab test covering the three delta branches, that a `NO_PAYMENT` answer renders the success message and offers the Home navigation, and that no POST is issued before the user accepts a loss.
- `SelfRegisterPage` test: submit is refused with `purposeRequired` until a tile is picked, and the POST body carries the chosen `planPurpose`; the selector is absent on the player-return path.
- Validate both translation files with `node -e "JSON.parse(...)"` and a flattened-key parity check. Do **not** run `npm run build` — it dirties tracked CRA build artifacts.

Manual QA (split topology: CRA on the Mac, gateway on Windows, `publiclink-app` on the Mac at 9080, manual restarts):
1. Restart `publiclink-app` and confirm Liquibase applies 036/037; `curl http://localhost:9080/publiclink/api/v1/publish/plans` returns 8 `BOOKING` items plus the existing `PRODUCT` ones with `planGroup` populated.
2. Register a new `BOOKING`-purpose seller, sign in, confirm `/plans` shows only the 8 booking plans with orange accents, buy one, mark it paid as admin.
3. As that seller, try to generate a `STANDARD` product link and confirm a 403 whose message names the wrong group; then generate a `YOGA_BOOKING` link and confirm it succeeds.
4. Convert 15000/7/1 → 35000/30/5, confirm the payment page amount is 20000 (the delta, not 35000), mark paid, confirm the window restarted today for 30 days with 5 links.
5. Convert 35000/30/5 → 5000/1/1, confirm the loss warning names 30000 VND, accept, confirm the success message, the Home navigation, and that no new row appeared in the admin "Waiting for pay" queue.

## Assumptions

- **A conversion with `delta <= 0` still changes the plan and forfeits the difference.** This follows the request ("if negative number or 0 different amount and user accept to next step >> no need to generate payment plan, display success message"), and it means a seller can move from 35000/30/5 down to 5000/1/1 for free. Flag this if you want a downgrade to be refused instead, or to require admin approval.
- Conversion never crosses groups, per the chosen scope. The remedy for a wrong-group purchase is the explicit purpose switch on `/plans`, not a conversion.
- Resetting `usedCount` to 0 on conversion is intended: a seller with 3 live links who converts to a 1-link plan can create 1 new link, and the 3 existing links keep running to their own end dates.
- Existing accounts with `plan_purpose IS NULL` are treated as `PRODUCT`, so every current seller keeps seeing exactly the catalog they see today.
- Existing `PRODUCT` prices and the 021/024 seeds are untouched; the 8 booking plans are additive.
- The player registration path from the badminton page (`next=/api/v1/publish/saleUrl...`, role `BUYER`) is unchanged and shows no purpose selector.
- No gateway change is required: `/publiclink/api/v1/sellerPlan/**` already falls under `anyExchange().authenticated()` and `/api/v1/publish/plans` is already permit-all.