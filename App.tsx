
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ScanResult } from './types';
import QRScanner from './components/QRScanner';
import jsQR from 'jsqr';

const SCAN_HISTORY_KEY = 'smart_lens_history';
const SYNC_URL_KEY = 'smart_lens_sync_url';
const LOCAL_LIMIT = 256;

const App: React.FC = () => {
  const [scans, setScans] = useState<ScanResult[]>(() => {
    try {
      const saved = localStorage.getItem(SCAN_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [syncUrl, setSyncUrl] = useState<string>(() => localStorage.getItem(SYNC_URL_KEY) || '');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'scanner' | 'history' | 'settings'>('scanner');
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudScans, setCloudScans] = useState<ScanResult[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isCameraActive = activeTab === 'scanner' && !selectedResult;

  // Persistence and Pruning
  useEffect(() => {
    localStorage.setItem(SYNC_URL_KEY, syncUrl);
  }, [syncUrl]);

  const pruneHistory = useCallback((currentScans: ScanResult[]) => {
    if (currentScans.length <= LOCAL_LIMIT) return currentScans;

    // Separate synced and unsynced
    const synced = currentScans.filter(s => s.syncStatus === 'synced');
    const unsynced = currentScans.filter(s => s.syncStatus !== 'synced');

    if (synced.length === 0) return currentScans; // Cannot prune if nothing is synced

    // Sort synced by timestamp ascending (oldest first)
    const sortedSynced = [...synced].sort((a, b) => a.timestamp - b.timestamp);
    
    // How many to remove?
    const toRemoveCount = currentScans.length - LOCAL_LIMIT;
    const removedIds = new Set(sortedSynced.slice(0, toRemoveCount).map(s => s.id));

    return currentScans.filter(s => !removedIds.has(s.id));
  }, []);

  useEffect(() => {
    const pruned = pruneHistory(scans);
    if (pruned.length !== scans.length) {
      setScans(pruned);
    }
    localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(pruned));
  }, [scans, pruneHistory]);

  const stats = useMemo(() => {
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const total = scans.length;
    const urls = scans.filter(s => s.type === 'url').length;
    const today = scans.filter(s => s.timestamp > twentyFourHoursAgo).length;
    const synced = scans.filter(s => s.syncStatus === 'synced').length;

    return { total, urls, today, synced };
  }, [scans]);

  // Sync Logic
  const syncItem = async (item: ScanResult) => {
    if (!syncUrl) return;

    setScans(prev => prev.map(s => s.id === item.id ? { ...s, syncStatus: 'syncing' } : s));

    try {
      const response = await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors', // GAS web apps often require no-cors or specialized handling
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      
      // Note: with no-cors, we can't see the response body, but usually if it doesn't throw, it's sent.
      // In a real world GAS scenario, you might need a proxy or proper CORS headers.
      // For this spec, we assume success if no error.
      setScans(prev => prev.map(s => s.id === item.id ? { ...s, syncStatus: 'synced' } : s));
    } catch (error) {
      console.error("Sync failed", error);
      setScans(prev => prev.map(s => s.id === item.id ? { ...s, syncStatus: 'error' } : s));
    }
  };

  const syncAllPending = async () => {
    if (!syncUrl || isSyncing) return;
    setIsSyncing(true);
    const pending = scans.filter(s => s.syncStatus !== 'synced');
    for (const item of pending) {
      await syncItem(item);
    }
    setIsSyncing(false);
  };

  const fetchCloudData = async () => {
    if (!syncUrl) return alert("Please set a Webhook URL first.");
    setIsSyncing(true);
    try {
      const response = await fetch(syncUrl);
      const data = await response.json();
      if (Array.isArray(data)) {
        const localIds = new Set(scans.map(s => s.id));
        const newCloudItems = data
          .filter((item: any) => !localIds.has(item.id))
          .map((item: any) => ({ ...item, isCloudOnly: true, syncStatus: 'synced' }));
        
        setCloudScans(newCloudItems);
        if (newCloudItems.length === 0) {
          alert("No new items found on cloud.");
        }
      }
    } catch (error) {
      alert("Failed to fetch cloud data. Check your URL and CORS settings.");
    } finally {
      setIsSyncing(false);
    }
  };

  const restoreFromCloud = async () => {
    if (!syncUrl) return alert("Please set a Webhook URL first.");
    if (!window.confirm("This will replace your local history with the latest 256 items from the cloud. Continue?")) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch(syncUrl);
      const data = await response.json();
      if (Array.isArray(data)) {
        const latestCloud = data.slice(0, LOCAL_LIMIT).map((item: any) => ({
          ...item,
          syncStatus: 'synced'
        }));
        setScans(latestCloud);
        setCloudScans([]);
        alert(`Successfully restored ${latestCloud.length} items.`);
      }
    } catch (error) {
      alert("Restore failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTabChange = (tab: 'upload' | 'scanner' | 'history' | 'settings') => {
    setActiveTab(tab);
    setSelectedResult(null);
    if (tab !== 'history') {
      setLastScanned(null);
      setSearchQuery('');
      setCloudScans([]);
    }
  };

  const handleScan = useCallback((data: string) => {
    if (!data || data.trim() === '') return;
    if (data === lastScanned) return;
    setLastScanned(data);

    const newScan: ScanResult = {
      id: Math.random().toString(36).substring(7),
      data,
      timestamp: Date.now(),
      type: data.startsWith('http') ? 'url' : 'text',
      syncStatus: 'pending'
    };

    setScans(prev => [newScan, ...prev]);
    setSelectedResult(newScan);
    setActiveTab('history');
    setEditNameValue('');
    setIsEditingName(false);
    
    // Auto-sync
    if (syncUrl) syncItem(newScan);
  }, [lastScanned, syncUrl]);

  const handleUpdateName = (id: string, newName: string) => {
    setScans(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, name: newName, syncStatus: s.syncStatus === 'synced' ? 'pending' : s.syncStatus } as ScanResult : s);
      const target = updated.find(s => s.id === id);
      if (target && syncUrl) syncItem(target);
      return updated;
    });
    if (selectedResult?.id === id) {
      setSelectedResult(prev => prev ? { ...prev, name: newName } : null);
    }
    setIsEditingName(false);
  };

  const handleDeleteScan = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this scan record? (Note: This only deletes local copy)")) {
      setScans(prev => prev.filter(s => s.id !== id));
      if (selectedResult?.id === id) {
        setSelectedResult(null);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const allVisibleScans = useMemo(() => {
    const combined = [...scans, ...cloudScans].sort((a, b) => b.timestamp - a.timestamp);
    if (!searchQuery.trim()) return combined;
    const query = searchQuery.toLowerCase();
    return combined.filter(scan => 
      (scan.name?.toLowerCase().includes(query)) || 
      (scan.data.toLowerCase().includes(query))
    );
  }, [scans, cloudScans, searchQuery]);

  return (
    <div className="h-screen w-screen max-w-md mx-auto flex flex-col bg-slate-950 text-slate-100 shadow-2xl relative border-x border-slate-800 overflow-hidden">
      <header className="p-6 pb-4 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <i className="fas fa-qrcode text-xl text-white"></i>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Smart Lens</h1>
              <div className="flex items-center gap-1.5">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">QR Reader</p>
                {isCameraActive && (
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={() => handleTabChange('settings')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeTab === 'settings' ? 'bg-sky-500 text-white' : 'bg-slate-900 text-slate-500 hover:text-white'}`}
          >
            <i className="fas fa-cog"></i>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'settings' ? (
          <div className="flex-1 p-6 scrollable-y">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <i className="fas fa-cloud-arrow-up text-sky-400"></i> Cloud Sync Settings
            </h2>
            
            <div className="space-y-6">
              <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-3">Google Apps Script Webhook URL</label>
                <input 
                  type="text"
                  value={syncUrl}
                  onChange={(e) => setSyncUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono text-sky-300 placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
                <p className="mt-3 text-[10px] text-slate-500 leading-relaxed italic">
                  * All scans will be automatically synced to your Google Sheet if a URL is provided.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={restoreFromCloud}
                  disabled={isSyncing || !syncUrl}
                  className="p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-sky-500/30 text-center group disabled:opacity-50"
                >
                  <i className="fas fa-download text-sky-400 mb-2 group-hover:scale-110 transition-transform"></i>
                  <p className="text-[10px] font-bold uppercase tracking-widest">Restore</p>
                </button>
                <button 
                  onClick={syncAllPending}
                  disabled={isSyncing || !syncUrl}
                  className="p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-500/30 text-center group disabled:opacity-50"
                >
                  <i className="fas fa-upload text-emerald-400 mb-2 group-hover:scale-110 transition-transform"></i>
                  <p className="text-[10px] font-bold uppercase tracking-widest">Sync All</p>
                </button>
              </div>

              <div className="p-5 rounded-3xl bg-amber-500/5 border border-amber-500/10">
                <h4 className="text-xs font-bold text-amber-500 mb-2">Local Storage Info</h4>
                <p className="text-[10px] text-amber-500/70 leading-relaxed">
                  Local cache is limited to the latest <b>256</b> synced records. Oldest synced records are automatically pruned to keep the app fast.
                </p>
              </div>
            </div>
          </div>
        ) : activeTab === 'upload' ? (
          <div className="flex-1 flex flex-col justify-center px-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer aspect-square rounded-[3rem] bg-slate-900 border-4 border-slate-800 hover:border-sky-500/50 shadow-2xl overflow-hidden"
            >
              <div className="w-full h-full flex flex-col items-center justify-center relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sky-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100"></div>
                <div className="w-20 h-20 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 group-hover:bg-slate-800 transition-all">
                  <i className="fas fa-file-arrow-up text-3xl text-sky-400 group-hover:text-sky-300"></i>
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-2">Upload Image</h3>
                <p className="text-xs text-slate-500 font-medium tracking-wide text-center px-10">Select a QR Code image<br/>to decode</p>
                <div className="mt-8 px-6 py-2.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black uppercase tracking-[0.2em] group-hover:bg-sky-500 group-hover:text-white transition-all">
                  Select File
                </div>
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  if (context) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    context.drawImage(img, 0, 0);
                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);
                    if (code && code.data && code.data.trim() !== '') {
                      handleScan(code.data);
                    } else {
                      alert("No valid QR Code detected in this image.");
                    }
                  }
                };
                img.src = event.target?.result as string;
              };
              reader.readAsDataURL(file);
              e.target.value = '';
            }} accept="image/*" className="hidden" />
          </div>
        ) : activeTab === 'scanner' ? (
          <div className="flex-1 flex flex-col justify-center px-6">
            <div className="relative">
              <QRScanner isActive={isCameraActive} onScan={handleScan} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedResult ? (
              <div className="flex-1 flex flex-col overflow-hidden px-6 pt-6">
                <div className="flex items-center mb-6 shrink-0">
                  <button 
                    onClick={() => setSelectedResult(null)}
                    className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest"
                  >
                    <i className="fas fa-chevron-left"></i> Back to History
                  </button>
                </div>

                <div className="flex-1 scrollable-y pb-32">
                  <div className="p-1 rounded-[2.5rem] bg-gradient-to-br from-slate-800 to-transparent">
                    <div className="p-6 rounded-[2.3rem] bg-slate-900 border border-slate-800 shadow-2xl">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex-1 mr-4">
                          {isEditingName ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={editNameValue}
                                onChange={(e) => setEditNameValue(e.target.value)}
                                onBlur={() => handleUpdateName(selectedResult.id, editNameValue)}
                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateName(selectedResult.id, editNameValue)}
                                className="bg-slate-950 border border-sky-500/50 rounded-lg px-3 py-2 text-sm w-full outline-none text-white focus:ring-2 focus:ring-sky-500/30"
                                placeholder="Name this scan..."
                              />
                            </div>
                          ) : (
                            <div 
                              className="flex items-center gap-2 cursor-pointer group"
                              onClick={() => {
                                if (selectedResult.isCloudOnly) return; // Can't edit cloud-only until it's "restored" or handled locally
                                setIsEditingName(true);
                                setEditNameValue(selectedResult.name || '');
                              }}
                            >
                              <h2 className="text-base font-bold text-slate-100 truncate group-hover:text-sky-400">
                                {selectedResult.name || 'Untitled Scan'}
                              </h2>
                              {!selectedResult.isCloudOnly && <i className="fas fa-pencil-alt text-[10px] text-slate-600 group-hover:text-sky-400"></i>}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              {new Date(selectedResult.timestamp).toLocaleString()}
                            </span>
                            {selectedResult.syncStatus === 'synced' && <i className="fas fa-cloud-check text-emerald-500 text-[10px]"></i>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/50 break-all text-sm font-mono mb-6 text-sky-200/80 shadow-inner leading-relaxed min-h-[120px]">
                        {selectedResult.data}
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => copyToClipboard(selectedResult.data)}
                          className="flex-1 py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center gap-2 text-xs font-bold border border-slate-700 active:scale-95 transition-all"
                        >
                          <i className="far fa-copy text-sm"></i> Copy
                        </button>
                        {selectedResult.type === 'url' && (
                          <button 
                            onClick={() => window.open(selectedResult.data, '_blank')}
                            className="flex-1 py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center gap-2 text-xs font-bold shadow-lg shadow-sky-600/10 active:scale-95 transition-all"
                          >
                            <i className="fas fa-external-link-alt text-sm"></i> Open
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden pt-6">
                <div className="shrink-0 px-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="relative group flex-1">
                      <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm group-focus-within:text-sky-400"></i>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/30 transition-none"
                      />
                    </div>
                    
                    <div className="flex gap-1.5 shrink-0">
                      <button 
                        onClick={() => setIsStatsExpanded(!isStatsExpanded)}
                        className={`flex items-center justify-center w-11 h-11 rounded-2xl border active:scale-95 ${isStatsExpanded ? 'bg-sky-500 border-sky-400 text-white shadow-lg shadow-sky-500/20' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-sky-400 hover:border-sky-400/30'}`}
                        title="Statistics"
                      >
                        <i className="fas fa-chart-simple text-sm"></i>
                      </button>
                      
                      <button 
                        onClick={() => syncAllPending()}
                        disabled={!syncUrl || isSyncing}
                        className="flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-400/30 active:scale-95 disabled:opacity-30"
                        title="Sync All"
                      >
                        <i className={`fas ${isSyncing ? 'fa-circle-notch animate-spin' : 'fa-cloud-arrow-up'} text-sm`}></i>
                      </button>
                    </div>
                  </div>

                  {isStatsExpanded && (
                    <div className="mb-4">
                      <div className="grid grid-cols-4 gap-2 bg-slate-900/40 p-3 rounded-[1.5rem] border border-slate-800/50 backdrop-blur-sm">
                        <div className="flex flex-col items-center justify-center text-center p-1">
                          <span className="text-lg font-black text-white">{stats.total}</span>
                          <span className="text-[7px] uppercase font-bold text-slate-500 tracking-tighter">Local</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center p-1 border-l border-slate-800/50">
                          <span className="text-lg font-black text-emerald-400">{stats.synced}</span>
                          <span className="text-[7px] uppercase font-bold text-slate-500 tracking-tighter">Synced</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center p-1 border-l border-slate-800/50">
                          <span className="text-lg font-black text-amber-400">{stats.today}</span>
                          <span className="text-[7px] uppercase font-bold text-slate-500 tracking-tighter">Today</span>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center p-1 border-l border-slate-800/50">
                          <span className="text-lg font-black text-indigo-400">{stats.urls}</span>
                          <span className="text-[7px] uppercase font-bold text-slate-500 tracking-tighter">Links</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 scrollable-y pb-32 px-4">
                  {allVisibleScans.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/40 rounded-[2.5rem] border border-dashed border-slate-800">
                      <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-6 border border-slate-800 shadow-xl">
                        <i className="fas fa-history text-3xl text-slate-700"></i>
                      </div>
                      <p className="text-sm font-bold text-slate-600 tracking-wide">No history found</p>
                      <button 
                        onClick={() => handleTabChange('scanner')}
                        className="mt-6 text-sky-400 text-xs font-bold uppercase tracking-widest hover:underline"
                      >
                        Start scanning now
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {allVisibleScans.map((scan) => (
                        <div 
                          key={scan.id} 
                          onClick={() => setSelectedResult(scan)}
                          className={`p-4 rounded-[1.5rem] border cursor-pointer group shadow-sm active:scale-[0.98] relative w-full overflow-hidden transition-all ${scan.isCloudOnly ? 'bg-slate-950 border-slate-800/50 border-dashed opacity-80' : 'bg-slate-900 border-slate-800 hover:border-sky-500/30 hover:bg-slate-800/50'}`}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center ${scan.type === 'url' ? 'bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20' : 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20'}`}>
                              <i className={scan.isCloudOnly ? 'fas fa-cloud text-base' : (scan.type === 'url' ? 'fas fa-link text-base' : 'fas fa-font text-base')}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              {scan.name ? (
                                <>
                                  <p className="text-sm font-black text-slate-100 truncate pr-1">
                                    {scan.name} {scan.isCloudOnly && <span className="text-[8px] px-1.5 py-0.5 bg-slate-800 rounded-full ml-1 text-slate-500 font-normal">Cloud Only</span>}
                                  </p>
                                  <p className="text-[11px] text-slate-400 truncate pr-1 mt-0.5 opacity-80">
                                    {scan.data}
                                  </p>
                                </>
                              ) : (
                                <p className="text-sm font-black text-slate-100 truncate pr-1">
                                  {scan.data} {scan.isCloudOnly && <span className="text-[8px] px-1.5 py-0.5 bg-slate-800 rounded-full ml-1 text-slate-500 font-normal">Cloud Only</span>}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                  <i className="far fa-calendar-alt opacity-40 text-[8px]"></i>
                                  {new Date(scan.timestamp).toLocaleDateString()}
                                </p>
                                {!scan.isCloudOnly && (
                                  <div className="flex items-center gap-1 text-[9px]">
                                    {scan.syncStatus === 'synced' ? (
                                      <i className="fas fa-cloud-check text-emerald-500" title="Synced"></i>
                                    ) : scan.syncStatus === 'syncing' ? (
                                      <i className="fas fa-circle-notch animate-spin text-sky-400" title="Syncing"></i>
                                    ) : scan.syncStatus === 'error' ? (
                                      <i className="fas fa-cloud-exclamation text-red-500" title="Sync Error"></i>
                                    ) : (
                                      <i className="fas fa-cloud-arrow-up text-slate-600" title="Pending Sync"></i>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            {!scan.isCloudOnly && (
                              <button 
                                onClick={(e) => handleDeleteScan(scan.id, e)}
                                className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-slate-700 hover:text-red-400 hover:bg-red-400/10 active:scale-90 transition-none"
                              >
                                <i className="far fa-trash-can text-sm"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {cloudScans.length === 0 && syncUrl && (
                        <button 
                          onClick={fetchCloudData}
                          disabled={isSyncing}
                          className="mt-4 p-4 rounded-[1.5rem] border border-dashed border-slate-800 text-slate-500 hover:text-sky-400 hover:border-sky-500/50 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                          <i className={`fas ${isSyncing ? 'fa-circle-notch animate-spin' : 'fa-magnifying-glass'} text-xl`}></i>
                          <p className="text-[10px] font-bold uppercase tracking-widest">Load More from Cloud</p>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="shrink-0 bg-slate-950/90 backdrop-blur-3xl border-t border-slate-800/50 px-4 pt-4 pb-10 flex justify-around items-center z-50 shadow-[0_-10px_20px_rgba(0,0,0,0.4)]">
        <button onClick={() => handleTabChange('upload')} className={`flex flex-col items-center gap-1.5 group flex-1 ${activeTab === 'upload' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}>
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl ${activeTab === 'upload' ? 'bg-sky-400/10' : ''}`}><i className={`fas fa-file-upload text-lg ${activeTab === 'upload' ? 'scale-110' : ''}`}></i></div>
          <span className="text-[9px] font-black uppercase tracking-[0.1em]">Upload</span>
        </button>
        <button onClick={() => handleTabChange('scanner')} className={`flex flex-col items-center gap-1.5 group flex-1 ${activeTab === 'scanner' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}>
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl ${activeTab === 'scanner' ? 'bg-sky-400/10' : ''}`}><i className={`fas fa-camera text-lg ${activeTab === 'scanner' ? 'scale-110' : ''}`}></i></div>
          <span className="text-[9px] font-black uppercase tracking-[0.1em]">Camera</span>
        </button>
        <button onClick={() => handleTabChange('history')} className={`flex flex-col items-center gap-1.5 group flex-1 ${activeTab === 'history' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}>
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl ${activeTab === 'history' ? 'bg-sky-400/10' : ''}`}>
            <div className="relative">
              <i className={`fas fa-clock-rotate-left text-lg ${activeTab === 'history' ? 'scale-110' : ''}`}></i>
              {(scans.length > 0 || stats.synced < stats.total) && <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border-2 border-slate-950 ${stats.synced < stats.total ? 'bg-amber-500' : 'bg-sky-500'}`}></div>}
            </div>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.1em]">History</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
