
import React, { useRef, useEffect, useState } from 'react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (data: string) => void;
  isActive: boolean;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<{title: string; message: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  // Ref to hold the animation frame ID for the scanning loop
  const requestRef = useRef<number>();

  const startCamera = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // First try with environment facing mode
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
      } catch (e) {
        // Fallback to any available camera
        console.warn("Environment camera failed, falling back to any camera", e);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Important: catch play() errors which can happen if browser blocks auto-play
        try {
          await videoRef.current.play();
          setHasPermission(true);
        } catch (playError) {
          console.error("Video play error:", playError);
          setError({
            title: "Playback Blocked",
            message: "The browser blocked video playback. Please interact with the page and try again."
          });
        }
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError({
          title: "Camera Access Denied",
          message: "Please enable camera permissions in your browser settings to scan QR codes."
        });
        setHasPermission(false);
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError({
          title: "Camera Not Found",
          message: "We couldn't find a camera on this device."
        });
      } else {
        setError({
          title: "Camera Error",
          message: "An unexpected error occurred while accessing the camera."
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  };

  // The main scanning loop using requestAnimationFrame and jsQR
  const scan = () => {
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
          onScan(code.data);
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
    <div className="relative aspect-square overflow-hidden rounded-3xl bg-black border-4 border-slate-800 shadow-2xl">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <i className="fas fa-circle-notch animate-spin text-sky-400 text-3xl"></i>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 backdrop-blur-md">
          <i className="fas fa-exclamation-triangle text-amber-500 text-3xl mb-3"></i>
          <h4 className="font-bold text-white mb-1">{error.title}</h4>
          <p className="text-xs text-slate-400">{error.message}</p>
        </div>
      )}

      {/* Scanner Overlay UI */}
      {!error && !isLoading && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 border-[40px] border-black/40"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-sky-400/50 rounded-2xl">
             <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-sky-400 rounded-tl-lg"></div>
             <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-sky-400 rounded-tr-lg"></div>
             <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-sky-400 rounded-bl-lg"></div>
             <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-sky-400 rounded-br-lg"></div>
             
             {/* Scanning Animation Line */}
             <div className="absolute top-0 left-0 w-full h-0.5 bg-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.8)] animate-scan-move"></div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-move {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .animate-scan-move {
          animation: scan-move 2.5s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
};

// Fix for: Error in file App.tsx on line 4: Module '"file:///components/QRScanner"' has no default export.
export default QRScanner;
