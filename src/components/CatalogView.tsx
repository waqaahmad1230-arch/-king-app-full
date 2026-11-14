import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Scan,
  Camera,
  QrCode,
  X, 
  Check, 
  Sparkles, 
  Play, 
  Tag, 
  MessageCircle, 
  ExternalLink,
  ChevronRight,
  Package,
  Film,
  Image as ImageIcon,
  Loader2,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import kingLogo from '../assets/king-logo.png';
import { CatalogProduct } from '../types/catalog';
import { subscribeCatalogProducts, generateWhatsAppOrderUrl, openWhatsAppOrder, markCatalogAsSeen } from '../services/catalogService';

interface CatalogViewProps {
  onBackToHome?: () => void;
  onOpenSecretAdminTrigger?: () => void;
}

export default function CatalogView({ onBackToHome, onOpenSecretAdminTrigger }: CatalogViewProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  // Smart Scanner Search Modal State
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchModalTab, setSearchModalTab] = useState<'text' | 'scan'>('text');
  const [isQrCameraOpen, setIsQrCameraOpen] = useState(false);
  const [qrCameraError, setQrCameraError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [scanStatusText, setScanStatusText] = useState<string | null>(null);

  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCatalogLogoClick = () => {
    const next = logoTapCount + 1;
    if (logoTapTimerRef.current) clearTimeout(logoTapTimerRef.current);
    if (next >= 5) {
      setLogoTapCount(0);
      if (onOpenSecretAdminTrigger) onOpenSecretAdminTrigger();
    } else {
      setLogoTapCount(next);
      logoTapTimerRef.current = setTimeout(() => {
        setLogoTapCount(0);
      }, 3000);
    }
  };

  const handleCatalogLogoTouchStart = () => {
    logoLongPressTimerRef.current = setTimeout(() => {
      if (onOpenSecretAdminTrigger) onOpenSecretAdminTrigger();
    }, 2000);
  };

  const handleCatalogLogoTouchEnd = () => {
    if (logoLongPressTimerRef.current) {
      clearTimeout(logoLongPressTimerRef.current);
    }
  };

  // Gallery Active Media State (Photo index vs Video index)
  const [activeMediaType, setActiveMediaType] = useState<'photo' | 'video'>('photo');
  const [activeMediaIndex, setActiveMediaIndex] = useState<number>(0);

  // Subscribe to real-time published products from Firestore
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeCatalogProducts(false, (list) => {
      setProducts(list);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Automatically mark catalog as seen 2 seconds after opening CatalogView
  useEffect(() => {
    const timer = setTimeout(() => {
      markCatalogAsSeen();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const stopQrCamera = async () => {
    if (html5QrRef.current) {
      try {
        if (html5QrRef.current.isScanning) {
          await html5QrRef.current.stop();
        }
      } catch {
        // Ignore stop errors
      }
      try {
        html5QrRef.current.clear();
      } catch {
        // Ignore clear errors
      }
      html5QrRef.current = null;
    }
    setIsQrCameraOpen(false);
  };

  const closeSearchModal = () => {
    void stopQrCamera();
    if (photoTimerRef.current) {
      clearTimeout(photoTimerRef.current);
      photoTimerRef.current = null;
    }
    setIsAnalyzingPhoto(false);
    setScanStatusText(null);
    setQrCameraError(null);
    setIsSearchModalOpen(false);
  };

  useEffect(() => {
    return () => {
      void stopQrCamera();
      if (photoTimerRef.current) {
        clearTimeout(photoTimerRef.current);
      }
      if (logoTapTimerRef.current) {
        clearTimeout(logoTapTimerRef.current);
      }
      if (logoLongPressTimerRef.current) {
        clearTimeout(logoLongPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  // Extract unique categories from products (excluding duplicates of 'All')
  const categories = Array.from(
    new Set([
      'All',
      ...products
        .map((p) => (p.category || '').trim())
        .filter((cat) => Boolean(cat) && cat.toLowerCase() !== 'all'),
    ])
  );

  const applyQrMatchAndClose = (decodedText: string) => {
    const raw = decodedText.trim();
    if (!raw) return;

    const lowerRaw = raw.toLowerCase();
    const matchedById = products.find(
      (p) => p.id.toLowerCase() === lowerRaw || lowerRaw.includes(p.id.toLowerCase())
    );
    const matchedByName = products.find(
      (p) =>
        p.name.toLowerCase().includes(lowerRaw) ||
        lowerRaw.includes(p.name.toLowerCase())
    );

    setSelectedCategory('All');
    if (matchedById) {
      setSearchQuery(matchedById.name);
    } else if (matchedByName) {
      setSearchQuery(matchedByName.name);
    } else {
      setSearchQuery(raw);
    }

    closeSearchModal();
  };

  const startQrCamera = async () => {
    await stopQrCamera();
    setQrCameraError(null);
    setIsQrCameraOpen(true);

    setTimeout(async () => {
      const targetEl = document.getElementById('catalog-qr-reader');
      if (!targetEl) {
        setQrCameraError('QR scanner container unavailable.');
        setIsQrCameraOpen(false);
        return;
      }

      try {
        const scanner = new Html5Qrcode('catalog-qr-reader');
        html5QrRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 210, height: 210 } },
          (decodedText) => {
            applyQrMatchAndClose(decodedText);
          },
          () => {
            // Ignore frame read errors
          }
        );
      } catch (err: any) {
        setQrCameraError(
          err?.message || 'Unable to access camera. Please allow camera permission or upload a photo.'
        );
        setIsQrCameraOpen(false);
      }
    }, 120);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    await stopQrCamera();
    setQrCameraError(null);

    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    const nextPreview = URL.createObjectURL(file);
    setPhotoPreviewUrl(nextPreview);
    setIsAnalyzingPhoto(true);
    setScanStatusText('Searching similar items...');

    // First try detecting a QR code inside the uploaded photo
    try {
      const fileScanner = new Html5Qrcode('catalog-qr-file-temp');
      const decoded = await fileScanner.scanFile(file, false);
      try {
        fileScanner.clear();
      } catch {
        // Ignore
      }
      if (decoded && decoded.trim()) {
        applyQrMatchAndClose(decoded);
        return;
      }
    } catch {
      // No QR in photo; proceed with image filename/category matching
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const tokens = baseName
      .toLowerCase()
      .split(/[\s_\-.+]+/)
      .filter(
        (token) =>
          token.length >= 3 &&
          !['img', 'dsc', 'pxl', 'vid', 'photo', 'image', 'screenshot', 'whatsapp', 'camera', 'pic'].includes(
            token
          ) &&
          !/^\d+$/.test(token)
      );

    const nonAllCategories = categories.filter((c) => c !== 'All');
    const matchedCategory = nonAllCategories.find((cat) =>
      tokens.some(
        (token) =>
          cat.toLowerCase().includes(token) || token.includes(cat.toLowerCase())
      )
    );

    const matchedToken = tokens.find((token) =>
      products.some(
        (p) =>
          p.name.toLowerCase().includes(token) ||
          p.description.toLowerCase().includes(token) ||
          p.category.toLowerCase().includes(token)
      )
    );

    if (photoTimerRef.current) clearTimeout(photoTimerRef.current);
    photoTimerRef.current = setTimeout(() => {
      if (matchedCategory) {
        setSelectedCategory(matchedCategory);
        setSearchQuery('');
      } else if (matchedToken) {
        setSelectedCategory('All');
        setSearchQuery(matchedToken);
      } else if (nonAllCategories.length > 0) {
        setSelectedCategory(nonAllCategories[0]);
        setSearchQuery('');
      } else {
        setSelectedCategory('All');
        setSearchQuery('');
      }
      closeSearchModal();
    }, 900);
  };

  // Filter products by search query and category
  const filteredProducts = products.filter(product => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      product.id.toLowerCase().includes(q) ||
      product.name.toLowerCase().includes(q) ||
      product.description.toLowerCase().includes(q) ||
      product.category.toLowerCase().includes(q);

    const matchesCategory =
      selectedCategory === 'All' ||
      (product.category || '').trim().toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  // When selecting a product, reset active media view to 1st photo
  const handleSelectProduct = (product: CatalogProduct) => {
    setSelectedProduct(product);
    setActiveMediaType('photo');
    setActiveMediaIndex(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToListing = () => {
    setSelectedProduct(null);
  };

  // Helper for pricing math
  const getSavingsInfo = (original: number, discount?: number) => {
    if (!discount || discount >= original) return null;
    const diff = original - discount;
    const percent = Math.round((diff / original) * 100);
    return { diff, percent };
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans">

      {/* STICKY TOP-0 CATALOG HEADER (Controlled internally by selectedProduct state) */}
      <header className="king-sticky-top-header sticky top-0 left-0 right-0 z-[100] bg-[#0A0A0A] h-[56px] flex items-center px-3 m-0 border-b border-amber-500/20 shadow-xl shadow-black/40">
        {selectedProduct ? (
          /* Product Details Header: Single "← Back to Catalog" button calling setSelectedProduct(null) */
          <div className="flex flex-row items-center justify-between w-full gap-2">
            <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleBackToListing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141414] border border-[#D4AF37]/50 text-[#D4AF37] hover:text-white hover:border-[#D4AF37] text-xs font-bold shrink-0 cursor-pointer active:scale-95 transition"
              >
                <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
                <span>Back to Catalog</span>
              </button>

              <div
                onClick={handleCatalogLogoClick}
                onTouchStart={handleCatalogLogoTouchStart}
                onTouchEnd={handleCatalogLogoTouchEnd}
                title="KING App"
                className="w-8 h-8 rounded-full bg-black border-2 border-[#D4AF37] overflow-hidden shadow-[0_0_12px_rgba(212,175,55,0.4)] flex items-center justify-center shrink-0 select-none cursor-pointer active:scale-95 transition"
              >
                <img src={kingLogo} alt="KING Logo" className="w-full h-full object-cover" />
              </div>

              <span className="text-xs font-bold text-[#D4AF37] uppercase truncate">
                KING SHOP
              </span>
            </div>

            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center gap-1 shrink-0">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Verified Shop
            </span>
          </div>
        ) : (
          /* Catalog List Header: Back arrow to Home + 32x32 golden logo + 2-line text + Verified Shop */
          <div className="flex flex-row items-center justify-between w-full gap-2">
            <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  aria-label="Back to Home"
                  className="p-1 rounded-lg text-amber-300 hover:text-white hover:bg-neutral-900 transition cursor-pointer shrink-0 flex items-center justify-center"
                >
                  <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
                </button>
              )}

              <div
                onClick={handleCatalogLogoClick}
                onTouchStart={handleCatalogLogoTouchStart}
                onTouchEnd={handleCatalogLogoTouchEnd}
                title="KING App (Tap 5 times for Secret Admin)"
                className="w-8 h-8 rounded-full bg-black border-2 border-[#D4AF37] overflow-hidden shadow-[0_0_12px_rgba(212,175,55,0.4)] flex items-center justify-center shrink-0 select-none cursor-pointer active:scale-95 transition"
              >
                <img src={kingLogo} alt="KING Logo" className="w-full h-full object-cover" />
              </div>

              <div className="min-w-0 flex-1 select-none">
                <h1 className="text-xs font-bold text-[#D4AF37] leading-tight uppercase truncate">
                  KING SHOP - YOUR TRUSTED MIXED ITEMS STORE
                </h1>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5 truncate">
                  Premium Mixed Collection - Fashion &amp; Lifestyle
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center gap-1 shrink-0">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Verified Shop
            </span>
          </div>
        )}
      </header>

      {/* MAIN CATALOG CONTAINER */}
      <div className={`flex-1 max-w-md mx-auto w-full px-3 space-y-4 ${selectedProduct ? 'py-3' : 'pt-0 pb-3'}`}>
        
        {/* PAGE 2: PRODUCT DETAILS VIEW */}
        {selectedProduct ? (
          <div className="space-y-3 animate-in fade-in duration-200">
            
            {/* Media Gallery (Hero Main Viewport + Thumbnails) */}
            <div className="bg-[#121212] border border-amber-500/30 rounded-3xl overflow-hidden shadow-2xl p-2 space-y-2">
              
              {/* Main Media Viewport */}
              <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
                {activeMediaType === 'photo' ? (
                  <img
                    src={selectedProduct.imageUrls[activeMediaIndex] || selectedProduct.imageUrls[0]}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={selectedProduct.videoUrls[activeMediaIndex]}
                    controls
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                )}

                {/* Badge Overlay */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-black/70 border border-amber-500/40 text-amber-300 backdrop-blur-md uppercase tracking-wider flex items-center gap-1">
                    {activeMediaType === 'photo' ? (
                      <>
                        <ImageIcon className="w-3 h-3 text-amber-400" />
                        Photo {activeMediaIndex + 1} of {selectedProduct.imageUrls.length}
                      </>
                    ) : (
                      <>
                        <Film className="w-3 h-3 text-cyan-400" />
                        Video {activeMediaIndex + 1} of {selectedProduct.videoUrls.length}
                      </>
                    )}
                  </span>
                </div>

                {/* Stock Badge Overlay */}
                <div className="absolute top-2.5 right-2.5">
                  {selectedProduct.stock > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/90 text-slate-950 shadow-md">
                      In Stock ({selectedProduct.stock})
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-500/90 text-white shadow-md">
                      Out of Stock
                    </span>
                  )}
                </div>
              </div>

              {/* Thumbnails Carousel (Photos & Videos) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
                
                {/* Photo Thumbnails */}
                {selectedProduct.imageUrls.map((url, idx) => {
                  const isSelected = activeMediaType === 'photo' && activeMediaIndex === idx;
                  return (
                    <button
                      key={`photo-thumb-${idx}`}
                      type="button"
                      onClick={() => {
                        setActiveMediaType('photo');
                        setActiveMediaIndex(idx);
                      }}
                      className={`relative w-14 h-14 shrink-0 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105 shadow-md shadow-amber-500/30' 
                          : 'border-slate-800 opacity-70 hover:opacity-100 hover:border-slate-600'
                      }`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-bold text-center text-amber-300 py-0.5">
                        Photo {idx + 1}
                      </span>
                    </button>
                  );
                })}

                {/* Video Thumbnails */}
                {selectedProduct.videoUrls.map((vUrl, idx) => {
                  const isSelected = activeMediaType === 'video' && activeMediaIndex === idx;
                  return (
                    <button
                      key={`video-thumb-${idx}`}
                      type="button"
                      onClick={() => {
                        setActiveMediaType('video');
                        setActiveMediaIndex(idx);
                      }}
                      className={`relative w-14 h-14 shrink-0 rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-slate-950 flex items-center justify-center ${
                        isSelected 
                          ? 'border-cyan-400 ring-2 ring-cyan-400/50 scale-105 shadow-md shadow-cyan-500/30' 
                          : 'border-slate-800 opacity-70 hover:opacity-100 hover:border-slate-600'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300">
                        <Play className="w-3 h-3 fill-cyan-400 ml-0.5" />
                      </div>
                      <span className="absolute bottom-0 inset-x-0 bg-cyan-950/90 border-t border-cyan-500/40 text-[9px] font-bold text-center text-cyan-300 py-0.5">
                        Video {idx + 1}
                      </span>
                    </button>
                  );
                })}

              </div>
            </div>

            {/* Product Information Box */}
            <div className="bg-[#121212] border border-neutral-800 rounded-3xl p-4 space-y-3 shadow-xl">
              
              {/* Category & Badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 uppercase tracking-wider">
                  {selectedProduct.category}
                </span>

                {getSavingsInfo(selectedProduct.originalPrice, selectedProduct.discountPrice) && (
                  <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-md uppercase tracking-wider">
                    {getSavingsInfo(selectedProduct.originalPrice, selectedProduct.discountPrice)?.percent}% OFF
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-base font-black text-white leading-tight">
                {selectedProduct.name}
              </h2>

              {/* Pricing Section */}
              <div className="p-3 rounded-2xl bg-[#060a14] border border-amber-500/30 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Price:</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500">
                      Rs. {(selectedProduct.discountPrice || selectedProduct.originalPrice).toLocaleString()}
                    </span>

                    {selectedProduct.discountPrice && selectedProduct.discountPrice < selectedProduct.originalPrice && (
                      <span className="text-xs font-bold text-slate-500 line-through">
                        Rs. {selectedProduct.originalPrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {getSavingsInfo(selectedProduct.originalPrice, selectedProduct.discountPrice) && (
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/30">
                      Save Rs. {getSavingsInfo(selectedProduct.originalPrice, selectedProduct.discountPrice)?.diff.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1 pt-1">
                <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-amber-400" />
                  Product Description:
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-[#060a14]/60 p-3 rounded-2xl border border-slate-800">
                  {selectedProduct.description || 'Premium quality product available exclusively at KING SHOP.'}
                </p>
              </div>

              {/* Direct WhatsApp Order Action */}
              <div className="pt-2 space-y-1.5">
                <a
                  href={generateWhatsAppOrderUrl(selectedProduct)}
                  onClick={(e) => {
                    e.preventDefault();
                    openWhatsAppOrder(selectedProduct);
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5 fill-white text-emerald-600 shrink-0" />
                  <span>Order via WhatsApp Now</span>
                </a>
                <p className="text-[10px] font-bold text-slate-400 text-center">
                  ⚡ Opens native WhatsApp app directly to chat with owner <span className="font-mono text-emerald-400">(923258448284)</span>
                </p>
              </div>

            </div>

          </div>
        ) : (
          /* PAGE 1: PRODUCT LISTING CATALOG VIEW */
          <div className="space-y-4 animate-in fade-in duration-200">
            
            {/* Sticky Category Filters Row + 42x42px Smart Search Icon Box right below 56px TopHeader */}
            <div className="sticky top-[56px] z-[90] -mx-3 px-3 py-2 mt-0 bg-[#0A0A0A]/95 backdrop-blur-md border-b border-neutral-900 space-y-2">
              <div className="flex items-center gap-2">
                {/* Category Pills */}
                <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                  {categories.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-2 rounded-xl text-xs font-black tracking-wide shrink-0 transition cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/30'
                            : 'bg-[#141414] text-slate-400 hover:text-white border border-neutral-800'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                {/* 42x42px Square Smart Search Button */}
                <button
                  type="button"
                  aria-label="Open Smart Scanner Search"
                  title="Search or Scan Product"
                  onClick={() => {
                    setSearchModalTab('text');
                    setIsSearchModalOpen(true);
                  }}
                  className="relative w-[42px] h-[42px] shrink-0 rounded-[10px] bg-[#0A0A0A] border border-[#D4AF37] text-[#D4AF37] hover:bg-neutral-900 active:scale-95 transition flex items-center justify-center shadow-md shadow-amber-500/10 cursor-pointer"
                >
                  <Search className="w-4 h-4" strokeWidth={2.4} />
                  {searchQuery.trim() && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-[#0A0A0A]" />
                  )}
                </button>
              </div>

              {/* Active Search Chip (shown only when a search filter is active) */}
              {searchQuery.trim() && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#141414] border border-[#D4AF37]/40 text-xs">
                  <span className="text-slate-300 truncate">
                    Search: <strong className="text-amber-300">{searchQuery}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Product Grid (Two-column on mobile) */}
            {isLoading ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Loading KING Catalog...
                </p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-12 px-4 text-center bg-[#121212] border border-neutral-800 rounded-3xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold mx-auto text-xl">
                  🛍️
                </div>
                <h3 className="text-sm font-black text-white">No Products Found</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {searchQuery || selectedCategory !== 'All' 
                    ? 'No items matched your search filter. Try clearing filters.' 
                    : 'The catalog is currently empty. Check back soon for new arrivals!'}
                </p>
                {(searchQuery || selectedCategory !== 'All') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All');
                    }}
                    className="text-xs font-bold px-4 py-2 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 transition cursor-pointer shadow-md"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => {
                  const savings = getSavingsInfo(product.originalPrice, product.discountPrice);
                  const displayPrice = product.discountPrice || product.originalPrice;
                  const primaryImage = product.imageUrls[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80';

                  return (
                    <div
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className="bg-[#121212] border border-neutral-800 hover:border-amber-500/50 rounded-2xl overflow-hidden shadow-lg hover:shadow-amber-500/10 flex flex-col justify-between cursor-pointer transition-all active:scale-[0.98] group"
                    >
                      {/* Image Preview Container */}
                      <div className="relative w-full aspect-square bg-slate-950 overflow-hidden">
                        <img
                          src={primaryImage}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        {/* Top Badges */}
                        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                          {savings ? (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-md">
                              {savings.percent}% OFF
                            </span>
                          ) : (
                            <span />
                          )}

                          {product.videoUrls.length > 0 && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-cyan-950/90 border border-cyan-400/50 text-cyan-300 flex items-center gap-0.5 shadow-md backdrop-blur-sm">
                              <Film className="w-2.5 h-2.5 text-cyan-400" />
                              Video
                            </span>
                          )}
                        </div>

                        {/* Category Tag */}
                        <div className="absolute bottom-1.5 left-1.5 pointer-events-none">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-slate-300 backdrop-blur-sm">
                            {product.category}
                          </span>
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2">
                        
                        {/* Title */}
                        <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors">
                          {product.name}
                        </h3>

                        {/* Pricing & Stock */}
                        <div className="space-y-1 pt-1 border-t border-slate-800/80">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-sm font-black text-amber-400">
                              Rs. {displayPrice.toLocaleString()}
                            </span>

                            {product.discountPrice && product.discountPrice < product.originalPrice && (
                              <span className="text-[10px] font-bold text-slate-500 line-through">
                                Rs. {product.originalPrice.toLocaleString()}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-0.5 text-[10px]">
                            {product.stock > 0 ? (
                              <span className="font-bold text-emerald-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                In Stock
                              </span>
                            ) : (
                              <span className="font-bold text-red-400">Out of Stock</span>
                            )}

                            <span className="font-black text-amber-400/90 group-hover:translate-x-0.5 transition-transform flex items-center">
                              Details →
                            </span>
                          </div>
                        </div>

                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

      </div>

      {/* Hidden temp container for photo QR file scanning */}
      <div id="catalog-qr-file-temp" className="hidden" />

      {/* SMART SCANNER SEARCH TOP DROPDOWN (Anchored right below header + category bar) */}
      {isSearchModalOpen && (
        <div
          onClick={closeSearchModal}
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed top-[112px] left-1/2 -translate-x-1/2 w-[95%] max-w-[430px] z-[115] bg-[#1A1A1A] border border-[#D4AF37] rounded-xl shadow-xl p-[12px] space-y-3 max-h-[calc(100vh-190px)] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[10px] bg-[#141414] border border-[#D4AF37] flex items-center justify-center text-[#D4AF37]">
                  <Scan className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Smart Product Search</h3>
                  <p className="text-[10px] text-slate-400">Search by text, QR code, or product photo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeSearchModal}
                aria-label="Close Search Modal"
                className="w-8 h-8 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2-Tab Switcher */}
            <div className="grid grid-cols-2 gap-1.5 bg-[#121212] p-1 rounded-2xl border border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  void stopQrCamera();
                  setQrCameraError(null);
                  setSearchModalTab('text');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  searchModalTab === 'text'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search by Text</span>
              </button>

              <button
                type="button"
                onClick={() => setSearchModalTab('scan')}
                className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  searchModalTab === 'scan'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Scan Product</span>
              </button>
            </div>

            {/* TAB 1: Search by Text */}
            {searchModalTab === 'text' && (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        closeSearchModal();
                      }
                    }}
                    placeholder="Search in KING SHOP..."
                    className="w-full bg-[#141414] border border-[#D4AF37]/50 focus:border-[#D4AF37] text-white text-xs rounded-2xl pl-9 pr-9 py-3 focus:outline-none transition shadow-inner"
                  />
                  <Search className="w-4 h-4 text-[#D4AF37] absolute left-3 top-3.5" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search text"
                      className="absolute right-3 top-3 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#D4AF37]">
                    {filteredProducts.length} matching {filteredProducts.length === 1 ? 'product' : 'products'}
                  </span>
                </div>

                {/* Instant Live Results Preview */}
                {searchQuery.trim() && filteredProducts.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1 border-t border-neutral-800">
                    {filteredProducts.slice(0, 5).map((item) => (
                      <button
                        key={`instant-${item.id}`}
                        type="button"
                        onClick={() => {
                          closeSearchModal();
                          handleSelectProduct(item);
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-[#141414] hover:bg-neutral-900 border border-neutral-800 hover:border-[#D4AF37]/50 text-left transition cursor-pointer"
                      >
                        <img
                          src={item.imageUrls[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&auto=format&fit=crop&q=60'}
                          alt={item.name}
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-neutral-800"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{item.name}</div>
                          <div className="text-[11px] font-black text-[#D4AF37]">
                            Rs. {(item.discountPrice || item.originalPrice).toLocaleString()}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Scan Product (QR Code + Photo Upload / Camera) */}
            {searchModalTab === 'scan' && (
              <div className="space-y-3">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => void startQrCamera()}
                    className="py-3 px-3 rounded-2xl bg-[#141414] hover:bg-neutral-900 border border-[#D4AF37]/60 text-white text-xs font-black flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                  >
                    <QrCode className="w-5 h-5 text-[#D4AF37]" />
                    <span>Scan QR Code</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="py-3 px-3 rounded-2xl bg-[#141414] hover:bg-neutral-900 border border-[#D4AF37]/60 text-white text-xs font-black flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                  >
                    <Camera className="w-5 h-5 text-[#D4AF37]" />
                    <span>Upload Photo / Camera</span>
                  </button>
                </div>

                {/* Live Camera QR Reader Viewport */}
                {isQrCameraOpen && (
                  <div className="space-y-2">
                    <div className="relative w-full aspect-square max-w-[260px] mx-auto rounded-2xl overflow-hidden border-2 border-[#D4AF37] bg-black">
                      <div id="catalog-qr-reader" className="w-full h-full" />
                    </div>
                    <button
                      type="button"
                      onClick={() => void stopQrCamera()}
                      className="w-full py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                    >
                      Stop Camera
                    </button>
                  </div>
                )}

                {qrCameraError && (
                  <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-[11px] text-red-300">
                    {qrCameraError}
                  </div>
                )}

                {/* Uploaded Photo Preview + Matching Status */}
                {photoPreviewUrl && (
                  <div className="p-3 rounded-2xl bg-[#121212] border border-[#D4AF37]/40 flex items-center gap-3">
                    <img
                      src={photoPreviewUrl}
                      alt="Uploaded product preview"
                      className="w-16 h-16 rounded-xl object-cover border border-neutral-700 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
                        {isAnalyzingPhoto && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                        <span className="truncate">{scanStatusText || 'Searching similar items...'}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Matching product &amp; category in KING SHOP
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
