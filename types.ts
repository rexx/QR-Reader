
export interface ScanResult {
  id: string;
  data: string;
  name?: string; // Optional custom name/alias
  timestamp: number;
  type: 'url' | 'text' | 'wifi' | 'contact' | 'unknown';
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'error';
  isCloudOnly?: boolean; // Flag for items fetched from cloud but not stored locally
}
