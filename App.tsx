
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ScanResult } from './types';
import QRScanner from './components/QRScanner';

const SCAN_HISTORY_KEY = 'smart_lens_history';

const App: React.FC = () => {
  const [scans, setScans] = useState<ScanResult[]>(() => {
    try {
      const saved = localStorage.getItem(SCAN_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scanner' | 'history'>('scanner');
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // The camera is active ONLY when we are on the scanner tab AND NOT looking at a specific result detail
  const isCameraActive = activeTab === 'scanner' && !selectedResult;

  useEffect(() => {
    localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(scans));
  }, [scans]);

  const handleTabChange = (tab: 'scanner' | 'history') => {
    setActiveTab(tab);
    setSelectedResult(null); // Reset detail view when switching tabs
    if (tab === 'scanner') {
      setLastScanned(null);
      setSearchQuery('');
    }
  };

  const handleScan = useCallback((data: string) => {
    if (data === lastScanned) return;
    setLastScanned(data);

    const newScan: ScanResult = {
      id: Math.random().toString(36).substring(7),
      data,
      timestamp: Date.now(),
      type: data.startsWith('http') ? 'url' : 'text',
    };

    setScans(prev => [newScan, ...prev]);
    setSelectedResult(newScan);
    setActiveTab('history'); // Automatically switch to history tab to show result
    setEditNameValue('');
    setIsEditingName(false);
  }, [lastScanned]);

  const handleUpdateName = (id: string, newName: string) => {
    setScans(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
    if (selectedResult?.id === id) {
      setSelectedResult(prev => prev ? { ...prev, name: newName } : null);
    }
    setIsEditingName(false);
  };

  const handleDeleteScan = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this scan record?")) {
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

  const filteredScans = useMemo(() => {
    if (!searchQuery.trim()) return scans;
    const query = searchQuery.toLowerCase();
    return scans.filter(scan => 
      (scan.name?.toLowerCase().includes(query)) || 
      (scan.data.toLowerCase().includes(query))
    );
  }, [scans, searchQuery]);

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-slate-950 text-slate-100 shadow-2xl relative border-x border-slate-800">
      <header className="p-6 pb-2 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
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
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pt-6 pb-28">
        {activeTab === 'scanner' ? (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="relative">
              <QRScanner isActive={isCameraActive} onScan={handleScan} />
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            {selectedResult ? (
              /* Detail View */
              <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
                <div className="flex items-center justify-between mb-2">
                  <button 
                    onClick={() => setSelectedResult(null)}
                    className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest"
                  >
                    <i className="fas fa-chevron-left"></i> Back to History
                  </button>
                  <button 
                    onClick={() => handleTabChange('scanner')}
                    className="text-sky-400 text-[10px] font-black hover:bg-sky-400/20 transition-colors whitespace-nowrap bg-sky-400/10 px-3 py-1.5 rounded-full uppercase tracking-widest border border-sky-400/20"
                  >
                    New Scan
                  </button>
                </div>

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
                              setIsEditingName(true);
                              setEditNameValue(selectedResult.name || '');
                            }}
                          >
                            <h2 className="text-base font-bold text-slate-100 truncate group-hover:text-sky-400 transition-colors">
                              {selectedResult.name || 'Untitled Scan'}
                            </h2>
                            <i className="fas fa-pencil-alt text-[10px] text-slate-600 group-hover:text-sky-400 transition-colors"></i>
                          </div>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mt-1">
                          {new Date(selectedResult.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/50 break-all text-sm font-mono mb-6 text-sky-200/80 shadow-inner leading-relaxed min-h-[100px]">
                      {selectedResult.data}
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={() => copyToClipboard(selectedResult.data)}
                        className="flex-1 py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 text-xs font-bold border border-slate-700 active:scale-95"
                      >
                        <i className="far fa-copy text-sm"></i> Copy
                      </button>
                      {selectedResult.type === 'url' && (
                        <button 
                          onClick={() => window.open(selectedResult.data, '_blank')}
                          className="flex-1 py-3.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white transition-all flex items-center justify-center gap-2 text-xs font-bold shadow-lg shadow-sky-600/10 active:scale-95"
                        >
                          <i className="fas fa-external-link-alt text-sm"></i> Open
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* History List View */
              <>
                <div className="flex flex-col gap-4 mb-2">
                  <h2 className="text-xl font-black">History</h2>
                  
                  <div className="relative group">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm group-focus-within:text-sky-400 transition-colors"></i>
                    <input
                      type="text"
                      placeholder="Search history..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 pl-11 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/30 transition-all"
                    />
                  </div>
                </div>

                {scans.length === 0 ? (
                  <div className="text-center py-24 bg-slate-900/40 rounded-[2.5rem] border border-dashed border-slate-800">
                    <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-6 border border-slate-800 shadow-xl">
                      <i className="fas fa-history text-3xl text-slate-700"></i>
                    </div>
                    <p className="text-sm font-bold text-slate-600 tracking-wide">Your history is empty</p>
                    <button 
                      onClick={() => handleTabChange('scanner')}
                      className="mt-6 text-sky-400 text-xs font-bold uppercase tracking-widest hover:underline"
                    >
                      Start scanning now
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {filteredScans.map((scan) => (
                      <div 
                        key={scan.id} 
                        onClick={() => { setSelectedResult(scan); }}
                        className="p-4 rounded-[1.5rem] bg-slate-900 border border-slate-800 hover:border-sky-500/30 hover:bg-slate-800/50 transition-all cursor-pointer group shadow-sm active:scale-[0.98] relative"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${scan.type === 'url' ? 'bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20' : 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20'}`}>
                            <i className={scan.type === 'url' ? 'fas fa-link text-lg' : 'fas fa-font text-lg'}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-slate-100 truncate">
                              {scan.name || (scan.data.length > 30 ? scan.data.substring(0, 30) + '...' : scan.data)}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                              {new Date(scan.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <button 
                            onClick={(e) => handleDeleteScan(scan.id, e)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 hover:text-red-400 hover:bg-red-400/10 transition-all"
                          >
                            <i className="far fa-trash-can text-sm"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-950/80 backdrop-blur-2xl border-t border-slate-800/50 px-10 py-5 flex justify-around items-center z-50">
        <button 
          onClick={() => handleTabChange('scanner')}
          className={`flex flex-col items-center gap-1.5 transition-all group ${activeTab === 'scanner' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl transition-all ${activeTab === 'scanner' ? 'bg-sky-400/10' : ''}`}>
            <i className={`fas fa-camera text-xl ${activeTab === 'scanner' ? 'scale-110' : ''}`}></i>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Scanner</span>
        </button>
        <button 
          onClick={() => handleTabChange('history')}
          className={`flex flex-col items-center gap-1.5 transition-all group ${activeTab === 'history' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl transition-all ${activeTab === 'history' ? 'bg-sky-400/10' : ''}`}>
            <div className="relative">
              <i className={`fas fa-clock-rotate-left text-xl ${activeTab === 'history' ? 'scale-110' : ''}`}></i>
              {scans.length > 0 && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-sky-500 rounded-full border-2 border-slate-950"></div>}
            </div>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.2em]">History</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
