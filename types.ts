
export interface ScanResult {
  id: string;
  data: string;
  name?: string; // Optional custom name/alias
  timestamp: number;
  type: 'url' | 'text' | 'wifi' | 'contact' | 'unknown';
  aiAnalysis?: string;
  isAnalyzing: boolean;
}

export interface AnalysisResponse {
  summary: string;
  classification: string;
  safetyRating: 'Safe' | 'Warning' | 'Dangerous' | 'Unknown';
  actions: string[];
}
