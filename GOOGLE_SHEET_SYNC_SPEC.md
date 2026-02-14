
# Function Specification: Smart Lens Sync to Google Sheets (GAS Deep Sync)

## 1. Overview
This specification defines the synchronization logic between Smart Lens and Google Sheets. The system uses a "lightweight local cache, full cloud storage" strategy.

## 2. Technical Architecture
- **Protocol**: 
    - `POST`: For sending data (PUSH).
    - `GET`: For retrieving data (PULL).
- **Identifier**: `id` is the unique primary key.

## 3. Sync Operations

### 3.1 PUSH (Local -> Cloud)
- **Logic**: Identifies any record with `syncStatus !== 'synced'` and uploads it.
- **Goal**: Persist new scans or local updates to the cloud master sheet.

### 3.2 PULL (Cloud -> Local)
- **Logic (Audit & Merge)**:
    1.  **Restore**: Downloads records found on the cloud that are missing locally.
    2.  **Sync**: Overwrites local data with cloud data for matching IDs (Cloud is Source of Truth).
    3.  **Audit**: If a local item is marked `synced` but is missing from the cloud, it is reset to `pending` status so it can be re-uploaded during the next PUSH.
- **Goal**: Synchronize multiple devices and recover data manually deleted from the cloud.

## 4. Local Capacity Management
- **Limit**: 256 local entries.
- **Rule**: Oldest `synced` items are removed first when the limit is hit. `pending` items are never automatically removed.
