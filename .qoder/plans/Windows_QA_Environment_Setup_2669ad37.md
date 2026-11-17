# Windows QA Environment Setup

## Topology

| Service | Runs on | Port | Reachable URL |
|---|---|---|---|
| apiGateway (WAR, context `/apiGateway`) | Windows Tomcat | 8080 | `http://WIN_IP:8080/apiGateway` |
| user (JAR, `qa` profile) | Windows | 8082 | `http://WIN_IP:8082` |
| chat-app (JAR, `qa` profile) | Windows | 9090 | `http://WIN_IP:9090` |
| publiclink-app (JAR, `qa` profile) | this Mac | 9080 | `http://MAC_IP:9080` |

MySQL/RabbitMQ/Redis already installed on Windows serve the 3 Windows services locally; publiclink-app keeps its local Mac MySQL (`publiclink-db`) but joins the Windows RabbitMQ. `WIN_IP`/`MAC_IP` are placeholders the user fills with real LAN IPs.

## Backend Config Changes (repo)

- `apiGateway/.../application.properties`: make RSA paths env-driven — `rsa-private-key.path=${RSA_PRIVATE_KEY_PATH:/Users/user/.openssl/auth260222.pem}`, same for `rsa-pubkey.path` (Mac defaults preserved, dev unchanged).
- `user/.../application.properties`: same env-driven `rsa-private-key.path`.
- New `user/src/main/resources/application-qa.properties`: mirror chat-app's qa profile — port 8082, `server.address=0.0.0.0`, `user_schema` on localhost:3306 with QA creds `newuser03`/`Newuser00#`, Liquibase left to Hibernate `ddl-auto=update` (user has no changelog).
- chat-app qa profile already correct (0.0.0.0, `chat_schema`, same QA creds); its `USER_SERVICE_URL` default `http://127.0.0.1:8082` is right on Windows. No change.
- Gateway needs no qa profile — everything is env-driven (JWT_KEY, RSA paths, service URLs, RabbitMQ, Redis).

## Windows Deployment Kit (new `deploy/windows/`)

- `qa-env.bat.example` — shared env template: `JWT_KEY`, `RSA_PRIVATE_KEY_PATH=C:\publiclink\keys\auth260222.pem`, `RSA_PUBKEY_PATH`, `PUBLICLINK_SERVICE_URL=http://MAC_IP:9080`, `USER_SERVICE_URL=http://127.0.0.1:8082`, `CHAT_SERVICE_URL=http://127.0.0.1:9090`, `RABBITMQ_HOST/PORT/USERNAME/PASSWORD` (dedicated QA user, not guest), `REDIS_HOST=127.0.0.1`, `SERVER_ADDRESS=0.0.0.0`.
- `setenv.bat.example` — for `CATALINA_HOME\bin`, calls `qa-env.bat` so the gateway WAR inherits everything.
- `start-user.bat` / `start-chat.bat` — call `qa-env.bat`, set `SPRING_PROFILES_ACTIVE=qa`, run `java -jar` (JDK 25 required — bytecode won't run on older JREs).
- `qa-setup.sql` — idempotent `CREATE DATABASE IF NOT EXISTS user_schema / chat_schema` (utf8mb4) + `newuser03` account grants for Windows MySQL.
- `README.md` — bring-up steps: JDK 25 + Tomcat 10.1/11, copy PEMs from `apiGateway/src/main/resources/auth-service/` to `C:\publiclink\keys`, install `apiGateway.war` into `webapps` (context `/apiGateway` reproduces the nginx prefix strip), RabbitMQ QA user creation (`rabbitmqctl add_user/set_permissions` — guest is localhost-only, which is why the Mac app needs it), firewall rules for 8080/8082/9090, start order, smoke-test curls, and a fallback note (if the gateway WAR misbehaves on Tomcat, `java -jar apiGateway.war` runs it standalone on Netty).

## Mac Side (publiclink-app QA)

- New `deploy/mac/run-publiclink-qa.sh.example`: exports `USER_SERVICE_URL=http://WIN_IP:8082`, `SECURITY_SERVICE_URL=http://WIN_IP:8080/apiGateway`, `RABBITMQ_HOST=WIN_IP` (+ QA RabbitMQ creds), `JWT_KEY`/`JWT_URLKEY` (must equal the gateway's `JWT_KEY`), then runs the `-Pqa` built `publiclink-exec.jar`. Manual start, no auto-restart (per existing preference).
- Mac firewall must allow inbound 9080 from the Windows machine (gateway routes back to publiclink-app).

## Frontend QA (small)

- Update stale `.env.qa` to `REACT_APP_API_BASE_URL=http://WIN_IP:8080/apiGateway`; document QA build as `REACT_APP_API_BASE_URL=http://WIN_IP:8080/apiGateway npm run build` (CRA reads `.env.production` on build; shell env overrides it), deploy `build/` to Windows Tomcat `webapps\ROOT`. CORS already allows all origins.

## Test Plan

1. `mvn -Pqa -pl publiclink-app,chat-app -am package` and `mvn -pl apiGateway,user -am package` — verify artifacts (`publiclink-exec.jar`, `chat-app` exec jar, `apiGateway.war`, `user.jar`).
2. Smoke tests documented for the user to run once Windows is up: `http://WIN_IP:8082/actuator/health`, `http://WIN_IP:8080/apiGateway/actuator/health`, `http://WIN_IP:8080/apiGateway/api/v1/auth/public-key` from the Mac; then login through the gateway end-to-end.

## Assumptions

- Windows already has JDK 25, Tomcat 10.1+/11, MySQL, RabbitMQ, Redis (user confirmed middleware installed).
- Secrets (`JWT_KEY`, `JWT_URLKEY`, DB/RabbitMQ passwords) are filled in by the user from existing values; templates ship with placeholders only, following the `publiclink.env.example` convention.
- No changes to production Linux deployment files.