# Admin-to-Seller Notification System

## Architecture Overview

- **Database**: New `notification` and `notification_recipient` tables in `publiclink-db`
- **Backend**: Entity, Repository, Service, Controller in `publiclink-app`
- **Admin Frontend**: New `NotificationPage.js` with seller-grouped compose UI
- **Seller Frontend**: Bell icon in `Header.js` with Popover preview + Dialog detail, polling every 60s
- **API Routes**: Admin endpoints under `/admin/v1/notify/**`, Seller endpoints under `/api/v1/seller/notifications/**`

---

## Task 1: Database Preparation (Liquibase)

Create `changeset-017-create-notification.sql`:

```sql
CREATE TABLE notification (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  message       TEXT         NOT NULL,
  target_type   VARCHAR(20)  NOT NULL DEFAULT 'SELLER',  -- 'SELLER' or 'ENVIRONMENT'
  created_by    VARCHAR(100) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NULL
);

CREATE TABLE notification_recipient (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT       NOT NULL,
  seller_username VARCHAR(100) NOT NULL,
  request_uuid    VARCHAR(100) NULL,         -- NULL = all environments for that seller
  is_read         TINYINT(1)   NOT NULL DEFAULT 0,
  read_at         TIMESTAMP    NULL,
  CONSTRAINT fk_notification FOREIGN KEY (notification_id) REFERENCES notification(id)
);

CREATE INDEX idx_notif_recipient_seller ON notification_recipient(seller_username, is_read);
CREATE INDEX idx_notif_recipient_notif  ON notification_recipient(notification_id);
```

Register in `db.changelog-master.xml` as changeset 017.

---

## Task 2: Backend Entity + Repository

**New files in `publiclink-app`:**

1. `entity/Notification.java` - JPA entity mapped to `notification` table
2. `entity/NotificationRecipient.java` - JPA entity mapped to `notification_recipient` table, with `@ManyToOne` to Notification
3. `repository/NotificationRepository.java` - Spring Data JPA repository
4. `repository/NotificationRecipientRepository.java` - with custom queries:
   - `findBySellerUsernameAndIsReadOrderByCreatedAtDesc(sellerUsername, isRead, pageable)` -> Page
   - `countBySellerUsernameAndIsRead(sellerUsername, isRead)` -> long
   - `findBySellerUsernameAndNotificationId(sellerUsername, notificationId)` -> Optional

---

## Task 3: Backend Request/Response DTOs

**New files in `publiclink-app`:**

1. `requestmodel/SendNotificationRequest.java`:
   - `String title`
   - `String message`
   - `List<NotificationTarget> targets` (each has `sellerUsername` + optional `List<String> requestUuids`)
   - `boolean selectAll` (send to all sellers)

2. `model/notification/NotificationDTO.java` - response DTO for seller:
   - `Long id`, `String title`, `String message`, `String targetType`
   - `String requestUuid` (nullable), `boolean isRead`, `String createdAt`

3. `model/notification/NotificationCountResponse.java`:
   - `long unreadCount`

---

## Task 4: Backend Service + Controller

**New file: `service/NotificationService.java`**

Key methods:
- `Result<Void> sendNotification(SendNotificationRequest request)` - Admin sends; creates Notification + NotificationRecipient rows. If `selectAll=true`, query all distinct seller usernames from `request` table.
- `Result<NotificationCountResponse> getUnreadCount(String sellerUsername)` - Count unread for seller
- `Result<List<NotificationDTO>> getNotifications(String sellerUsername, int page, int size)` - Paginated list
- `Result<NotificationDTO> getNotificationDetail(String sellerUsername, Long notificationId)` - Single notification, marks as read
- `Result<Void> markAsRead(String sellerUsername, Long notificationId)` - Mark read
- `Result<Void> markAllAsRead(String sellerUsername)` - Mark all read

**Add to `AdminController.java`:**
- `POST /admin/v1/notify/send` - Send notification
- `GET /admin/v1/notify/sellers` - Get list of sellers with their environments (for the compose UI dropdown)

**Add to `SellerPageController.java`:**
- `GET /api/v1/seller/notifications/unread-count` - Unread count (for bell badge)
- `GET /api/v1/seller/notifications?page=0&size=20` - Paginated notification list
- `GET /api/v1/seller/notifications/{id}` - Detail (auto marks as read)
- `POST /api/v1/seller/notifications/{id}/read` - Mark as read
- `POST /api/v1/seller/notifications/read-all` - Mark all as read

---

## Task 5: Admin Notification Page (Frontend)

**New file: `src/page/NotificationPage.js`**

UI layout (banking-style notification center):
- **Left panel**: Seller list with checkboxes, "Select All" toggle. Each seller row shows username + environment count badge.
- **Right panel**: 
  - Compose section: Title input, Message textarea (multiline), optional environment dropdown per selected seller
  - Send button with confirmation dialog
  - Recent notifications history table below

API calls via `api` (admin-authenticated):
- `POST /publiclink/admin/v1/notify/send`
- `GET /publiclink/admin/v1/notify/sellers`

**Add route in `App.js`:**
```jsx
<Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
  <Route path="/notification" element={<Layout><NotificationPage /></Layout>} />
</Route>
```

**Add nav button in `AdminHomePage.js`:** "Send Notification" button in the header action area.

---

## Task 6: Seller Bell Icon + Popover + Dialog (Frontend)

**Modify `Header.js`:**

Add a Bell icon (MUI `NotificationsIcon` or `NotificationsActiveIcon`) next to the username Chip. Only visible for seller role.

- `IconButton` with `Badge` showing unread count (red badge)
- Click opens a `Popover` (MUI) showing latest 5 notifications as compact items (title + truncated message + time)
- Each item clickable -> opens a `Dialog` with full notification detail (title, full message, timestamp, environment info, read status)
- "Mark all as read" link at the bottom of the popover
- Polling: `useEffect` with `setInterval(60000)` calls `GET /api/v1/seller/notifications/unread-count`

**New component: `src/components/NotificationBell.js`** - Encapsulates all bell icon logic:
- State: `unreadCount`, `popoverAnchor`, `dialogOpen`, `notifications`, `selectedNotification`
- Polling via `useEffect` + `setInterval`
- Uses `pubApi` for API calls (seller endpoints under `/publiclink/api/v1/seller/...`)

---

## Task 7: Integration Testing & Verification

- Verify Liquibase migration runs successfully
- Verify admin can send notification to specific seller + environment
- Verify admin can send notification to all sellers
- Verify seller bell icon shows unread count
- Verify polling refreshes unread count within 60s
- Verify popover shows notification preview
- Verify dialog shows full notification detail
- Verify mark-as-read and mark-all-as-read work
- Verify notification count decreases after reading

---

## File Summary

### New Backend Files (in `publiclink-app/src/main/java/com/qrpublic/apartment/`)
| File | Purpose |
|------|---------|
| `entity/Notification.java` | Notification JPA entity |
| `entity/NotificationRecipient.java` | Recipient JPA entity |
| `repository/NotificationRepository.java` | Notification JPA repo |
| `repository/NotificationRecipientRepository.java` | Recipient JPA repo |
| `requestmodel/SendNotificationRequest.java` | Admin send request DTO |
| `model/notification/NotificationDTO.java` | Seller notification response DTO |
| `model/notification/NotificationCountResponse.java` | Unread count response |
| `service/NotificationService.java` | Business logic |

### Modified Backend Files
| File | Change |
|------|--------|
| `controller/AdminController.java` | Add notify endpoints |
| `controller/SellerPageController.java` | Add notification endpoints |
| `resources/db/changelog/changeset-017-create-notification.sql` | New migration |
| `resources/db/changelog/db.changelog-master.xml` | Register changeset 017 |

### New Frontend Files
| File | Purpose |
|------|---------|
| `src/page/NotificationPage.js` | Admin notification compose page |
| `src/components/NotificationBell.js` | Seller bell icon + popover + dialog |

### Modified Frontend Files
| File | Change |
|------|--------|
| `src/App.js` | Add `/notification` route |
| `src/Header.js` | Add NotificationBell component |
| `src/page/AdminHomePage.js` | Add "Send Notification" nav button |
