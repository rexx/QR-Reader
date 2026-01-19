
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ScanResult, AnalysisResponse } from './types';
import QRScanner from './components/QRScanner';
import { analyzeQRContent } from './services/geminiService';

const SCAN_HISTORY_KEY = 'gemini_lens_history';
const PREFS_KEY = 'gemini_lens_prefs';

const App: React.FC = () => {
  const [scans, setScans] = useState<ScanResult[]>(() => {
    try {
      const saved = localStorage.getItem(SCAN_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isScanning, setIsScanning] = useState(() => {
    try {
      const prefs = localStorage.getItem(PREFS_KEY);
      return prefs ? JSON.parse(prefs).isScanning : true;
    } catch (e) {
      return true;
    }
  });

  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scanner' | 'history'>('scanner');
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(scans));
  }, [scans]);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ isScanning }));
  }, [isScanning]);

  const handleTabChange = (tab: 'scanner' | 'history') => {
    setActiveTab(tab);
    if (tab === 'history') {
      setIsScanning(false);
      setSearchQuery('');
    } else if (!selectedResult) {
      const prefs = localStorage.getItem(PREFS_KEY);
      const shouldScan = prefs ? JSON.parse(prefs).isScanning : true;
      setIsScanning(shouldScan);
    }
  };

  const handleScan = useCallback((data: string) => {
    if (data === lastScanned) return;
    setLastScanned(data);
    setIsScanning(false);

    const newScan: ScanResult = {
      id: Math.random().toString(36).substring(7),
      data,
      timestamp: Date.now(),
      type: data.startsWith('http') ? 'url' : 'text',
      isAnalyzing: false,
    };

    setScans(prev => [newScan, ...prev]);
    setSelectedResult(newScan);
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
        setIsScanning(true);
      }
    }
  };

  const handleAnalyze = async (scanId: string) => {
    const scan = scans.find(s => s.id === scanId);
    if (!scan || scan.aiAnalysis) return;

    setScans(prev => prev.map(s => s.id === scanId ? { ...s, isAnalyzing: true } : s));
    const analysis = await analyzeQRContent(scan.data);
    
    setScans(prev => {
        const updated = prev.map(s => s.id === scanId ? { ...s, isAnalyzing: false, aiAnalysis: analysis ? JSON.stringify(analysis) : undefined } : s);
        const updatedSelected = updated.find(s => s.id === scanId);
        if (updatedSelected) setSelectedResult(updatedSelected);
        return updated;
    });
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

  const renderAnalysis = (result: ScanResult) => {
    if (!result.aiAnalysis) return null;
    
    try {
      const analysis: AnalysisResponse = JSON.parse(result.aiAnalysis);
      if (!analysis) return null;

      const safetyColor = analysis.safetyRating === 'Safe' ? 'text-green-400' : 
                          analysis.safetyRating === 'Warning' ? 'text-yellow-400' : 'text-red-400';

      return (
        <div className="mt-4 p-4 rounded-xl bg-slate-900/60 border border-slate-700/50 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded">AI Analysis</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 ${safetyColor} border border-white/5`}>
              Safety: {analysis.safetyRating}
            </span>
          </div>
          <p className="text-sm text-slate-300 mb-4 leading-relaxed font-medium">{analysis.summary}</p>
          <div className="flex flex-wrap gap-2">
            {analysis.actions.map((action, idx) => (
              <button
                key={idx}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-sky-600/10 active:scale-95"
                onClick={() => {
                  if (action.toLowerCase().includes('open') && result.data.startsWith('http')) {
                    window.open(result.data, '_blank');
                  } else {
                    copyToClipboard(result.data);
                  }
                }}
              >
                {action.toLowerCase().includes('open') ? <i className="fas fa-external-link-alt text-[10px]"></i> : <i className="far fa-copy text-[10px]"></i>}
                {action}
              </button>
            ))}
          </div>
        </div>
      );
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-slate-950 text-slate-100 shadow-2xl relative border-x border-slate-800">
      <header className="p-6 pb-2 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <i className="fas fa-qrcode text-xl text-white"></i>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Gemini Lens</h1>
              <div className="flex items-center gap-1.5">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Smart QR Reader</p>
                {isScanning && activeTab === 'scanner' && (
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pt-6 pb-28">
        {activeTab === 'scanner' ? (
          <div className="space-y-8">
            {!selectedResult ? (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <QRScanner isActive={isScanning} onScan={handleScan} />
                <div className="mt-8 text-center space-y-6">
                  <div>
                    <h3 className="text-lg font-bold">{isScanning ? 'Scanning...' : 'Scanner Paused'}</h3>
                    <p className="text-xs text-slate-400 max-w-[280px] mx-auto mt-2 leading-relaxed">
                      {isScanning 
                        ? 'Point your camera at a QR code. Gemini AI will automatically analyze the content.' 
                        : 'The camera is currently off. Click the button below to restart it.'}
                    </p>
                  </div>
                  
                  <button 
                    onClick={() => setIsScanning(!isScanning)}
                    className={`py-3.5 px-8 rounded-2xl font-black text-sm transition-all flex items-center gap-3 mx-auto active:scale-95 ${
                      isScanning 
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700' 
                        : 'bg-sky-500 text-white hover:bg-sky-400 shadow-xl shadow-sky-500/30'
                    }`}
                  >
                    <i className={`fas ${isScanning ? 'fa-pause' : 'fa-video'}`}></i>
                    {isScanning ? 'Stop Camera' : 'Start Camera'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
                <div className="p-1 rounded-[2.5rem] bg-gradient-to-br from-sky-400/20 to-transparent">
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
                              placeholder="Enter name..."
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
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mt-1">Scan Result</span>
                      </div>
                      <button 
                        onClick={() => { setIsScanning(true); setLastScanned(null); setSelectedResult(null); }}
                        className="text-sky-400 text-[10px] font-black hover:bg-sky-400/20 transition-colors whitespace-nowrap bg-sky-400/10 px-3 py-1.5 rounded-full uppercase tracking-widest border border-sky-400/20"
                      >
                        Rescan
                      </button>
                    </div>
                    
                    <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/50 break-all text-sm font-mono mb-6 text-sky-200/80 shadow-inner leading-relaxed">
                      {selectedResult.data}
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={() => copyToClipboard(selectedResult.data)}
                        className="flex-1 py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 text-xs font-bold border border-slate-700 active:scale-95"
                      >
                        <i className="far fa-copy text-sm"></i> Copy Content
                      </button>
                      {selectedResult.type === 'url' && (
                        <button 
                          onClick={() => window.open(selectedResult.data, '_blank')}
                          className="flex-1 py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 text-xs font-bold border border-slate-700 active:scale-95"
                        >
                          <i className="fas fa-external-link-alt text-sm"></i> Open Link
                        </button>
                      )}
                    </div>

                    {!selectedResult.aiAnalysis && (
                      <button 
                        onClick={() => handleAnalyze(selectedResult.id)}
                        disabled={selectedResult.isAnalyzing}
                        className="w-full mt-4 py-4 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm font-black shadow-xl shadow-sky-500/20 active:scale-[0.98]"
                      >
                        {selectedResult.isAnalyzing ? (
                          <>
                            <i className="fas fa-circle-notch animate-spin"></i> Analyzing with Gemini...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-robot"></i> Gemini AI Analysis
                          </>
                        )}
                      </button>
                    )}

                    {renderAnalysis(selectedResult)}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 mb-2">
              <h2 className="text-xl font-black">History</h2>
              
              <div className="relative group">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm group-focus-within:text-sky-400 transition-colors"></i>
                <input
                  type="text"
                  placeholder="Search titles or content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 pl-11 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/30 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300"
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>
            </div>

            {scans.length === 0 ? (
              <div className="text-center py-24 bg-slate-900/40 rounded-[2.5rem] border border-dashed border-slate-800">
                <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-6 border border-slate-800 shadow-xl">
                  <i className="fas fa-history text-3xl text-slate-700"></i>
                </div>
                <p className="text-sm font-bold text-slate-600 tracking-wide">No history found yet</p>
              </div>
            ) : filteredScans.length === 0 ? (
              <div className="text-center py-20 opacity-50">
                <i className="fas fa-search text-4xl mb-4 text-slate-700"></i>
                <p className="text-sm font-medium">No matches found</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredScans.map((scan) => (
                  <div 
                    key={scan.id} 
                    onClick={() => { setSelectedResult(scan); setActiveTab('scanner'); setIsScanning(false); }}
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
                          {new Date(scan.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {scan.aiAnalysis && <i className="fas fa-robot text-sky-400 text-[10px]"></i>}
                        <button 
                          onClick={(e) => handleDeleteScan(scan.id, e)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-700 hover:text-red-400 hover:bg-red-400/10 transition-all"
                        >
                          <i className="far fa-trash-can text-sm"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
