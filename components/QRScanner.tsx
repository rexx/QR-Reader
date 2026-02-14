
import React, { useRef, useEffect, useState } from 'react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (data: string) => void;
  isActive: boolean;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [error, setError] = useState<{title: string; message: string; type: 'denied' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCapabilities, setZoomCapabilities] = useState<{min: number, max: number, step: number} | null>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);

  const isZoomSupported = !!(zoomCapabilities && zoomCapabilities.max > zoomCapabilities.min);

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
          
          // Small delay to ensure tracks are active before querying capabilities
          setTimeout(() => {
            if (!streamRef.current) return;
            const track = streamRef.current.getVideoTracks()[0];
            const capabilities = track.getCapabilities() as any;
            
            if (capabilities.torch) {
              setHasTorch(true);
            }
            
            if (capabilities.zoom) {
              setZoomCapabilities({
                min: capabilities.zoom.min || 1,
                max: capabilities.zoom.max || 1,
                step: capabilities.zoom.step || 0.1
              });
              setZoom(capabilities.zoom.min || 1);
            } else {
              setZoomCapabilities(null);
            }
          }, 500);
        };
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError({
          title: "Camera Permission Required",
          message: "Please allow camera access to start scanning. If blocked, check site settings.",
          type: 'denied'
        });
      } else {
        setError({
          title: "Camera Initialization Failed",
          message: "Unable to access the camera stream. Ensure no other application is using the camera.",
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
    setZoomCapabilities(null);
    setZoom(1);
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

  const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isZoomSupported) return;
    const val = parseFloat(e.target.value);
    setZoom(val);
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      await track.applyConstraints({
        advanced: [{ zoom: val }]
      } as any);
    } catch (e) {
      console.error("Failed to apply zoom", e);
    }
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
        if (code && code.data && code.data.trim() !== '') {
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
    <div className="flex flex-col gap-8 w-full">
      {/* Camera Preview Box */}
      <div className="relative aspect-square overflow-hidden rounded-[3rem] bg-slate-950 border-4 border-slate-800 shadow-2xl">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isActive && !isLoading && !error ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {isActive && !isLoading && !error && (
          <div className="absolute top-6 right-6 z-20">
            {hasTorch && (
              <button 
                onClick={toggleTorch}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isTorchOn ? 'bg-yellow-400 text-slate-900 shadow-[0_0_20px_rgba(250,204,21,0.5)]' : 'bg-black/50 text-white backdrop-blur-md border border-white/10 hover:bg-black/70'}`}
              >
                <i className="fas fa-bolt"></i>
              </button>
            )}
          </div>
        )}

        {!isActive && !isLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-md">
            <div className="w-20 h-20 rounded-full bg-slate-800/80 flex items-center justify-center mb-4 border border-slate-700">
              <i className="fas fa-video-slash text-slate-500 text-2xl"></i>
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Camera Offline</p>
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
              className="px-6 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full text-[10px] font-bold uppercase tracking-widest"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Zoom Controls Area - Always show, but gray out if not supported */}
      {isActive && !isLoading && !error && (
        <div className={`flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 transition-all ${!isZoomSupported ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
          <div className="px-4 py-1 rounded-full bg-slate-800/50 backdrop-blur-md border border-slate-700 text-[11px] font-black text-sky-400 tabular-nums shadow-lg">
            {isZoomSupported ? `${zoom.toFixed(1)}x` : '1.0x (Fixed)'}
          </div>
          <div className="w-full max-w-[280px] flex items-center gap-4 bg-slate-900/80 backdrop-blur-xl px-5 py-4 rounded-[2rem] border border-white/5 shadow-xl">
            <button 
              disabled={!isZoomSupported}
              onClick={() => {
                if (!zoomCapabilities) return;
                const newVal = Math.max(zoomCapabilities.min, zoom - (zoomCapabilities.step * 2));
                handleZoomChange({ target: { value: newVal.toString() } } as any);
              }}
              className="text-slate-500 hover:text-white transition-colors disabled:cursor-not-allowed"
            >
              <i className="fas fa-minus text-[10px]"></i>
            </button>
            <input 
              type="range" 
              disabled={!isZoomSupported}
              min={zoomCapabilities?.min || 1}
              max={zoomCapabilities?.max || 1}
              step={zoomCapabilities?.step || 0.1}
              value={zoom}
              onChange={handleZoomChange}
              className="flex-1 accent-sky-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed"
            />
            <button 
              disabled={!isZoomSupported}
              onClick={() => {
                if (!zoomCapabilities) return;
                const newVal = Math.min(zoomCapabilities.max, zoom + (zoomCapabilities.step * 2));
                handleZoomChange({ target: { value: newVal.toString() } } as any);
              }}
              className="text-slate-500 hover:text-white transition-colors disabled:cursor-not-allowed"
            >
              <i className="fas fa-plus text-[10px]"></i>
            </button>
          </div>
          {!isZoomSupported && (
            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Hardware Zoom Not Supported</p>
          )}
        </div>
      )}
    </div>
  );
};

export default QRScanner;
