
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ScanResult } from './types';
import QRScanner from './components/QRScanner';
import jsQR from 'jsqr';

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
  const [activeTab, setActiveTab] = useState<'upload' | 'scanner' | 'history'>('scanner');
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCameraActive = activeTab === 'scanner' && !selectedResult;

  useEffect(() => {
    localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(scans));
  }, [scans]);

  const handleTabChange = (tab: 'upload' | 'scanner' | 'history') => {
    setActiveTab(tab);
    setSelectedResult(null);
    if (tab !== 'history') {
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
    setActiveTab('history');
    setEditNameValue('');
    setIsEditingName(false);
  }, [lastScanned]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          if (code) {
            handleScan(code.data);
          } else {
            alert("No QR Code detected in this image. Please try another one.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'upload' ? (
          <div className="flex-1 flex flex-col justify-center px-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer aspect-square rounded-[3rem] p-1 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 hover:from-sky-500/50 hover:to-blue-600/50 shadow-2xl"
            >
              <div className="w-full h-full rounded-[2.8rem] bg-slate-900 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 group-hover:border-sky-500/30 overflow-hidden relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sky-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="w-24 h-24 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform duration-300">
                  <i className="fas fa-file-arrow-up text-3xl text-sky-400"></i>
                </div>
                
                <h3 className="text-lg font-bold text-slate-100 mb-2">Upload Image</h3>
                <p className="text-xs text-slate-500 font-medium tracking-wide text-center px-10">
                  Click or drag & drop a QR Code image here<br/>to decode
                </p>
                
                <div className="mt-8 px-6 py-2.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black uppercase tracking-[0.2em] group-hover:bg-sky-500 group-hover:text-white transition-colors duration-200">
                  Select File
                </div>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
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
                      
                      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/50 break-all text-sm font-mono mb-6 text-sky-200/80 shadow-inner leading-relaxed min-h-[120px]">
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
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden px-6 pt-6">
                <div className="shrink-0 mb-6">
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

                <div className="flex-1 scrollable-y pb-28">
                  {scans.length === 0 ? (
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
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="shrink-0 bg-slate-950/80 backdrop-blur-2xl border-t border-slate-800/50 px-4 py-6 flex justify-around items-center z-50">
        <button 
          onClick={() => handleTabChange('upload')}
          className={`flex flex-col items-center gap-1.5 transition-all group flex-1 ${activeTab === 'upload' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl transition-all ${activeTab === 'upload' ? 'bg-sky-400/10' : ''}`}>
            <i className={`fas fa-file-upload text-lg ${activeTab === 'upload' ? 'scale-110' : ''}`}></i>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.1em]">Upload</span>
        </button>
        
        <button 
          onClick={() => handleTabChange('scanner')}
          className={`flex flex-col items-center gap-1.5 transition-all group flex-1 ${activeTab === 'scanner' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl transition-all ${activeTab === 'scanner' ? 'bg-sky-400/10' : ''}`}>
            <i className={`fas fa-camera text-lg ${activeTab === 'scanner' ? 'scale-110' : ''}`}></i>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.1em]">Camera</span>
        </button>

        <button 
          onClick={() => handleTabChange('history')}
          className={`flex flex-col items-center gap-1.5 transition-all group flex-1 ${activeTab === 'history' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}
        >
          <div className={`w-12 h-8 flex items-center justify-center rounded-2xl transition-all ${activeTab === 'history' ? 'bg-sky-400/10' : ''}`}>
            <div className="relative">
              <i className={`fas fa-clock-rotate-left text-lg ${activeTab === 'history' ? 'scale-110' : ''}`}></i>
              {scans.length > 0 && <div className="absolute -top-1 -right-1 w-2 h-2 bg-sky-500 rounded-full border-2 border-slate-950"></div>}
            </div>
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.1em]">History</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
