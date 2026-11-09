# Data Backup Service — Implementation Plan

## Overview

A new Spring Boot 3.5.0 / Java 25 microservice (`data-backup`) deployed independently, connecting to both `publiclink-db` and `user_schema` MySQL databases in read-only mode, performing scheduled (daily/weekly/monthly) or administrator-triggered backups with OTP-secured handshake, incremental change detection, local filesystem storage, and email summary reports.

---

## Architecture Summary

```
[Administrator] --(HTTP)--> [data-backup :9090]
                                    |
                          +---------+---------+
                          |                   |
                    [RabbitMQ]          [SMTP: ProtonMail]
                          |                   |
               [publiclink-app :9080]    jelly1512@proton.me
               (generates OTP, sends       
                via SMTP to admin)         
                          |
               [data-backup inputs OTP]
               (2-min TTL, establishes
                authenticated session)
                          |
              +-----------+-----------+
              |                       |
     [publiclink-db]          [user_schema]
      (MySQL, read-only)      (MySQL, read-only)
              |                       |
              +-----------+-----------+
                          |
              [Local Filesystem Backup]
              /backups/{schema}/{date}/
```

---

## Database Design — `backup_meta` Schema

The data-backup service has its own MySQL schema `backup_meta` containing:

### Table: `trigger_tbl`
| Column | Type | Description |
|---|---|---|
| `trigger_id` | BIGINT PK AUTO_INCREMENT | Unique trigger ID |
| `trigger_type` | ENUM('SCHEDULED','MANUAL') | How it was triggered |
| `schedule_type` | ENUM('DAILY','WEEKLY','MONTHLY') NULL | NULL for manual |
| `backup_scope` | ENUM('FULL','INCREMENTAL') | Full or incremental |
| `status` | ENUM('PENDING','RUNNING','COMPLETED','FAILED') | Execution status |
| `started_at` | TIMESTAMP | When backup started |
| `completed_at` | TIMESTAMP NULL | When backup finished |
| `otp_session_id` | VARCHAR(36) | FK to OTP session used |
| `error_message` | TEXT NULL | Error details if failed |
| `created_at` | TIMESTAMP DEFAULT NOW | Record creation time |

### Table: `backup_file_tbl`
| Column | Type | Description |
|---|---|---|
| `file_id` | BIGINT PK AUTO_INCREMENT | |
| `trigger_id` | BIGINT FK | Links to trigger_tbl |
| `schema_name` | VARCHAR(50) | 'publiclink-db' or 'user_schema' |
| `file_path` | VARCHAR(500) | Local filesystem path |
| `file_size_bytes` | BIGINT | Size of backup file |
| `row_count` | INT | Total rows backed up |
| `created_at` | TIMESTAMP DEFAULT NOW | |

### Table: `otp_session_tbl`
| Column | Type | Description |
|---|---|---|
| `session_id` | VARCHAR(36) PK UUID | |
| `otp_code` | VARCHAR(6) | The OTP value |
| `otp_hash` | VARCHAR(128) | SHA-256 hash for verification |
| `status` | ENUM('ISSUED','VERIFIED','EXPIRED','USED') | |
| `issued_at` | TIMESTAMP | When OTP was generated |
| `expires_at` | TIMESTAMP | issued_at + 2 minutes |
| `verified_at` | TIMESTAMP NULL | When admin entered OTP |
| `source_ip` | VARCHAR(45) | IP of the data-backup caller |

### Table: `backup_watermark_tbl`
Tracks the last successful backup timestamp per schema/table, used for incremental change detection.

| Column | Type | Description |
|---|---|---|
| `watermark_id` | BIGINT PK AUTO_INCREMENT | |
| `schema_name` | VARCHAR(50) | 'publiclink-db' or 'user_schema' |
| `table_name` | VARCHAR(100) | e.g., 'request', 'user_tbl' |
| `last_backup_at` | TIMESTAMP | High-water mark of last backup |
| `last_max_id` | BIGINT NULL | Max auto-increment ID at last backup |
| `updated_at` | TIMESTAMP DEFAULT NOW | |

---

## Task 1: Project Scaffolding

Create the Maven module `data-backup` under the parent POM.

**Files to create:**
- `data-backup/pom.xml` — Spring Boot 3.5.0, dependencies: spring-boot-starter-web, spring-boot-starter-data-jpa, spring-boot-starter-mail, spring-boot-starter-amqp, spring-boot-starter-security, mysql-connector-j, lombok
- Update parent `pom.xml` to add `<module>data-backup</module>`
- `data-backup/src/main/java/com/qrpublic/apartment/databackup/DataBackupApplication.java`
- `data-backup/src/main/resources/application.properties` — server port 9090, DB connections (read-only), SMTP config, RabbitMQ config

**Key properties:**
```properties
server.port=9090
# Backup source databases (read-only credentials)
backup.source.publiclink.url=jdbc:mysql://<host>:3306/publiclink-db
backup.source.user.url=jdbc:mysql://<host>:3306/user_schema
# Backup metadata database
spring.datasource.url=jdbc:mysql://<host>:3306/backup_meta
# SMTP (ProtonMail SMTP bridge or relay)
spring.mail.host=smtp.protonmail.ch
spring.mail.port=587
spring.mail.username=<proton-credentials>
# RabbitMQ
spring.rabbitmq.host=<rabbitmq-host>
spring.rabbitmq.port=5672
# Backup storage
backup.storage.base-path=/var/backups/publiclink
# OTP
backup.otp.ttl-minutes=2
backup.otp.recipient=jelly1512@proton.me
```

---

## Task 2: Entity & Repository Layer

Create JPA entities for `backup_meta` schema tables:

- `TriggerEntity` — maps `trigger_tbl`
- `BackupFileEntity` — maps `backup_file_tbl`
- `OtpSessionEntity` — maps `otp_session_tbl`
- `BackupWatermarkEntity` — maps `backup_watermark_tbl`

Create Spring Data JPA repositories for each.

**Package:** `com.qrpublic.apartment.databackup.entity` and `.repository`

---

## Task 3: OTP Authentication Flow

This is the security handshake between `publiclink-app` and `data-backup`.

### 3a. publiclink-app side (changes to existing project)

- New REST endpoint: `POST /api/backup/otp/generate`
  - Admin-only (role check)
  - Generates a 6-digit OTP, stores it in a new `backup_otp` table (or in-memory cache with 2-min TTL)
  - Sends OTP via SMTP to `jelly1512@proton.me`
  - Returns OTP session ID to the caller (not the OTP itself)

- New REST endpoint: `GET /api/backup/otp/verify/{sessionId}/{otpCode}`
  - Validates OTP within 2-minute window
  - Returns a short-lived backup auth token (JWT or opaque token, 5-min TTL)

- New table or Liquibase changeset for `backup_otp` table in `publiclink-db`

### 3b. data-backup side

- New endpoint: `POST /api/auth/token` accepting `{ sessionId, otpCode }`
  - Calls `publiclink-app`'s verify endpoint
  - Receives backup auth token
  - Stores token in memory for subsequent backup operations
  - Token is required for all backup execution endpoints

### Flow sequence:
1. Admin calls `publiclink-app` → generates OTP → sends to `jelly1512@proton.me`
2. Admin receives OTP email, reads the 6-digit code
3. Admin calls `data-backup` with `{ sessionId, otpCode }`
4. `data-backup` verifies OTP via `publiclink-app` within 2-min window
5. `data-backup` receives backup auth token, uses it for DB read access

---

## Task 4: Backup Execution Engine

### 4a. Incremental Change Detection Strategy

Use a **dual strategy** per table:
- **Auto-increment ID tables** (request, product, order, pricing, etc.): Compare `last_max_id` from `backup_watermark_tbl` — only SELECT rows WHERE `id > last_max_id`
- **UUID/timestamp tables** (user, sale_environment, notification, etc.): Compare `last_backup_at` — SELECT rows WHERE `createdAt > last_backup_at` OR `updatedAt > last_backup_at`

After each successful backup, update the watermark.

### 4b. Backup Writer

- Serialize query results to JSON (using Jackson)
- Compress with GZIP
- Write to: `{base-path}/{schema-name}/{yyyy-MM-dd}/{trigger-type}_{scope}_{timestamp}.json.gz`
- For FULL backups: dump all rows from all tables
- For INCREMENTAL backups: dump only delta rows, with table name headers

### 4c. Table Backup Order (respect FK dependencies)

**publiclink-db order:**
1. `payment_method` (standalone)
2. `user` (referenced by request)
3. `request` (referenced by product, pricing, sale_environment)
4. `pricing`
5. `picture` (referenced by product_picture_map)
6. `product` (referenced by product_picture_map)
7. `product_picture_map`
8. `sale_environment`
9. `order`
10. `notification`
11. `notification_recipient`
12. `process_message`

**user_schema order:**
1. `user_tbl`
2. `profile_tbl`
3. `user_auth_tbl`

---

## Task 5: Scheduling

Use Spring's `@Scheduled` with configurable cron expressions:

```properties
backup.schedule.daily-cron=0 0 0 * * *     # Midnight daily
backup.schedule.weekly-cron=0 0 0 * * MON   # Monday midnight
backup.schedule.monthly-cron=0 0 0 1 * *    # 1st of month midnight
```

- Daily/weekly/monthly triggers produce INCREMENTAL backups
- A configurable "full backup day" (e.g., first of month) produces FULL backup
- Manual triggers via API produce either FULL or INCREMENTAL based on request param

**Service:** `BackupScheduler` with `@Scheduled` methods + `BackupService` orchestrator.

---

## Task 6: RabbitMQ Integration

### Queues & Exchanges:
- Exchange: `backup.exchange` (topic)
- Queue: `backup.trigger.queue` — receives manual trigger commands
- Queue: `backup.status.queue` — publishes backup completion/failure events
- Routing keys: `backup.trigger.manual`, `backup.status.completed`, `backup.status.failed`

### Consumer:
- `BackupTriggerListener` — listens on `backup.trigger.queue` for `{ scope: "FULL"|"INCREMENTAL", schemas: ["publiclink-db","user_schema"] }` messages
- Triggers backup execution asynchronously

### Publisher:
- After backup completes, publish result summary to `backup.status.queue`
- `publiclink-app` can optionally consume these status events

---

## Task 7: Email Summary Report

After each backup trigger completes, send a structured email to `jelly1512@proton.me`.

### Email Content (HTML format):

```
Subject: [Data Backup] COMPLETED - Incremental - 2026-06-12 00:00

=== Backup Summary ===
Trigger ID:     42
Type:           SCHEDULED (Daily)
Scope:          INCREMENTAL
Started:        2026-06-12 00:00:01
Completed:      2026-06-12 00:00:15
Duration:       14s
Status:         COMPLETED

=== publiclink-db ===
  Table                  New Rows   Total Size
  ─────────────────────────────────────────
  request                   3        12 KB
  product                   7        45 KB
  order                     12       8 KB
  notification              1        2 KB
  (8 unchanged tables skipped)

=== user_schema ===
  Table                  New Rows   Total Size
  ─────────────────────────────────────────
  user_tbl                  1        3 KB
  user_auth_tbl             2        1 KB
  (1 unchanged table skipped)

=== Storage ===
Backup file:  /var/backups/publiclink/2026-06-12/incr_20260612_000001.json.gz
Total size:   23 KB (compressed)
```

- Use Spring's `JavaMailSender` with `MimeMessage` for HTML email
- If FAILED: include error message and stack trace excerpt

---

## Task 8: Administrator API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/token` | Verify OTP and get backup auth token |
| POST | `/api/backup/trigger` | Manual trigger: `{ scope, schemas[] }` |
| GET | `/api/backup/history` | List past triggers with status |
| GET | `/api/backup/history/{triggerId}` | Detail of a specific trigger |
| GET | `/api/backup/files/{triggerId}` | List backup files for a trigger |
| GET | `/api/backup/watermarks` | Show current watermark state |
| DELETE | `/api/backup/files/{fileId}` | Delete a specific backup file |

All endpoints except `/api/auth/token` require the backup auth token in header.

---

## Task 9: Security Configuration

- Spring Security with stateless session
- Backup auth token validation filter (intercepts all requests except `/api/auth/token`)
- Token expiry: 5 minutes (configurable)
- HTTPS enforcement in production profile
- Read-only database connections (enforced at JDBC level: `?readOnly=true`)

---

## Task 10: Database Migration (Liquibase)

Create Liquibase changelog for `backup_meta` schema:
- `db/changelog/db.changelog-master.xml`
- `changeset-001-create-trigger-tbl.sql`
- `changeset-002-create-backup-file-tbl.sql`
- `changeset-003-create-otp-session-tbl.sql`
- `changeset-004-create-backup-watermark-tbl.sql`

Also create a changeset for `publiclink-db` to add the `backup_otp` table.

---

## Task 11: Configuration Profiles

- `application.properties` — defaults
- `application-dev.properties` — localhost connections, debug logging
- `application-prod.properties` — production hosts, info logging, OTP TTL enforcement

---

## File Structure

```
data-backup/
  pom.xml
  src/main/java/com/qrpublic/apartment/databackup/
    DataBackupApplication.java
    config/
      SecurityConfig.java
      RabbitMQConfig.java
      MailConfig.java
      BackupProperties.java
    entity/
      TriggerEntity.java
      BackupFileEntity.java
      OtpSessionEntity.java
      BackupWatermarkEntity.java
    repository/
      TriggerRepository.java
      BackupFileRepository.java
      OtpSessionRepository.java
      WatermarkRepository.java
    service/
      OtpService.java
      BackupService.java
      BackupExecutor.java
      EmailSummaryService.java
      WatermarkService.java
    scheduler/
      BackupScheduler.java
    mq/
      BackupTriggerListener.java
      BackupStatusPublisher.java
    controller/
      AuthController.java
      BackupController.java
    security/
      BackupTokenFilter.java
      BackupTokenStore.java
    model/
      BackupRequest.java
      BackupResult.java
      TriggerHistoryDTO.java
  src/main/resources/
    application.properties
    application-dev.properties
    application-prod.properties
    db/changelog/
      db.changelog-master.xml
      changeset-001-create-trigger-tbl.sql
      changeset-002-create-backup-file-tbl.sql
      changeset-003-create-otp-session-tbl.sql
      changeset-004-create-backup-watermark-tbl.sql
```

**Changes to existing publiclink-app:**
- `publiclink-app/src/main/resources/db/changelog/changeset-018-create-backup-otp.sql`
- New controller: `publiclink-app/.../controller/BackupOtpController.java`
- New service: `publiclink-app/.../service/BackupOtpService.java`

---

## Implementation Order

1. Task 1 — Project scaffolding (pom.xml, application class, properties)
2. Task 2 — Entities and repositories
3. Task 10 — Liquibase migrations
4. Task 3 — OTP authentication flow (both sides)
5. Task 9 — Security configuration
6. Task 4 — Backup execution engine (core logic)
7. Task 5 — Scheduling
8. Task 6 — RabbitMQ integration
9. Task 7 — Email summary reports
10. Task 8 — Administrator API endpoints
11. Task 11 — Configuration profiles
