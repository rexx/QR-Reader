
export interface ScanResult {
  id: string;
  data: string;
  name?: string; // Optional custom name/alias
  timestamp: number;
  type: 'url' | 'text' | 'wifi' | 'contact' | 'unknown';
}
