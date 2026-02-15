# Function Specification: Smart Lens Sync to Google Sheets

## 1. Overview
This specification defines the synchronization logic between the Smart Lens web application and Google Sheets via Google Apps Script (GAS). The system utilizes a "local-first with cloud master" strategy, ensuring offline availability while maintaining data persistence across sessions and devices.

## 2. Technical Architecture

### 2.1 Protocol & Data Format
- **PULL (GET)**: Used to retrieve the full list of records from the spreadsheet.
    - URL Parameter: `token=[SECRET_KEY]` for authentication.
    - Response: JSON array of `ScanResult` objects.
- **PUSH (POST)**: Used to upload one or more records.
    - Security: Token can be passed via URL parameter `?token=...` or inside the JSON Body.
    - Data Structure: **All uploads are batch-wrapped**.
      ```json
      {
        "token": "YOUR_SECRET_KEY",
        "items": [
          { "id": "...", "data": "...", "timestamp": 12345, "type": "...", "name": "..." }
        ]
      }
      ```

### 2.2 Identification
- **Primary Key**: The `id` field (generated locally) is the unique identifier.
- **Conflict Resolution**: The Cloud is the "Source of Truth". If an ID exists on both sides, the Cloud data overwrites local data during a Pull.

## 3. Sync Operations

### 3.1 PUSH (Local -> Cloud)
- **Automatic Sync**: Triggered immediately in the following scenarios:
    1.  After a successful scan (New record).
    2.  After editing a record's properties (e.g., updating a Name/Alias).
- **Batch Push**: Manual trigger in settings that identifies all records where `syncStatus !== 'synced'`.
- **Implementation**: The backend performs an "upsert" (Update or Insert) based on the `id`.

### 3.2 PULL (Cloud -> Local Audit & Merge)
The PULL operation follows a strict auditing sequence to maintain integrity:
1.  **Restore**: Cloud records missing locally are downloaded (supporting multi-device sync).
2.  **Update**: Matching IDs are updated with cloud content (names, corrected data).
3.  **Audit Reset**: If a local item is marked as `synced` but is no longer present on the Cloud (e.g., manually deleted from the Sheet), it is reset to `pending` so the user can decide to push it back or delete it.

## 4. Local Capacity & Performance

### 4.1 Local Storage Management
- **Local Limit**: 256 records.
- **Pruning Logic**: When the limit is reached, the system automatically removes the **oldest already-synced** items. Items marked as `pending` (unsynced) are never automatically deleted to prevent data loss.

### 4.2 GAS Optimization
- The backend caches the ID column in memory during a batch execution to minimize spreadsheet read operations, ensuring performance even when uploading many records at once.

## 5. Security
- Access to both `doGet` and `doPost` requires a `WEBHOOK_TOKEN` match. 
- Requests without a valid token return a `401 Unauthorized` status.