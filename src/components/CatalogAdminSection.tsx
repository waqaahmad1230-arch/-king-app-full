import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  EyeOff, 
  Upload, 
  X, 
  Loader2, 
  Check, 
  AlertCircle, 
  Image as ImageIcon, 
  Film,
  Package
} from 'lucide-react';
import { CatalogProduct } from '../types/catalog';
import { 
  subscribeCatalogProducts, 
  createCatalogProduct, 
  updateCatalogProduct, 
  deleteCatalogProduct, 
  toggleProductActive 
} from '../services/catalogService';
import { uploadFileToCloudinary, uploadBatchFilesToCloudinary, validateProductFile } from '../utils/cloudinaryUpload';
import { useAuth } from '../context/AuthContext';

interface CatalogAdminSectionProps {
  showToast: (msg: string) => void;
}

export function CatalogAdminSection({ showToast }: CatalogAdminSectionProps) {
  const { user, loginWithGoogle } = useAuth();
  const isSuperAdminAuthed = user?.email === 'waqaahmad1230@gmail.com';

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form & Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Gaming');
  const [description, setDescription] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [stock, setStock] = useState('10');
  const [isActive, setIsActive] = useState(true);

  // Existing Uploaded Media URLs (when editing)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [existingVideoUrls, setExistingVideoUrls] = useState<string[]>([]);

  // Newly Selected Local Files from Gallery
  const [selectedPhotoFiles, setSelectedPhotoFiles] = useState<File[]>([]);
  const [selectedVideoFiles, setSelectedVideoFiles] = useState<File[]>([]);

  // Upload & Save Progress
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // Hidden File Inputs
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Real-time listener for ALL products (including inactive drafts)
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeCatalogProducts(true, (list) => {
      setProducts(list);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setEditingProductId(null);
    setName('');
    setCategory('Gaming');
    setDescription('');
    setOriginalPrice('');
    setDiscountPrice('');
    setStock('10');
    setIsActive(true);
    setExistingImageUrls([]);
    setExistingVideoUrls([]);
    setSelectedPhotoFiles([]);
    setSelectedVideoFiles([]);
    setIsSubmitting(false);
    setUploadProgress(0);
    setUploadStatusText('');
  };

  const handleOpenAddForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (product: CatalogProduct) => {
    resetForm();
    setEditingProductId(product.id);
    setName(product.name);
    setCategory(product.category);
    setDescription(product.description);
    setOriginalPrice(product.originalPrice.toString());
    setDiscountPrice(product.discountPrice ? product.discountPrice.toString() : '');
    setStock(product.stock.toString());
    setIsActive(product.isActive);
    setExistingImageUrls(product.imageUrls || []);
    setExistingVideoUrls(product.videoUrls || []);
    setIsFormOpen(true);
  };

  // Select Photos from Gallery
  const handlePhotoSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    // Check total photos (existing + newly selected) <= 4
    const currentTotal = existingImageUrls.length + selectedPhotoFiles.length;
    if (currentTotal + files.length > 4) {
      showToast('Maximum 4 photos allowed per product!');
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    for (const f of files) {
      const v = validateProductFile(f, 'image');
      if (!v.valid) {
        showToast(v.error || 'Invalid photo format');
        return;
      }
      validFiles.push(f);
    }

    setSelectedPhotoFiles(prev => [...prev, ...validFiles].slice(0, 4 - existingImageUrls.length));
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  // Select Videos from Gallery
  const handleVideoSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    const currentTotal = existingVideoUrls.length + selectedVideoFiles.length;
    if (currentTotal + files.length > 4) {
      showToast('Maximum 4 videos allowed per product!');
      return;
    }

    const validFiles: File[] = [];
    for (const f of files) {
      const v = validateProductFile(f, 'video');
      if (!v.valid) {
        showToast(v.error || 'Invalid video format');
        return;
      }
      validFiles.push(f);
    }

    setSelectedVideoFiles(prev => [...prev, ...validFiles].slice(0, 4 - existingVideoUrls.length));
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  // Remove existing photo URL
  const handleRemoveExistingImage = (index: number) => {
    setExistingImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Remove selected local photo file
  const handleRemoveSelectedPhoto = (index: number) => {
    setSelectedPhotoFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Remove existing video URL
  const handleRemoveExistingVideo = (index: number) => {
    setExistingVideoUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Remove selected local video file
  const handleRemoveSelectedVideo = (index: number) => {
    setSelectedVideoFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle Submit Form
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || user.email !== 'waqaahmad1230@gmail.com') {
      try {
        showToast('Firebase Auth required: Signing in as Super Admin...');
        await loginWithGoogle();
      } catch (authErr: any) {
        showToast('Super Admin Google sign-in required to publish products.');
        return;
      }
    }

    if (!name.trim()) {
      showToast('Please enter a product name!');
      return;
    }

    const origPriceNum = parseFloat(originalPrice);
    if (isNaN(origPriceNum) || origPriceNum <= 0) {
      showToast('Please enter a valid original price!');
      return;
    }

    const totalPhotos = existingImageUrls.length + selectedPhotoFiles.length;
    if (totalPhotos < 1) {
      showToast('Please select at least 1 product photo from gallery!');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(5);
    setUploadStatusText('Preparing media upload...');

    try {
      // Step 1: Upload photos incrementally
      const currentImages = [...existingImageUrls];
      const remainingPhotos = [...selectedPhotoFiles];
      const totalPhotosToUpload = remainingPhotos.length;

      for (let i = 0; i < totalPhotosToUpload; i++) {
        const file = remainingPhotos[0];
        const photoNum = i + 1;
        setUploadStatusText(`Uploading photo ${photoNum} of ${totalPhotosToUpload}: ${file.name}...`);

        const uploadedUrl = await uploadFileToCloudinary(file, 'image', (percent) => {
          const overall = 10 + Math.round(((i + percent / 100) / Math.max(1, totalPhotosToUpload)) * 40);
          setUploadProgress(overall);
          setUploadStatusText(`Uploading photo ${photoNum} of ${totalPhotosToUpload}: ${file.name} (${percent}%)`);
        });

        currentImages.push(uploadedUrl);
        setExistingImageUrls([...currentImages].slice(0, 4));
        setSelectedPhotoFiles(prev => prev.filter(f => f !== file));
        remainingPhotos.shift();
      }

      // Step 2: Upload videos incrementally
      const currentVideos = [...existingVideoUrls];
      const remainingVideos = [...selectedVideoFiles];
      const totalVideosToUpload = remainingVideos.length;

      for (let j = 0; j < totalVideosToUpload; j++) {
        const file = remainingVideos[0];
        const videoNum = j + 1;
        setUploadStatusText(`Uploading video ${videoNum} of ${totalVideosToUpload}: ${file.name}...`);

        const uploadedUrl = await uploadFileToCloudinary(file, 'video', (percent) => {
          const overall = 50 + Math.round(((j + percent / 100) / Math.max(1, totalVideosToUpload)) * 40);
          setUploadProgress(overall);
          setUploadStatusText(`Uploading video ${videoNum} of ${totalVideosToUpload}: ${file.name} (${percent}%)`);
        });

        currentVideos.push(uploadedUrl);
        setExistingVideoUrls([...currentVideos].slice(0, 4));
        setSelectedVideoFiles(prev => prev.filter(f => f !== file));
        remainingVideos.shift();
      }

      setUploadProgress(92);
      setUploadStatusText('Saving product document to Firestore database...');

      const discPriceNum = discountPrice ? parseFloat(discountPrice) : undefined;
      const stockNum = parseInt(stock, 10) || 0;

      const productPayload = {
        name: name.trim(),
        description: description.trim(),
        originalPrice: origPriceNum,
        discountPrice: discPriceNum && !isNaN(discPriceNum) ? discPriceNum : undefined,
        stock: stockNum,
        category: category.trim() || 'General',
        imageUrls: currentImages.slice(0, 4),
        videoUrls: currentVideos.slice(0, 4),
        isActive: Boolean(isActive)
      };

      if (editingProductId) {
        await updateCatalogProduct(editingProductId, productPayload);
        showToast('Product updated successfully! 🛍️');
      } else {
        await createCatalogProduct(productPayload);
        showToast('Product created and published to Catalog! 🛍️');
      }

      setIsFormOpen(false);
      resetForm();
    } catch (err: any) {
      console.error('Error saving catalog product:', err);
      showToast(`Error: ${err.message || 'Failed to save product'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Product
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${productName}" from the catalog?`)) return;

    try {
      await deleteCatalogProduct(productId);
      showToast(`Deleted "${productName}" 🗑️`);
    } catch (err: any) {
      console.error('Error deleting product:', err);
      showToast(`Delete failed: ${err.message}`);
    }
  };

  // Handle Quick Toggle Active
  const handleTogglePublish = async (productId: string, currentStatus: boolean, productName: string) => {
    try {
      await toggleProductActive(productId, currentStatus);
      showToast(`${currentStatus ? 'Unpublished' : 'Published'}: "${productName}"`);
    } catch (err: any) {
      console.error('Error toggling product active status:', err);
      showToast(`Status update failed: ${err.message}`);
    }
  };

  return (
    <div className="p-4 bg-[#070c17] border border-amber-500/30 rounded-2xl space-y-4">
      
      {/* Section Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
            🛍️
          </div>
          <div>
            <h3 className="text-xs font-black text-amber-300 uppercase tracking-wider">
              SECTION F: Catalog Products Manager
            </h3>
            <p className="text-[10px] text-slate-400">Manage KING Shop Inventory, Media & Pricing</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAddForm}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs flex items-center gap-1 hover:brightness-110 active:scale-95 transition shadow-md shadow-amber-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Firebase Auth Status Indicator for Super Admin */}
      <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
        isSuperAdminAuthed 
          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
          : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
      }`}>
        <div className="flex items-center gap-2">
          {isSuperAdminAuthed ? (
            <>
              <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
              <span>Firebase Auth: Signed in as Super Admin ({user?.email})</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Firebase Auth Needed for Writes (waqaahmad1230@gmail.com)</span>
            </>
          )}
        </div>

        {!isSuperAdminAuthed && (
          <button
            type="button"
            onClick={async () => {
              try {
                await loginWithGoogle();
              } catch (e: any) {
                showToast(`Auth notice: ${e?.message || 'Login closed'}`);
              }
            }}
            className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-[11px] hover:bg-amber-400 transition cursor-pointer shrink-0"
          >
            Sign in as Admin
          </button>
        )}
      </div>

      {/* Hidden File Inputs for Phone Gallery Selection */}
      <input
        type="file"
        ref={photoInputRef}
        accept="image/*"
        multiple
        onChange={handlePhotoSelection}
        className="hidden"
      />
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        multiple
        onChange={handleVideoSelection}
        className="hidden"
      />

      {/* ADD / EDIT PRODUCT MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md p-4 flex items-center justify-center overflow-y-auto">
          <div className="bg-[#091122] border border-amber-500/40 rounded-3xl p-5 max-w-lg w-full space-y-4 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            
            {/* Form Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                {editingProductId ? 'Edit Catalog Product' : 'Add New Product to Catalog'}
              </h4>

              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={isSubmitting}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Inputs */}
            <form onSubmit={handleSubmitProduct} className="space-y-3">
              
              {/* Product Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Product Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. KING Pro Cyber Gaming Headphones RGB"
                  className="w-full bg-[#050a14] border border-slate-700 focus:border-amber-400 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
                />
              </div>

              {/* Category & Stock */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Category *</label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Gaming, Audio, Wearables"
                    className="w-full bg-[#050a14] border border-slate-700 focus:border-amber-400 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Stock Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="e.g. 15"
                    className="w-full bg-[#050a14] border border-slate-700 focus:border-amber-400 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
              </div>

              {/* Pricing (Original & Discount) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Original Price (Rs.) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="e.g. 12500"
                    className="w-full bg-[#050a14] border border-slate-700 focus:border-amber-400 text-white text-xs rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-amber-300">Discount Price (Rs.)</label>
                  <input
                    type="number"
                    min="1"
                    value={discountPrice}
                    onChange={(e) => setDiscountPrice(e.target.value)}
                    placeholder="Optional e.g. 8999"
                    className="w-full bg-[#050a14] border border-amber-500/40 focus:border-amber-400 text-amber-300 font-bold text-xs rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter detailed product description..."
                  className="w-full bg-[#050a14] border border-slate-700 focus:border-amber-400 text-white text-xs rounded-xl px-3 py-2 focus:outline-none resize-none"
                />
              </div>

              {/* MEDIA PICKERS SECTION */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                
                {/* 1. PHOTO GALLERY PICKER (1-4 Photos) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                      Product Photos (Min 1, Max 4) *
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {existingImageUrls.length + selectedPhotoFiles.length} / 4
                    </span>
                  </div>

                  {/* Photo Thumbnails Preview Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {/* Existing Uploaded Photos */}
                    {existingImageUrls.map((url, idx) => (
                      <div key={`exist-img-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-amber-500/50 bg-slate-950">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingImage(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {/* Selected Local Photos */}
                    {selectedPhotoFiles.map((file, idx) => (
                      <div key={`select-img-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-cyan-500 bg-slate-950">
                        <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-cyan-950/90 text-[8px] font-bold text-center text-cyan-300 py-0.5">
                          NEW
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedPhoto(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {/* Add Photo Button */}
                    {existingImageUrls.length + selectedPhotoFiles.length < 4 && (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-amber-400 bg-slate-900/60 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-amber-300 transition cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-amber-400" />
                        <span className="text-[9px] font-bold">Select Photo</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. VIDEO GALLERY PICKER (0-4 Videos) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-cyan-300 flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-cyan-400" />
                      Product Videos (Optional, Max 4)
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {existingVideoUrls.length + selectedVideoFiles.length} / 4
                    </span>
                  </div>

                  {/* Video Thumbnails Preview Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {/* Existing Uploaded Videos */}
                    {existingVideoUrls.map((url, idx) => (
                      <div key={`exist-vid-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-cyan-500/50 bg-slate-950 flex items-center justify-center p-1">
                        <video src={url} className="w-full h-full object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingVideo(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {/* Selected Local Videos */}
                    {selectedVideoFiles.map((file, idx) => (
                      <div key={`select-vid-${idx}`} className="relative aspect-square rounded-xl overflow-hidden border border-cyan-400 bg-slate-950 flex flex-col items-center justify-center p-1 text-center">
                        <Film className="w-5 h-5 text-cyan-400" />
                        <span className="text-[8px] font-bold text-cyan-200 truncate max-w-full px-1">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedVideo(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {/* Add Video Button */}
                    {existingVideoUrls.length + selectedVideoFiles.length < 4 && (
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-cyan-400 bg-slate-900/60 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-cyan-300 transition cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-cyan-400" />
                        <span className="text-[9px] font-bold">Select Video</span>
                      </button>
                    )}
                  </div>
                </div>

              </div>

              {/* Published Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-400 cursor-pointer"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-bold text-slate-200 cursor-pointer">
                  Publish product immediately to Catalog
                </label>
              </div>

              {/* Upload Progress Indicator */}
              {isSubmitting && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      {uploadStatusText || 'Saving product...'}
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div 
                      className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs hover:brightness-110 active:scale-95 transition shadow-lg shadow-amber-500/30 cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading & Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{editingProductId ? 'Update Product' : 'Publish Product'}</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* PRODUCTS TABLE / LIST */}
      {isLoading ? (
        <div className="py-8 text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
          <p className="text-xs font-bold text-slate-400">Syncing catalog inventory...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="p-4 text-center bg-[#050a14] border border-slate-800 rounded-xl space-y-2">
          <p className="text-xs text-slate-400">No products created yet.</p>
          <button
            type="button"
            onClick={handleOpenAddForm}
            className="text-xs font-bold text-amber-400 underline hover:text-amber-300"
          >
            + Add First Product
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((product) => (
            <div
              key={product.id}
              className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                product.isActive 
                  ? 'bg-[#050a14] border-slate-800' 
                  : 'bg-slate-950/80 border-slate-800/50 opacity-75'
              }`}
            >
              {/* Product Thumbnail & Details */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0">
                  <img
                    src={product.imageUrls[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-white truncate">
                      {product.name}
                    </h4>
                    {!product.isActive && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Draft
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="text-amber-400 font-bold">
                      Rs. {(product.discountPrice || product.originalPrice).toLocaleString()}
                    </span>
                    <span>• Stock: {product.stock}</span>
                    <span>• {product.imageUrls.length} Photos, {product.videoUrls.length} Videos</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Publish/Unpublish Toggle */}
                <button
                  type="button"
                  onClick={() => handleTogglePublish(product.id, product.isActive, product.name)}
                  title={product.isActive ? 'Unpublish Product' : 'Publish Product'}
                  className={`p-1.5 rounded-xl border transition cursor-pointer ${
                    product.isActive 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {product.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => handleOpenEditForm(product)}
                  title="Edit Product"
                  className="p-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => handleDeleteProduct(product.id, product.name)}
                  title="Delete Product"
                  className="p-1.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-400 hover:bg-red-900/60 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
