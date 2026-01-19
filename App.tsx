
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ScanResult, AnalysisResponse } from './types';
import QRScanner from './components/QRScanner';
import { analyzeQRContent } from './services/geminiService';

const App: React.FC = () => {
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scanner' | 'history'>('scanner');
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleAnalyze = async (scanId: string) => {
    const scan = scans.find(s => s.id === scanId);
    if (!scan || scan.aiAnalysis) return;

    setScans(prev => prev.map(s => s.id === scanId ? { ...s, isAnalyzing: true } : s));
    
    const analysis = await analyzeQRContent(scan.data);
    
    setScans(prev => {
        const updated = prev.map(s => s.id === scanId ? { ...s, isAnalyzing: false, aiAnalysis: JSON.stringify(analysis) } : s);
        const updatedSelected = updated.find(s => s.id === scanId);
        if (updatedSelected) setSelectedResult(updatedSelected);
        return updated;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  // Filter scans based on search query
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
    const analysis: AnalysisResponse = JSON.parse(result.aiAnalysis);

    const safetyColor = analysis.safetyRating === 'Safe' ? 'text-green-400' : 
                        analysis.safetyRating === 'Warning' ? 'text-yellow-400' : 'text-red-400';

    return (
      <div className="mt-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-sky-400">AI Analysis</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded bg-slate-900 ${safetyColor}`}>
            {analysis.safetyRating}
          </span>
        </div>
        <p className="text-sm text-slate-300 mb-3">{analysis.summary}</p>
        <div className="flex flex-wrap gap-2">
          {analysis.actions.map((action, idx) => (
            <button
              key={idx}
              className="px-3 py-1 rounded-full bg-sky-600 hover:bg-sky-500 text-xs font-medium transition-colors"
              onClick={() => {
                if (action.toLowerCase().includes('open') && result.data.startsWith('http')) {
                  window.open(result.data, '_blank');
                } else {
                  copyToClipboard(result.data);
                }
              }}
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col bg-slate-900 text-slate-100 shadow-2xl relative border-x border-slate-800">
      {/* Header */}
      <header className="p-6 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <i className="fas fa-qrcode text-xl text-white"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Gemini Lens</h1>
            <p className="text-xs text-slate-400 font-medium">SMART QR READER</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pt-4 pb-24">
        {activeTab === 'scanner' ? (
          <div className="space-y-6">
            {!selectedResult || isScanning ? (
              <div className="animate-in fade-in duration-500">
                <QRScanner isActive={isScanning} onScan={handleScan} />
                <div className="mt-8 text-center space-y-2">
                  <h3 className="text-lg font-semibold">Ready to Scan</h3>
                  <p className="text-sm text-slate-400">Point your camera at a QR code to decode its contents instantly.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
                <div className="p-5 rounded-2xl bg-slate-800 border border-slate-700 shadow-xl">
                  <div className="flex justify-between items-start mb-4">
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
                            className="bg-slate-900 border border-sky-500/50 rounded px-2 py-1 text-sm w-full outline-none text-white focus:ring-1 focus:ring-sky-500"
                            placeholder="Enter record name..."
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
                          <h2 className="text-sm font-bold text-slate-100 truncate">
                            {selectedResult.name || 'Unnamed Record'}
                          </h2>
                          <i className="fas fa-pencil-alt text-[10px] text-slate-500 group-hover:text-sky-400 transition-colors"></i>
                        </div>
                      )}
                      <span className="text-[10px] font-bold uppercase text-slate-500 block mt-0.5">Scan Result</span>
                    </div>
                    <button 
                      onClick={() => { setIsScanning(true); setLastScanned(null); setSelectedResult(null); }}
                      className="text-sky-400 text-xs font-bold hover:underline whitespace-nowrap"
                    >
                      Scan Another
                    </button>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 break-all text-sm font-mono mb-4 text-sky-100">
                    {selectedResult.data}
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => copyToClipboard(selectedResult.data)}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
                    >
                      <i className="far fa-copy"></i> Copy
                    </button>
                    {selectedResult.type === 'url' && (
                      <button 
                        onClick={() => window.open(selectedResult.data, '_blank')}
                        className="flex-1 py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
                      >
                        <i className="fas fa-external-link-alt"></i> Open
                      </button>
                    )}
                  </div>

                  {!selectedResult.aiAnalysis && (
                    <button 
                      onClick={() => handleAnalyze(selectedResult.id)}
                      disabled={selectedResult.isAnalyzing}
                      className="w-full mt-3 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-sky-600/20"
                    >
                      {selectedResult.isAnalyzing ? (
                        <>
                          <i className="fas fa-circle-notch animate-spin"></i> Analyzing with AI...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-robot"></i> Analyze with Gemini AI
                        </>
                      )}
                    </button>
                  )}

                  {renderAnalysis(selectedResult)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col gap-4 px-2 mb-6">
              <h2 className="text-lg font-bold">Recent Scans</h2>
              
              {/* Search Bar */}
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
                <input
                  type="text"
                  placeholder="Search titles or content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-3 pl-11 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>
            </div>

            {scans.length === 0 ? (
              <div className="text-center py-20 opacity-50">
                <i className="fas fa-history text-4xl mb-4 text-slate-600"></i>
                <p>No history yet.</p>
              </div>
            ) : filteredScans.length === 0 ? (
              <div className="text-center py-20 opacity-50">
                <i className="fas fa-search text-4xl mb-4 text-slate-600"></i>
                <p>No matching results found.</p>
              </div>
            ) : (
              filteredScans.map((scan) => (
                <div 
                  key={scan.id} 
                  onClick={() => { setSelectedResult(scan); setActiveTab('scanner'); setIsScanning(false); }}
                  className="p-4 rounded-2xl bg-slate-800 border border-slate-700 hover:border-slate-500 transition-all cursor-pointer group mb-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${scan.type === 'url' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      <i className={scan.type === 'url' ? 'fas fa-link' : 'fas fa-font'}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100 truncate">
                        {scan.name || (scan.data.length > 30 ? scan.data.substring(0, 30) + '...' : scan.data)}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {scan.name ? scan.data : new Date(scan.timestamp).toLocaleString()}
                      </p>
                      {scan.name && (
                        <p className="text-[9px] text-slate-600 uppercase tracking-tighter mt-1">
                          {new Date(scan.timestamp).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <i className="fas fa-chevron-right text-slate-600 group-hover:text-slate-400 transition-colors"></i>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-800/80 backdrop-blur-xl border-t border-slate-700/50 px-8 py-4 flex justify-around items-center z-50">
        <button 
          onClick={() => { setActiveTab('scanner'); setSearchQuery(''); }}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'scanner' ? 'text-sky-400' : 'text-slate-500'}`}
        >
          <i className={`fas fa-camera text-xl ${activeTab === 'scanner' ? 'scale-110' : ''}`}></i>
          <span className="text-[10px] font-bold uppercase tracking-widest">Scanner</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'history' ? 'text-sky-400' : 'text-slate-500'}`}
        >
          <div className="relative">
            <i className={`fas fa-clock-rotate-left text-xl ${activeTab === 'history' ? 'scale-110' : ''}`}></i>
            {scans.length > 0 && <div className="absolute -top-1 -right-1 w-2 h-2 bg-sky-500 rounded-full"></div>}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
