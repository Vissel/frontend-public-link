# Free Plan: Once Per Account, Auto-Approved

Addendum to `.qoder/plans/Self-Register_Onboarding_Flow_ad86dcbd.md` (requirement 1 only; the device-telemetry / hardening drafts are out of scope). The same addendum text is already appended to that document.

## Summary

- An account may take a 0-fee plan at most ONCE through self-service. "Once" counts EVERY 0-fee assignment ever created, in any state (including rejected/deactivated). Admin may assign 0-fee plans repeatedly.
- 0-fee plans AUTO-APPROVE: no VietQR, no transfer, no admin "Mark Paid" wait. The plan is ACTIVE the moment it is selected.
- Conversion onto a 0-fee plan is refused by the backend; the free card is disabled in the plan lists once the allowance is used.
- No schema migration: the allowance is derived from `payment_plan_user` history.

## Backend — publiclink-app

### Allowance query (derived, no new column)
[PaymentPlanUserRepository.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/repository/PaymentPlanUserRepository.java):
```java
@Query("SELECT COUNT(ppu) FROM PaymentPlanUser ppu JOIN ppu.user u JOIN ppu.plan p "
     + "WHERE u.userName = :username AND p.fee = 0 "
     + "AND ppu.extendDays IS NULL AND ppu.convertsPlanUserCode IS NULL")
long countFreePlanGrants(@Param("username") String username);
```
No state filter, so a rejected free grant still counts. Extension/conversion order rows are excluded (they are not plan grants). Expose `CorePaymentPlanService.hasEverHadFreePlan(username)` and `PaymentPlanService.freePlanUsed(username)`.

### Auto-approve in the shared create path
[PaymentPlanService.createSellerPlan](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/domain/paymentplan/PaymentPlanService.java): after the assignment + payment are created, if `fee.signum() == 0`, call the existing `markPaidAssignments(List.of(assignment.getPlanUserCode()), "auto-approved free plan", adminUsername, null)` and set `response.setStatus("PAID")`. This reuses payment->PAID, bill creation, CREATE->ACTIVE activation and the "Plan activated" notification, and keeps the row out of the "Waiting for pay" queue. Living here covers BOTH self-service and admin assignment uniformly.

### Self-service once-guard + no QR for free
[SelfServicePlanService.java](file:///Users/user/eclipse-workspace/publiclink-reseller/VietQrApplication/publiclink-app/src/main/java/com/qrpublic/apartment/service/SelfServicePlanService.java):
- In `buyPlan` and `buyAdditionalPlan`, before `createSellerPlan`: resolve the catalog plan via `findOnSalePlan(planCode)`; if `fee == 0 && freePlanUsed(username)` throw `ApplicationException("...free plan already used...", 409)`. The admin path has NO guard.
- Skip `eventPublisher.publishEvent(new PaymentCreatedEvent(...))` when `fee == 0` (payment already PAID; nothing to transfer).
- In `convertOwnPlan`: refuse a 0-fee target unconditionally with 400 and a clear message.
- `buildState` / `buildMoreState` set the new `freePlanUsed` flag.
- `extendMore` unchanged (out of scope).

### Response flags
`SelfServiceStateResponse` and `MorePlanStateResponse` gain `private boolean freePlanUsed;` so the UI can disable the free card without an extra call.

## Frontend — frontend-publiclink

- [PlanSelectPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/PlanSelectPage.js) and [MorePlanPage.js](file:///Users/user/eclipse-workspace/publiclink-reseller/frontend/frontend-publiclink/src/page/MorePlanPage.js) Buy tab: when `state.freePlanUsed`, render every `fee == 0` card disabled (`CardActionArea disabled`, dimmed, Chip `t("plans.freeUsed")` + caption) and non-selectable. When not used, the free card stays selectable; after selecting, the backend returns STATE_ACTIVE so the existing success panel shows with no QR step. Add `t("plans.freeAutoNote")` on the free card when selectable.
- MorePlanPage Convert tab: filter 0-fee targets out and show `t("morePlan.convert.noFreeTarget")`; backend refusal is the backstop.
- i18n in BOTH `en` and `vi` translation.json: `plans.freeUsed`, `plans.freeAutoNote`, `morePlan.freeUsed`, `morePlan.convert.noFreeTarget`, `plans.errors.freeAlreadyUsed`, `morePlan.errors.convertFree`.
- Admin `CreateSellerPlanDialog` unchanged (free assignment stays unlimited); it now lands on an already-PAID/ACTIVE result.

## Test Plan

- Backend (`mvn -pl publiclink-app -am test`): first self-service free select -> assignment ACTIVE + payment PAID immediately, no open order; second free select/buyMore -> 409; a DEACTIVE free row still counts; admin second free assignment allowed; convert onto a 0-fee target -> 400.
- Frontend (`CI=true npx react-scripts test`, `npx eslint`): free card disabled/unselectable when `freePlanUsed`; convert target list excludes 0-fee plans; EN/VI key parity. Do not run `npm run build` (dirties tracked CRA artifacts).

## Assumptions

- "Ever" includes rejected/deactivated free grants (strictest count, per user).
- Auto-approve applies to admin-assigned 0-fee plans too, because it lives in the shared `createSellerPlan`.
- No new DB column or Liquibase changeset; allowance computed from existing rows.
- Manual app restart per project convention; frontend needs rebuild + refresh of served build for QA.