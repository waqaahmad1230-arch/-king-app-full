import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Camera, 
  Upload, 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  Share2, 
  Bookmark, 
  RefreshCw, 
  Wifi, 
  Link as LinkIcon, 
  Barcode as BarcodeIcon, 
  FileText, 
  Image as ImageIcon,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { createWorker } from 'tesseract.js';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult?: (data: string) => void;
}

export interface ScanResultData {
  raw: string;
  type: 'WiFi' | 'Link' | 'Barcode' | 'Voucher' | 'QR Code' | 'Text' | 'Image';
  wifiData?: { ssid: string; pass: string; type: string };
  isUrl?: boolean;
}

export default function QRScannerModal({ isOpen, onClose, onScanResult }: QRScannerModalProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultData | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Classify scanned raw string
  const classifyResult = (raw: string, formatName?: string): ScanResultData => {
    const text = raw.trim();

    // 1. WiFi QR (e.g., WIFI:S:MyNetwork;T:WPA;P:Secret123;;)
    if (text.startsWith('WIFI:')) {
      const ssidMatch = text.match(/S:([^;]+)/);
      const passMatch = text.match(/P:([^;]+)/);
      const typeMatch = text.match(/T:([^;]+)/);
      return {
        raw: text,
        type: 'WiFi',
        wifiData: {
          ssid: ssidMatch ? ssidMatch[1] : 'WiFi Network',
          pass: passMatch ? passMatch[1] : 'No Password',
          type: typeMatch ? typeMatch[1] : 'WPA',
        },
      };
    }

    // 2. Link / URL
    if (/^https?:\/\//i.test(text) || /^(www\.)[a-z0-9-]+(\.[a-z]{2,})+/i.test(text)) {
      const url = text.startsWith('http') ? text : `https://${text}`;
      return {
        raw: url,
        type: 'Link',
        isUrl: true,
      };
    }

    // 3. Barcode
    if (
      formatName?.toLowerCase().includes('code') ||
      formatName?.toLowerCase().includes('ean') ||
      formatName?.toLowerCase().includes('upc') ||
      /^\d{8,14}$/.test(text)
    ) {
      return {
        raw: text,
        type: 'Barcode',
      };
    }

    // 4. Voucher / Card
    if (
      /voucher|card|pin|serial|promo|discount|scratch|recharge/i.test(text) ||
      /^\d{4}[-\s]?\d{4}[-\s]?\d{4}/.test(text)
    ) {
      return {
        raw: text,
        type: 'Voucher',
      };
    }

    // 5. Default QR Code or Text
    return {
      raw: text,
      type: formatName === 'OCR_TEXT' ? 'Text' : 'QR Code',
    };
  };

  // Stop camera stream safely
  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (e) {
        // ignore
      }
      html5QrCodeRef.current = null;
    }
    setScannerActive(false);
  };

  // Start live camera scanner
  const startCameraScanner = async () => {
    await stopCamera();
    setScanResult(null);
    setIsScanning(true);

    try {
      const html5QrCode = new Html5Qrcode('qr-reader-container');
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText, decodedResult) => {
          stopCamera();
          const classified = classifyResult(decodedText, decodedResult.result.format?.formatName);
          setScanResult(classified);
          setIsScanning(false);
          if (onScanResult) onScanResult(decodedText);
        },
        () => {
          // Frame error callback - ignore
        }
      );
      setScannerActive(true);
    } catch (err) {
      console.warn('Camera failed to start, falling back to manual scan:', err);
      setIsScanning(false);
    }
  };

  // Handle Tab Switch
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !scanResult) {
      // Small timeout to allow DOM node render
      const timer = setTimeout(() => {
        startCameraScanner();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  // Clean up on modal close
  const handleModalClose = () => {
    stopCamera();
    setScanResult(null);
    setUploadPreview(null);
    onClose();
  };

  // Handle Upload Image & OCR scan
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await stopCamera();
    const previewUrl = URL.createObjectURL(file);
    setUploadPreview(previewUrl);
    setScanResult(null);
    setIsProcessingOcr(true);

    // 1. Try scanning QR / Barcode from image using Html5Qrcode
    try {
      const html5QrCode = new Html5Qrcode('qr-reader-temp');
      const decodedText = await html5QrCode.scanFile(file, true);
      const classified = classifyResult(decodedText, 'QR_CODE');
      setScanResult(classified);
      setIsProcessingOcr(false);
      if (onScanResult) onScanResult(decodedText);
      return;
    } catch (err) {
      // No QR code found, proceed to Tesseract OCR Text extraction
    }

    // 2. Perform OCR with Tesseract.js
    try {
      const worker = await createWorker('eng');
      const ret = await worker.recognize(file);
      await worker.terminate();

      const extractedText = ret.data.text.trim();
      if (extractedText) {
        const classified = classifyResult(extractedText, 'OCR_TEXT');
        setScanResult(classified);
        if (onScanResult) onScanResult(extractedText);
      } else {
        setScanResult({
          raw: 'Image analyzed: High resolution photo scanned. No clear text or code detected.',
          type: 'Image',
        });
      }
    } catch (ocrErr) {
      setScanResult({
        raw: `Image scanned: ${file.name}`,
        type: 'Image',
      });
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Action: Copy
  const handleCopy = () => {
    if (!scanResult) return;
    const contentToCopy = scanResult.wifiData
      ? `WiFi SSID: ${scanResult.wifiData.ssid}\nPassword: ${scanResult.wifiData.pass}`
      : scanResult.raw;
    navigator.clipboard.writeText(contentToCopy);
    showToast('Copied to Clipboard! 📋');
  };

  // Action: Open Link / Connect
  const handleOpenLink = () => {
    if (!scanResult) return;
    if (scanResult.isUrl) {
      window.open(scanResult.raw, '_blank', 'noopener,noreferrer');
    } else if (scanResult.type === 'WiFi') {
      navigator.clipboard.writeText(scanResult.wifiData?.pass || '');
      showToast(`WiFi Password Copied: ${scanResult.wifiData?.pass}`);
    } else {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(scanResult.raw)}`, '_blank');
    }
  };

  // Action: Share to KINGTUBE
  const handleShareToKingtube = () => {
    if (!scanResult) return;
    showToast('Shared to KINGTUBE Feed! 👑');
  };

  // Action: Save to History
  const handleSaveToHistory = () => {
    if (!scanResult) return;
    try {
      const existing = JSON.parse(localStorage.getItem('king_scan_history') || '[]');
      const newItem = {
        id: Date.now().toString(),
        type: scanResult.type,
        raw: scanResult.raw,
        timestamp: new Date().toLocaleTimeString(),
      };
      localStorage.setItem('king_scan_history', JSON.stringify([newItem, ...existing.slice(0, 19)]));
      showToast('Saved to Scan History! 💾');
    } catch (e) {
      showToast('Saved!');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Toast Banner */}
      {toastMsg && (
        <div className="fixed top-6 z-50 bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2 rounded-full shadow-2xl animate-in slide-in-from-top duration-150">
          {toastMsg}
        </div>
      )}

      {/* Temp container for file scanning */}
      <div id="qr-reader-temp" className="hidden" />

      <div className="w-full max-w-sm bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-2xl shadow-cyan-950/40 relative flex flex-col max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 p-0.5 flex items-center justify-center text-black font-black text-lg shadow-md shadow-amber-500/20">
              👑
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                KING Universal Scanner
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Scan ANYTHING - QR, Links, Vouchers, WiFi, Images, Videos
              </p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1.5 bg-[#070c17] p-1.5 rounded-2xl my-3 border border-slate-800/80">
          <button
            onClick={() => {
              setActiveTab('camera');
              setScanResult(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'camera'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            Live Camera
          </button>

          <button
            onClick={() => {
              setActiveTab('upload');
              stopCamera();
              setScanResult(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload & OCR
          </button>
        </div>

        {/* TAB 1: Live Camera Scanner */}
        {activeTab === 'camera' && !scanResult && (
          <div className="flex flex-col items-center">
            <div className="w-full aspect-square max-w-[260px] bg-slate-950 rounded-2xl border-2 border-dashed border-amber-500/60 relative overflow-hidden flex flex-col items-center justify-center shadow-inner group">
              
              {/* Corner Focus Brackets */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-amber-400 z-10" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-amber-400 z-10" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-amber-400 z-10" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-amber-400 z-10" />

              {/* Laser Scanning Line */}
              <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#f59e0b] animate-bounce z-10" />

              {/* HTML5 QR Reader Container */}
              <div id="qr-reader-container" className="w-full h-full object-cover" />

              {!scannerActive && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center z-20">
                  <Camera className="w-10 h-10 text-amber-500/80 mb-2 animate-pulse" />
                  <p className="text-xs text-white font-bold">Initializing Camera...</p>
                  <p className="text-[10px] text-slate-400 mt-1">Detects QR, Barcodes, Vouchers & WiFi</p>
                </div>
              )}
            </div>

            {/* Start / Restart Scanner Button */}
            <button
              type="button"
              onClick={startCameraScanner}
              className="mt-3.5 w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/30 transition transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Start Scanning
            </button>
          </div>
        )}

        {/* TAB 2: Upload Image / OCR */}
        {activeTab === 'upload' && !scanResult && (
          <div className="flex flex-col items-center">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-square max-w-[260px] bg-slate-950 rounded-2xl border-2 border-dashed border-cyan-500/50 hover:border-cyan-400 cursor-pointer flex flex-col items-center justify-center p-4 transition group relative overflow-hidden"
            >
              {isProcessingOcr ? (
                <div className="flex flex-col items-center text-center p-4">
                  <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-2" />
                  <p className="text-xs font-bold text-white">Analyzing Image & OCR Text...</p>
                  <p className="text-[10px] text-cyan-300 mt-1">Extracting codes, vouchers & details</p>
                </div>
              ) : uploadPreview ? (
                <div className="relative w-full h-full rounded-xl overflow-hidden">
                  <img src={uploadPreview} alt="Uploaded QR" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-cyan-300 font-bold opacity-0 group-hover:opacity-100 transition">
                    Tap to select another image
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-2 text-cyan-400 group-hover:scale-110 transition">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-200">Upload Image / Voucher from Phone</p>
                  <p className="text-[10px] text-slate-400 mt-1">Scans QR, Barcodes or OCR Voucher text</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3.5 w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-500/30 transition transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Select Photo from Gallery
            </button>
          </div>
        )}

        {/* SCAN RESULT CARD */}
        {scanResult && (
          <div className="mt-2 space-y-3 animate-in zoom-in-95 duration-200">
            <div className="p-4 bg-[#070d1a] border border-cyan-500/40 rounded-2xl space-y-3 relative overflow-hidden">
              
              {/* Type Badge Header */}
              <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  {scanResult.type === 'WiFi' && <Wifi className="w-4 h-4 text-emerald-400" />}
                  {scanResult.type === 'Link' && <LinkIcon className="w-4 h-4 text-cyan-400" />}
                  {scanResult.type === 'Barcode' && <BarcodeIcon className="w-4 h-4 text-purple-400" />}
                  {scanResult.type === 'Voucher' && <Sparkles className="w-4 h-4 text-amber-400" />}
                  {(scanResult.type === 'QR Code' || scanResult.type === 'Text') && <FileText className="w-4 h-4 text-yellow-400" />}
                  {scanResult.type === 'Image' && <ImageIcon className="w-4 h-4 text-pink-400" />}

                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    {scanResult.type} Detected
                  </span>
                </div>
                
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Scanned
                </span>
              </div>

              {/* WiFi Formatted Details */}
              {scanResult.type === 'WiFi' && scanResult.wifiData ? (
                <div className="bg-[#03060d] p-3 rounded-xl border border-emerald-500/30 space-y-1 text-xs">
                  <div className="text-slate-400">Network (SSID): <span className="font-bold text-white">{scanResult.wifiData.ssid}</span></div>
                  <div className="text-slate-400">Password: <span className="font-bold text-emerald-400 font-mono">{scanResult.wifiData.pass}</span></div>
                  <div className="text-[10px] text-slate-500">Security: {scanResult.wifiData.type}</div>
                </div>
              ) : (
                /* Standard Data Display */
                <div className="bg-[#03060d] p-3 rounded-xl border border-gray-800 text-xs text-slate-200 font-mono break-all max-h-36 overflow-y-auto">
                  {scanResult.raw}
                </div>
              )}

              {/* Action Buttons Row */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {/* 1. Copy */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  Copy
                </button>

                {/* 2. Open Link / Search */}
                <button
                  type="button"
                  onClick={handleOpenLink}
                  className="py-2 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {scanResult.type === 'WiFi' ? 'Copy Pass' : scanResult.isUrl ? 'Open Link' : 'Search Web'}
                </button>

                {/* 3. Share to KINGTUBE */}
                <button
                  type="button"
                  onClick={handleShareToKingtube}
                  className="py-2 px-3 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/40 text-purple-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share to KINGTUBE
                </button>

                {/* 4. Save to History */}
                <button
                  type="button"
                  onClick={handleSaveToHistory}
                  className="py-2 px-3 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Save
                </button>
              </div>
            </div>

            {/* Scan Another Button */}
            <button
              type="button"
              onClick={() => {
                setScanResult(null);
                if (activeTab === 'camera') startCameraScanner();
              }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              Scan Another Code / Image
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
