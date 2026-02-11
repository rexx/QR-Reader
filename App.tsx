
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ScanResult } from './types';
import QRScanner from './components/QRScanner';
import jsQR from 'jsqr';

const SCAN_HISTORY_KEY = 'smart_lens_history';
const SYNC_URL_KEY = 'smart_lens_sync_url';
const SYNC_TOKEN_KEY = 'smart_lens_sync_token';
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
  const [syncToken, setSyncToken] = useState<string>(() => localStorage.getItem(SYNC_TOKEN_KEY) || '');
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

  const isCameraActive = activeTab === 'scanner' && !selectedResult;

  useEffect(() => {
    localStorage.setItem(SYNC_URL_KEY, syncUrl);
    localStorage.setItem(SYNC_TOKEN_KEY, syncToken);
  }, [syncUrl, syncToken]);

  const pruneHistory = useCallback((currentScans: ScanResult[]) => {
    if (currentScans.length <= LOCAL_LIMIT) return currentScans;
    const synced = currentScans.filter(s => s.syncStatus === 'synced');
    if (synced.length === 0) return currentScans;
    const sortedSynced = [...synced].sort((a, b) => a.timestamp - b.timestamp);
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
    return {
      total: scans.length,
      urls: scans.filter(s => s.type === 'url').length,
      today: scans.filter(s => s.timestamp > twentyFourHoursAgo).length,
      synced: scans.filter(s => s.syncStatus === 'synced').length
    };
  }, [scans]);

  const syncItem = async (item: ScanResult) => {
    if (!syncUrl) return;
    setScans(prev => prev.map(s => s.id === item.id ? { ...s, syncStatus: 'syncing' } : s));
    try {
      await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, token: syncToken }),
      });
      setScans(prev => prev.map(s => s.id === item.id ? { ...s, syncStatus: 'synced' } : s));
    } catch (error) {
      setScans(prev => prev.map(s => s.id === item.id ? { ...s, syncStatus: 'error' } : s));
    }
  };

  const syncAllPending = async () => {
    if (!syncUrl || isSyncing) return;
    setIsSyncing(true);
    const pending = scans.filter(s => s.syncStatus !== 'synced');
    for (const item of pending) { await syncItem(item); }
    setIsSyncing(false);
  };

  const fetchCloudData = async () => {
    if (!syncUrl) return alert("Please set a Webhook URL first.");
    setIsSyncing(true);
    try {
      const urlWithToken = `${syncUrl}${syncUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(syncToken)}`;
      const response = await fetch(urlWithToken);
      if (response.status === 401) throw new Error("Unauthorized");
      const data = await response.json();
      if (Array.isArray(data)) {
        const localIds = new Set(scans.map(s => s.id));
        const newCloudItems = data
          .filter((item: any) => !localIds.has(item.id))
          .map((item: any) => ({ ...item, isCloudOnly: true, syncStatus: 'synced' }));
        setCloudScans(newCloudItems);
      }
    } catch (error: any) {
      alert(error.message === "Unauthorized" ? "Invalid Sync Token!" : "Failed to fetch cloud data.");
    } finally {
      setIsSyncing(false);
    }
  };

  const restoreFromCloud = async () => {
    if (!syncUrl) return alert("Please set a Webhook URL first.");
    if (!window.confirm("Restore latest 256 items from cloud?")) return;
    setIsSyncing(true);
    try {
      const urlWithToken = `${syncUrl}${syncUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(syncToken)}`;
      const response = await fetch(urlWithToken);
      if (response.status === 401) throw new Error("Unauthorized");
      const data = await response.json();
      if (Array.isArray(data)) {
        const latestCloud = data.slice(0, LOCAL_LIMIT).map((item: any) => ({ ...item, syncStatus: 'synced' }));
        setScans(latestCloud);
        setCloudScans([]);
        alert("Restore success.");
      }
    } catch (error: any) {
      alert(error.message === "Unauthorized" ? "Invalid Sync Token!" : "Restore failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTabChange = (tab: 'upload' | 'scanner' | 'history' | 'settings') => {
    setActiveTab(tab);
    setSelectedResult(null);
    if (tab !== 'history') { setLastScanned(null); setSearchQuery(''); setCloudScans([]); }
  };

  const handleScan = useCallback((data: string) => {
    if (!data || data.trim() === '' || data === lastScanned) return;
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
    if (syncUrl) syncItem(newScan);
  }, [lastScanned, syncUrl, syncToken]);

  const handleUpdateName = (id: string, newName: string) => {
    setScans(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, name: newName, syncStatus: 'pending' } as ScanResult : s);
      const target = updated.find(s => s.id === id);
      if (target && syncUrl) syncItem(target);
      return updated;
    });
    if (selectedResult?.id === id) setSelectedResult(prev => prev ? { ...prev, name: newName } : null);
    setIsEditingName(false);
  };

  const handleDeleteScan = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Delete local copy?")) {
      setScans(prev => prev.filter(s => s.id !== id));
      if (selectedResult?.id === id) setSelectedResult(null);
    }
  };

  const allVisibleScans = useMemo(() => {
    const combined = [...scans, ...cloudScans].sort((a, b) => b.timestamp - a.timestamp);
    if (!searchQuery.trim()) return combined;
    const query = searchQuery.toLowerCase();
    return combined.filter(scan => {
      const nameMatch = (scan.name !== undefined && scan.name !== null) ? String(scan.name).toLowerCase().includes(query) : false;
      const dataMatch = scan.data.toLowerCase().includes(query);
      return nameMatch || dataMatch;
    });
  }, [scans, cloudScans, searchQuery]);

  return (
    <div className="h-screen w-screen max-w-md mx-auto flex flex-col bg-slate-950 text-slate-100 shadow-2xl relative border-x border-slate-800 overflow-hidden">
      <header className="p-6 pb-4 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20"><i className="fas fa-qrcode text-xl text-white"></i></div>
            <div>
              <h1 className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Smart Lens</h1>
              <div className="flex items-center gap-1.5"><p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">QR Reader</p>{isCameraActive && <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}</div>
            </div>
          </div>
          <button onClick={() => handleTabChange('settings')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeTab === 'settings' ? 'bg-sky-500 text-white' : 'bg-slate-900 text-slate-500 hover:text-white'}`}><i className="fas fa-cog"></i></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'settings' ? (
          <div className="flex-1 p-6 scrollable-y">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2"><i className="fas fa-cloud-arrow-up text-sky-400"></i> Cloud Sync Settings</h2>
            <div className="space-y-6">
              <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-3">Webhook URL</label>
                <input type="text" value={syncUrl} onChange={(e) => setSyncUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-sky-300 mb-4" />
                
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-3">Sync Token (Secret)</label>
                <input type="password" value={syncToken} onChange={(e) => setSyncToken(e.target.value)} placeholder="Enter your secret key" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-emerald-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={restoreFromCloud} disabled={isSyncing || !syncUrl} className="p-4 rounded-3xl bg-slate-900 border border-slate-800 disabled:opacity-50"><i className="fas fa-download text-sky-400 mb-2"></i><p className="text-[10px] font-bold uppercase">Restore</p></button>
                <button onClick={syncAllPending} disabled={isSyncing || !syncUrl} className="p-4 rounded-3xl bg-slate-900 border border-slate-800 disabled:opacity-50"><i className="fas fa-upload text-emerald-400 mb-2"></i><p className="text-[10px] font-bold uppercase">Sync All</p></button>
              </div>
            </div>
          </div>
        ) : activeTab === 'upload' ? (
          <div className="flex-1 flex flex-col justify-center px-6">
            <div onClick={() => fileInputRef.current?.click()} className="group relative cursor-pointer aspect-square rounded-[3rem] bg-slate-900 border-4 border-slate-800 hover:border-sky-500/50 shadow-2xl overflow-hidden flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center mb-6 shadow-xl"><i className="fas fa-file-arrow-up text-3xl text-sky-400"></i></div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">Upload Image</h3>
              <div className="mt-8 px-6 py-2.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black uppercase tracking-[0.2em]">Select File</div>
            </div>
            <input type="file" ref={fileInputRef} onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                  if (ctx) {
                    canvas.width = img.width; canvas.height = img.height; ctx.drawImage(img, 0, 0);
                    const code = jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data, canvas.width, canvas.height);
                    if (code) handleScan(code.data); else alert("No QR found.");
                  }
                };
                img.src = event.target?.result as string;
              };
              reader.readAsDataURL(file); e.target.value = '';
            }} accept="image/*" className="hidden" />
          </div>
        ) : activeTab === 'scanner' ? (
          <div className="flex-1 flex flex-col justify-center px-6"><QRScanner isActive={isCameraActive} onScan={handleScan} /></div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedResult ? (
              <div className="flex-1 flex flex-col overflow-hidden px-6 pt-6">
                <button onClick={() => setSelectedResult(null)} className="flex items-center gap-2 text-slate-500 mb-6 text-[10px] font-bold uppercase"><i className="fas fa-chevron-left"></i> Back</button>
                <div className="flex-1 scrollable-y pb-32">
                  <div className="p-6 rounded-[2.3rem] bg-slate-900 border border-slate-800">
                    <div 
                      onClick={() => !selectedResult.isCloudOnly && (setIsEditingName(true), setEditNameValue(selectedResult.name !== undefined && selectedResult.name !== null ? String(selectedResult.name) : ''))} 
                      className="flex items-center gap-2 cursor-pointer mb-4"
                    >
                      {isEditingName ? (
                        <input 
                          autoFocus 
                          value={editNameValue} 
                          onChange={e => setEditNameValue(e.target.value)} 
                          onBlur={() => handleUpdateName(selectedResult.id, editNameValue)} 
                          onKeyDown={e => e.key === 'Enter' && handleUpdateName(selectedResult.id, editNameValue)}
                          className="bg-slate-950 border border-sky-500 rounded px-2 py-1 text-sm w-full outline-none" 
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-slate-100">
                            {(selectedResult.name !== undefined && selectedResult.name !== null && selectedResult.name !== "") ? String(selectedResult.name) : 'Untitled Scan'}
                          </h2>
                          {!selectedResult.isCloudOnly && <i className="fas fa-pencil-alt text-[10px] text-slate-600"></i>}
                        </div>
                      )}
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 break-all text-xs font-mono mb-6 text-sky-200 leading-relaxed">
                      {selectedResult.data}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { navigator.clipboard.writeText(selectedResult.data); alert("Copied!"); }} className="flex-1 py-3 rounded-xl bg-slate-800 text-xs font-bold active:scale-95 transition-all">Copy</button>
                      {selectedResult.type === 'url' && <button onClick={() => window.open(selectedResult.data, '_blank')} className="flex-1 py-3 rounded-xl bg-sky-600 text-xs font-bold active:scale-95 transition-all">Open</button>}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden pt-6">
                <div className="px-4 mb-4 flex gap-2">
                  <div className="relative flex-1">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs"></i>
                    <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm outline-none focus:border-sky-500/50" />
                  </div>
                  <button onClick={() => setIsStatsExpanded(!isStatsExpanded)} className={`w-10 h-10 rounded-xl border transition-all ${isStatsExpanded ? 'bg-sky-500 border-sky-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}><i className="fas fa-chart-bar text-xs"></i></button>
                  <button onClick={syncAllPending} disabled={isSyncing} className="w-10 h-10 bg-slate-900 rounded-xl border border-slate-800 text-slate-500 disabled:opacity-30"><i className={`fas ${isSyncing ? 'fa-circle-notch animate-spin' : 'fa-sync'} text-xs`}></i></button>
                </div>
                {isStatsExpanded && (
                  <div className="px-4 mb-4 grid grid-cols-4 gap-2 bg-slate-900/50 p-3 rounded-2xl border border-slate-800 mx-4">
                    <div className="text-center"><p className="text-lg font-black text-white">{stats.total}</p><p className="text-[7px] uppercase font-bold text-slate-500">Local</p></div>
                    <div className="text-center border-l border-slate-800"><p className="text-lg font-black text-emerald-400">{stats.synced}</p><p className="text-[7px] uppercase font-bold text-slate-500">Sync</p></div>
                    <div className="text-center border-l border-slate-800"><p className="text-lg font-black text-amber-400">{stats.today}</p><p className="text-[7px] uppercase font-bold text-slate-500">Today</p></div>
                    <div className="text-center border-l border-slate-800"><p className="text-lg font-black text-indigo-400">{stats.urls}</p><p className="text-[7px] uppercase font-bold text-slate-500">Link</p></div>
                  </div>
                )}
                <div className="flex-1 scrollable-y px-4 pb-32 space-y-3">
                  {allVisibleScans.length === 0 ? (
                    <div className="py-20 text-center opacity-30 flex flex-col items-center">
                      <i className="fas fa-history text-4xl mb-4"></i>
                      <p className="text-xs font-bold uppercase tracking-widest">No records found</p>
                    </div>
                  ) : (
                    allVisibleScans.map(scan => (
                      <div key={scan.id} onClick={() => setSelectedResult(scan)} className={`p-4 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${scan.isCloudOnly ? 'bg-slate-950 border-dashed border-slate-800 opacity-70' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${scan.type === 'url' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            <i className={scan.isCloudOnly ? 'fas fa-cloud' : (scan.type === 'url' ? 'fas fa-link' : 'fas fa-font')}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate pr-2">
                              {(scan.name !== undefined && scan.name !== null && scan.name !== "") ? String(scan.name) : scan.data}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{new Date(scan.timestamp).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {scan.syncStatus === 'synced' && <i className="fas fa-check-circle text-emerald-500 text-[10px]" title="Synced"></i>}
                            {scan.syncStatus === 'syncing' && <i className="fas fa-circle-notch animate-spin text-sky-400 text-[10px]"></i>}
                            {!scan.isCloudOnly && <button onClick={e => handleDeleteScan(scan.id, e)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 hover:text-red-500 hover:bg-red-500/10"><i className="fas fa-trash text-xs"></i></button>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {syncUrl && (
                    <button onClick={fetchCloudData} disabled={isSyncing} className="w-full p-4 border border-dashed border-slate-800 rounded-2xl text-[10px] font-bold uppercase text-slate-500 hover:text-sky-400 hover:border-sky-500/50 transition-all flex items-center justify-center gap-2">
                      <i className={`fas ${isSyncing ? 'fa-circle-notch animate-spin' : 'fa-search'}`}></i>
                      {isSyncing ? 'Fetching...' : 'Load More from Cloud'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="shrink-0 bg-slate-950/90 border-t border-slate-800/50 px-4 pt-4 pb-10 flex justify-around">
        <button onClick={() => handleTabChange('upload')} className={`flex flex-col items-center gap-1 flex-1 transition-all ${activeTab === 'upload' ? 'text-sky-400' : 'text-slate-600'}`}><i className="fas fa-file-upload text-lg"></i><span className="text-[8px] font-bold uppercase">Upload</span></button>
        <button onClick={() => handleTabChange('scanner')} className={`flex flex-col items-center gap-1 flex-1 transition-all ${activeTab === 'scanner' ? 'text-sky-400' : 'text-slate-600'}`}><i className="fas fa-camera text-lg"></i><span className="text-[8px] font-bold uppercase">Camera</span></button>
        <button onClick={() => handleTabChange('history')} className={`flex flex-col items-center gap-1 flex-1 transition-all ${activeTab === 'history' ? 'text-sky-400' : 'text-slate-600'}`}><i className="fas fa-history text-lg"></i><span className="text-[8px] font-bold uppercase">History</span></button>
      </nav>
    </div>
  );
};

export default App;
