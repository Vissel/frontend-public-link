# Lock SuperAdmin APIs to Server-Side Only

## Summary
Protect `POST /publiclink/admin/internal/registerUser` ([SuperAdminController.java](publiclink-app/src/main/java/com/qrpublic/apartment/controller/SuperAdminController.java)) so it can only be executed from the server host (127.0.0.1/::1). Three defense layers, then deployment. `AdminController` (`/admin/v1/**`) stays untouched — the admin web UI depends on it.

## Layer 1 — Nginx edge allowlist
File: `deploy/nginx/share-link.top.conf`

- Add a new `location ~ ^/apiGateway/publiclink/admin/internal` block **before** the existing `location /apiGateway/` in the HTTPS server block (regex location so all nested paths are covered).
- Block contents:
  - `allow 127.0.0.1;` `allow ::1;` `deny all;` — evaluated against the true client `$remote_addr` at the edge; all internet traffic gets 403 before reaching the gateway.
  - `proxy_pass http://publiclink_gateway/;` plus the same proxy headers as the `/apiGateway/` block: `proxy_http_version 1.1`, `Connection ""`, `Host $host`, `X-Real-IP $remote_addr`, `X-Forwarded-For $proxy_add_x_forwarded_for`, `X-Forwarded-Proto $scheme`, `X-Forwarded-Host $host`, `proxy_read_timeout 120s`.
- Server-side scripts calling the public URL from the host itself pass (`$remote_addr == 127.0.0.1`).

## Layer 2 — WebFilter in publiclink-app
New file: `publiclink-app/src/main/java/com/qrpublic/apartment/filter/InternalOnlyWebFilter.java`

- `@Component implements WebFilter, Ordered` with `@Order(Ordered.HIGHEST_PRECEDENCE)` — runs before any controller.
- Logic:
  - Path does not contain `/admin/internal` → `chain.filter(exchange)` (everything else unaffected).
  - Otherwise allow only when BOTH: (a) request remote address `InetSocketAddress.getAddress().isLoopbackAddress()` (covers `::1` and IPv4-mapped `::ffff:127.0.0.1`), and (b) `X-Real-IP` header is absent OR itself a loopback address. Else respond `403` and complete the response (never call the chain).
- Rationale: behind nginx every hop is localhost, so the raw remote address alone is useless; `X-Real-IP` is trustworthy only because nginx overwrites it with `$remote_addr`. Requiring the immediate hop to be loopback also neutralizes spoofed headers from off-host callers.
- Direct calls from the host to `127.0.0.1:9080/publiclink/admin/internal/...` (no nginx, no header) still pass — this is the primary server-side calling path.
- Fully reactive (`Mono<Void>`), no blocking — complies with the project's WebFlux rules.

## Layer 3 — Gateway role backstop
File: `apiGateway/src/main/java/com/qrpublic/apartment/apiGateway/gatewayConfig/SecurityConfig.java`

- In `securityWebFilterChain`, add before `.anyExchange().authenticated()`:
  `.pathMatchers("/publiclink/admin/internal/**").hasAnyAuthority("Admin", "Badminton_Admin")`
- Must be `hasAnyAuthority`, NOT `hasRole`: [JwtAuthenticationWebFilter.java](apiGateway/src/main/java/com/qrpublic/apartment/apiGateway/filter/JwtAuthenticationWebFilter.java) builds authorities directly from JWT roles claim values (`"Admin"`, no `ROLE_` prefix — see [RoleEnum.java](authen-authorisation/src/main/java/com/qrpublic/apartment/authenAuthorisation/authorisation/model/RoleEnum.java)).
- Effect: a caller through the public URL must hold an Admin/Badminton_Admin JWT in addition to coming from loopback. Direct `:9080` calls from the host bypass the gateway and remain allowed by Layer 2 (acceptable — they already require shell access on the box).
- No OTP/MFA changes anywhere.

## Verification
1. From the server host, direct: `curl -X POST http://127.0.0.1:9080/publiclink/admin/internal/registerUser -H 'Content-Type: application/json' -d '{...}'` → `200`.
2. From the server host via public URL with an Admin JWT → `200` (nginx allow + gateway authority + app filter).
3. From any external machine via public URL → `403` at nginx (request never reaches the gateway).
4. Via public URL with a normal user ("User"/"Seller") JWT from the server → `403` from the gateway (Layer 3).
5. Admin UI smoke test: `/admin/v1/**` endpoints still work from the browser (untouched scope).

## Deployment to the server
1. **Back up nginx conf**: on the server, `cp /etc/nginx/conf.d/share-link.top.conf /etc/nginx/conf.d/share-link.top.conf.bak-$(date +%Y%m%d)`.
2. **Build**: on the build host run `./build-and-deploy.sh <TOMCAT_WEBAPPS_DIR> prod` — builds adapter, apiGateway, publiclink-app, user + frontend and stages `apiGateway.war`, `publiclink-exec.jar`, `user-0.0.1-SNAPSHOT.jar` under `target/deploy/` (only apiGateway and publiclink-app changed in this task).
3. **Ship artifacts**: scp `target/deploy/publiclink-exec.jar` and `target/deploy/apiGateway.war` to `/opt/publiclink/` on the server (paths used by the systemd units in `deploy/systemd/`).
4. **Restart services**: `sudo systemctl restart publiclink-app` and `sudo systemctl restart publiclink-gateway` (gateway SecurityConfig changed); check with `sudo systemctl status publiclink-app publiclink-gateway` and `journalctl -u publiclink-app -n 50`.
5. **Deploy nginx**: copy updated `deploy/nginx/share-link.top.conf` → `/etc/nginx/conf.d/share-link.top.conf`; run `sudo nginx -t` (must pass); then `sudo systemctl reload nginx`.
6. **Verify**: run checks 1–4 above; an external 403 and a server-side 200 confirm the lock is live.
7. **Rollback** (if needed): restore the `.bak` nginx conf → `nginx -t` → `systemctl reload nginx`; redeploy the previous jars → `systemctl restart publiclink-app publiclink-gateway`.

## Assumptions
- Prod profile keeps `server.address=127.0.0.1` (`application-prod.properties`, `SERVER_ADDRESS` default) so `:9080` is never directly internet-reachable.
- JWT roles claims match RoleEnum strings (`Admin`, `User`, `Seller`, `Buyer`, `Badminton_Admin`) with no `ROLE_` prefix.
- Future endpoints added under `/admin/internal` are automatically covered by the path-based checks in Layers 1–3.