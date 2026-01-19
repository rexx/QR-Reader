
import React, { useRef, useEffect, useState } from 'react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (data: string) => void;
  isActive: boolean;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [error, setError] = useState<{title: string; message: string; type: 'denied' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const requestRef = useRef<number | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);

  const checkPermissionStatus = async () => {
    try {
      if (navigator.permissions && (navigator.permissions as any).query) {
        const result = await navigator.permissions.query({ name: 'camera' as any });
        if (result.state === 'denied') {
          setError({
            title: "Camera Access Denied",
            message: "Please enable camera permissions in your browser settings to use the scanner.",
            type: 'denied'
          });
          return false;
        }
      }
    } catch (e) {
      console.warn("Permissions API not fully supported", e);
    }
    return true;
  };

  const startCamera = async () => {
    setIsLoading(true);
    setError(null);

    const isAllowed = await checkPermissionStatus();
    if (!isAllowed) {
      setIsLoading(false);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
          setIsLoading(false);
        };
        
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          setHasTorch(true);
        }
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError({
          title: "Permission Required",
          message: "Please click 'Allow' to start the scanner. If blocked, check your site settings.",
          type: 'denied'
        });
      } else {
        setError({
          title: "Camera Failed",
          message: "Could not access camera stream. Please ensure no other app is using it.",
          type: 'error'
        });
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (requestRef.current !== undefined) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }
    setIsTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const newTorchState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: newTorchState }]
      } as any);
      setIsTorchOn(newTorchState);
    } catch (e) {
      console.error("Failed to toggle torch", e);
    }
  };

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
            onScan(code.data);
          } else {
            alert("No QR Code detected in this image.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const scan = () => {
    if (!isActive) return;

    if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.height = videoRef.current.videoHeight;
        canvas.width = videoRef.current.videoWidth;
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code) {
          if (window.navigator.vibrate) window.navigator.vibrate(100);
          onScan(code.data);
          return;
        }
      }
    }
    requestRef.current = requestAnimationFrame(scan);
  };

  useEffect(() => {
    if (isActive) {
      startCamera();
      requestRef.current = requestAnimationFrame(scan);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isActive]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-3xl bg-slate-950 border-4 border-slate-800 shadow-2xl transition-all duration-500">
      <video
        ref={videoRef}
        className={`w-full h-full object-cover transition-opacity duration-700 ${isActive && !isLoading && !error ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />

      {isActive && !isLoading && !error && (
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
          {hasTorch && (
            <button 
              onClick={toggleTorch}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isTorchOn ? 'bg-yellow-400 text-slate-900 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-black/50 text-white backdrop-blur-md'}`}
            >
              <i className="fas fa-lightbulb"></i>
            </button>
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-full bg-black/50 text-white backdrop-blur-md flex items-center justify-center hover:bg-black/70 transition-all"
            title="Upload from Gallery"
          >
            <i className="fas fa-image"></i>
          </button>
        </div>
      )}

      {!isActive && !isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-md">
          <div className="w-20 h-20 rounded-full bg-slate-800/80 flex items-center justify-center mb-4 border border-slate-700">
            <i className="fas fa-video-slash text-slate-500 text-2xl"></i>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Camera Offline</p>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-[10px] font-bold uppercase tracking-widest text-slate-300 transition-all border border-slate-700"
          >
            Upload Image
          </button>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <i className="fas fa-circle-notch animate-spin text-sky-400 text-3xl mb-4"></i>
          <p className="text-[10px] font-bold text-sky-400/70 uppercase tracking-widest">Starting Camera...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 backdrop-blur-md z-10">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${error.type === 'denied' ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
             <i className={`fas ${error.type === 'denied' ? 'fa-lock' : 'fa-exclamation-triangle'} ${error.type === 'denied' ? 'text-amber-500' : 'text-red-500'} text-2xl`}></i>
          </div>
          <h4 className="font-bold text-white mb-2">{error.title}</h4>
          <p className="text-xs text-slate-400 leading-relaxed max-w-[220px] mb-6">{error.message}</p>
          <button 
            onClick={() => { setError(null); startCamera(); }}
            className="px-6 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {isActive && !error && !isLoading && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 border-[40px] border-black/30"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-52 h-52 border-2 border-sky-400/30 rounded-3xl">
             <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-sky-400 rounded-tl-xl"></div>
             <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-sky-400 rounded-tr-xl"></div>
             <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-sky-400 rounded-bl-xl"></div>
             <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-sky-400 rounded-br-xl"></div>
             
             <div className="absolute top-0 left-0 w-full h-0.5 bg-sky-400/80 shadow-[0_0_15px_rgba(56,189,248,0.6)] animate-scan-move"></div>
          </div>
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
            <p className="text-[8px] font-bold text-sky-400 uppercase tracking-[0.2em] whitespace-nowrap">Live Scanning</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-move {
          0% { top: 0; opacity: 0.2; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0.2; }
        }
        .animate-scan-move {
          animation: scan-move 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default QRScanner;
