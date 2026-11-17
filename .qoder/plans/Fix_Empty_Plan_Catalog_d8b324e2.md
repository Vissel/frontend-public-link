# Fix Empty Plan Catalog

## Meaning and verified evidence
The nine plans exist, but the browser does not receive them. The authenticated gateway catalog returns `200` with `Content-Length: 0`; the frontend converts that into `[]`. The same public catalog returns nine items directly from the app, but returns `500 AUTH_001` through the gateway without authentication.

This work fixes error propagation and frontend response handling. It does not assume the underlying routing failure is DNS, and it does not require assigning plans to sellers.

## Gateway error boundary
File: `VietQrApplication/apiGateway/src/main/java/com/qrpublic/apartment/apiGateway/filter/JwtAuthenticationWebFilter.java`.

- Separate token parsing/authentication decisions from downstream execution. Resolve an explicit authenticated, anonymous, or rejected outcome first; apply token-error recovery only to that stage.
- Invoke `chain.filter(...)` outside authentication catch/recovery boundaries. Remove downstream re-entry from the current trailing `onErrorResume`; propagate downstream failures unchanged.
- Preserve identity-header stripping, validated identity forwarding, roles, security context, and trace headers. Missing/invalid tokens continue anonymously to existing security rules; refresh tokens remain rejected. Do not weaken authorization.
- Do not use `switchIfEmpty` after a `Mono<Void>` chain: normal completion must not trigger another invocation.
- Reuse the existing, already-modified `GlobalExceptionHandler` and `ErrorCode`: connectivity failures become `503 SVC_001`, unexpected failures `500 SYS_001`, and authentication/HTTP errors retain their proper status. Preserve the user's existing changes; do not replace them with a second handler.

## Frontend catalog and creation feedback
Files: `frontend-publiclink/src/form/CreateSellerPlanDialog.js`, `src/form/PaymentLinkResultDialog.js`, and both English/Vietnamese translation files.

- Replace `res.data?.items || []` with explicit response validation. Require an object containing an `items` array and usable plan rows: nonblank code, nonnegative fee, positive days and environment count. A zero-fee plan remains valid.
- Track catalog loading and load errors separately from form validation. Show “No plans” only after a successful `{items: []}` response. Empty bodies, malformed JSON shapes, and failed requests show a localized error with a Retry action that performs only a GET.
- Do not display stale plans as a current successful load after failure. Disable existing-plan submission until a valid catalog and selection are available; leave standalone new-plan creation independent of catalog availability.
- Clear catalog errors after successful retry and retain the selected plan only if it still exists in the returned catalog.
- Validate the create response before reporting success, including its plan code and plan values. An empty/malformed response means creation is unconfirmed—not successful. Warn users to verify the catalog before retrying; never automatically repeat a create POST.
- If creation returns a valid plan but the subsequent catalog refresh fails, preserve the confirmed creation result and show a localized refresh warning in the result dialog. Do not label the creation failed or repeat it.
- With the seller blank, continue calling only `/paymentPlan/create`; never call `/createSellerPlan` or generate a payment.

## Regression tests
- Add test-scoped Spring Boot test and Reactor test dependencies to `apiGateway/pom.xml`; add focused filter/exception-handler tests without external Redis, databases, or services.
- Verify downstream synchronous and asynchronous failures propagate without a second chain call; successful requests execute once per filter invocation and retain identity/security context.
- Cover anonymous access, invalid tokens, refresh-token rejection, role/header preservation, connectivity-to-503 mapping, unexpected-error-to-500 mapping, and browser-visible error responses.
- Add React Testing Library tests for nine displayed catalog entries without a seller, legitimate empty catalogs, zero-byte/malformed responses, loading, retry recovery, and zero-fee plans.
- Test standalone creation makes no assignment request, malformed create responses never report success, and confirmed creation plus failed refresh produces a warning without duplicate POSTs.
- Run focused Maven tests with `-pl apiGateway -am` and focused CRA tests with `CI=true`, `--watchAll=false`, and `--runInBand`. Avoid modifying tracked build artifacts during validation.

## QA verification and remaining blocker
- After implementation, provide the gateway artifact/build instructions for a user-controlled deployment and manual restart; do not restart services or change QA configuration automatically.
- Reopen the authenticated Existing plan tab. A healthy gateway must return `{items: [...]}` and show all nine current entries with the seller blank. Capture the request result and a screenshot.
- If downstream connectivity still fails, the UI must show a real error instead of an empty catalog. Use the gateway exception and trace ID to identify the original cause; request the Windows gateway log if unavailable. Do not claim catalog restoration until the healthy-path check passes.
- Network/DNS/firewall or hostname configuration changes require a separately confirmed, evidence-backed action. Keep configured hostnames; do not substitute hardcoded IPs.

## Scope boundaries
No schema/data changes, seller assignment requirements, authentication redesign, commits, or automatic deployment. Use mocked creation responses for automated tests and existing plans for live verification; do not add QA records just to test visibility.