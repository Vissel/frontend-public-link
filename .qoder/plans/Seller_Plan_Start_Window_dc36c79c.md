# Seller Plan Start Window

Seller side of this feature is already built and verified (92 backend / 77 frontend tests). This revision keeps that record accurate and adds the missing half: **the admin must be able to see and change the plan start, both while the order waits for payment confirmation and after the plan is already ACTIVE.** `seller_payment_plan` (buyer plans) is untouched.

## Shipped already (seller side) — for reference

- `changeset-040-add-requested-plan-start.sql` adds `payment_plan_user.requested_start_at DATETIME NULL` (038 and 039 were already taken; the earlier draft said 038).
- `POST /api/v1/sellerPlan/window` (`SellerPlanController` → `SelfServicePlanService.planWindow`) returns `{ startAt, endAt, planDay }`, wire format `yyyy-MM-dd'T'HH:mm`, default start = now to the minute, past start refused (400). Pure calculation, no writes.
- `SelectPlanRequest.startAt` → `CreateSellerPlanRequest.startAt` → `CorePaymentPlanService.createAssignment(username, planCode, startAt)`, which stores `requestedStartAt` and projects `activeDate/endedDate`.
- `CorePaymentPlanService.activate` honours a future `requestedStartAt` unless the admin's date is not today.
- `PaymentModel.requestedStartAt/requestedEndAt` + `PaymentDomainService.toInfoResponse` show the chosen window on the payment page.
- `src/form/PlanWindowDialog.js` wired into `PlanSelectPage` and `MorePlanPage` Buy tab.

## The gap

- **Waiting for confirmation:** the admin only has one shared `DatePicker` (`SetupPage.js` line ~651, default today) and no time at all. A picked date counts as an override only when it is not today (`isToday` in `CorePaymentPlanService`), which is invisible: picking today at 14:00 is indistinguishable from not touching the field.
- **In payment plan:** once a row is ACTIVE the Setup page offers only Deactivate and Extend. There is no way to correct a start, and `CorePaymentPlanService` has no method that edits a running window.

Confirmed decisions for the fix:
- Changing the start of an ACTIVE plan keeps the paid length: `end = start + plan.planDay`.
- The Setup start field is **empty by default**: blank = honour the seller's requested start; any value, including today at a time, is an explicit override.

## Behaviour after this change

### 1. Setup start field (bulk Mark paid / Activate)
- Replaces the date field: `DateTimePicker`, `ampm={false}`, format `DD/MM/YYYY HH:mm`, state empty on load, hint `setup.startHint` ("Leave empty to use the start the seller asked for").
- `markPaid` / `approve` send `startAt` (`yyyy-MM-dd'T'HH:mm`) or `null` when empty. `needsDate` disappears from the bulk-action config, so a blank field never blocks the action.

### 2. Per-row start editor, in both tables
- New `src/components/PlanStartDialog.js`, opened by a row action in the two `PlanAssignmentTable` sections: "Set start" in the waiting-for-pay table, "Change start" next to Extend in the plan table.
- Prefilled from `row.requestedStartAt` for a waiting row, `row.activeDate` for a running one; shows a read-only preview `start + planDay` days (display only, the server recomputes).
- Submits `POST /admin/v1/paymentPlan/start` with one code, then closes and refreshes both tables.

### 3. What a start change means per state
| Row | Result |
| --- | --- |
| CREATE, plain plan | `requestedStartAt` and the projected `activeDate/endedDate` move; the row stays in the queue and activation uses this start |
| ACTIVE, plain plan | `activeDate = start`, `endedDate = start + planDay`; state, quota and used count unchanged |
| CREATE/ACTIVE extension or conversion order | refused (400): the row is money for another plan, not a window of its own |
| DEACTIVE | refused (400): reactivate first |
| CREATE, start in the past | refused (400): backdating is a correction, not a promise; activate, then adjust |
| any, computed end already past | refused (400): the plan would expire on the spot; deactivate instead |

Changing an ACTIVE window notifies the seller ("your plan now runs from X to Y") through `coreNotificationService`, like activation does. Sale links already generated keep their own end date, exactly as with conversion.

## Backend — publiclink-app

### New core method
`CorePaymentPlanService.changeStartWindow(String planUserCode, String startAt)`:
- `getEntityByCode`, refuse order rows (`getExtendDays() != null`, `getConvertsPlanUserCode() != null`) with the same wording `activate` uses, refuse `DEACTIVE`.
- `Timestamp start = parseRequestedStart(startAt)` (private helper already in this class, tolerates `T`/space and seconds).
- CREATE: `start` must not be before `now()`; set `requestedStartAt`, `activeDate`, `endedDate = start + plan.getPlanDay()`.
- ACTIVE: same dates, `requestedStartAt` left as the seller's request.
- Refuse when `!end.after(now())`.
- Return `toAssignmentModel(saved)`.

### Admin plumbing
- `PaymentPlanService.changeStart(List<String> planUserCodes, String startAt, String adminUsername)` → loops the core method, then `notifyPlanWindowChanged(username, plan, admin)` (same swallow-and-log pattern as `notifyPlanActivated`).
- `StartPlanRequest { List<String> planUserCodes; String startAt; }` + `PaymentPlanAdminService.changeStart(request, adminUsername) : Result<Integer>`.
- `PaymentPlanAdminController`: `@PostMapping("/start")` mirroring `/approve`.

### Explicit override at mark-paid / activate
`activeDate` becomes `startAt` on the admin API (internal only; our Setup page is the sole caller, tests updated in the same change):
- `ApprovePlanRequest`, `MarkPaidRequest`: field `startAt` (documented `yyyy-MM-dd'T'HH:mm`, blank = honour the request).
- `CorePaymentPlanService.activate(planUserCode, startAt)`:
```java
Timestamp start;
if (startAt != null && !startAt.isBlank()) {
    start = parseActiveDate(startAt);                     // deliberate admin choice, today included
} else if (assignment.getRequestedStartAt() != null
        && !assignment.getRequestedStartAt().before(now())) {
    start = assignment.getRequestedStartAt();             // honour what the seller asked for
} else {
    start = parseActiveDate(null);                        // today
}
```
- `parseActiveDate` needs no change: it already normalises `T` to a space and parses `yyyy-MM-dd HH:mm[:ss]`.
- Delete `isToday` — it exists only for the today heuristic this replaces.
- `markPaidAssignments(codes, note, admin, startAt)` parameter renamed; the free-plan auto-approve keeps passing `null`, so a future requested start still wins there.

## Frontend — frontend-publiclink

### `src/page/SetupPage.js`
- State: `startAt` (`""`), `setStartAt`; drop `activeDate`, `dateValue`, `todayInputValue`.
- Field: `DateTimePicker` with `ampm={false}` and `format="DD/MM/YYYY HH:mm"` (same explicit format the seller dialog uses, so day-first display does not depend on the adapter locale).
- `approve` / `markPaid` send `startAt: startAt || null`; remove `needsDate` / `dateValue` from `paymentActions` and from the Activate action.
- `PlanAssignmentTable`: `rowAction` (single) becomes `rowActions` (array) rendered as a small `Stack`; each entry keeps `label`, `handler`, `reasonFor`. The existing Extend entry moves into the array unchanged.
- New `startRow` state + `submitStart(nextStartAt)` posting `/admin/v1/paymentPlan/start`, then `setStartRow(null)` and `refreshTables()`.
- Row actions: pending table gains "Set start" (disabled for `extendDays`/`convertsPlanUserCode` rows); plan table gains "Change start" (disabled unless `planState === "ACTIVE"` and the row is a plain plan).

### `src/components/PlanStartDialog.js` (new)
- Props `{ open, row, onClose, onSubmit(startAt) }`.
- `DateTimePicker` prefilled from `row.requestedStartAt || row.activeDate` (parse the backend `yyyy-MM-dd HH:mm:ss` to the wire string); read-only end preview computed locally from `row.planDay`; submit disabled until a start exists; server errors shown inline in an `Alert` (not `alert()`).

### i18n (both locales)
`setup.start`, `setup.startHint`, `setup.action.setStart`, `setup.action.changeStart`, `setup.startDialog.{title, startLabel, endLabel, hint, submit}`, `setup.success.startUpdated`, `setup.errors.startFailed`, `setup.start.onlyPlans`; remove `setup.activeDate` / `setup.activeDateHint` if nothing else references them. Keep existing `setup.requestedStart`.

## Test Plan

Backend (`mvn -o -pl publiclink-app -am clean test`):
- `changeStartWindow`: CREATE stores the request and projects both dates, state stays CREATE; ACTIVE shifts both dates by the plan length, keeps state/usedCount; extension and conversion rows refused; DEACTIVE refused; CREATE with a past start refused; a value whose end is already past refused.
- `activate`: explicit `startAt` wins even when it is today with a time; blank honours a future `requestedStartAt`; blank with a past or absent request starts today.
- `markPaidAssignments(..., null)` still lets a future requested start win (free-plan auto-approve path).
- `PaymentPlanService.changeStart` notifies the seller and returns the count.

Frontend (`CI=true npx react-scripts test`, `npx eslint`; pickers wrapped in `PickerProvider`):
- Setup field starts empty and Mark paid posts `startAt: null`; choosing a datetime posts it.
- "Set start" on a waiting row opens the dialog prefilled with `requestedStartAt` and posts `/admin/v1/paymentPlan/start`.
- "Change start" on a running row prefilled with `activeDate`; end preview equals start + plan day.
- Order rows and non-ACTIVE rows have the start action disabled.
- Locale parity for the new keys; do not run `npm run build`.

## Assumptions

- Backdating is only possible on an ACTIVE plan: a waiting order's start must be in the future because it is still a promise the seller has to pay for.
- Changing an ACTIVE start does not touch `requested_start_at`, used quota, existing sale links or bills; those stay as they are and the plan list reads the new `activeDate/endedDate`.
- One start applies to every selected code in the bulk field; the per-row dialog is the way to set different starts.
- The window applies to both plan groups and to the 0-fee plan; no upper bound on how far ahead a start may be.
- No change to `seller_payment_plan`, conversion, extension, or the admin create flow.