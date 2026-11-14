import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  orderBy 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { CatalogProduct } from '../types/catalog';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';

export const DEFAULT_DEMO_PRODUCTS: CatalogProduct[] = [
  {
    id: 'demo-prod-1',
    name: 'KING Pro Wireless Cyber Gaming Headphones RGB 7.1 Surround',
    description: 'Ultimate ultra-low latency wireless gaming headset with 50mm neodymium drivers, active noise cancellation, detachable cardioid mic, and customizable RGB lighting. Engineered for esports pros.',
    originalPrice: 12500,
    discountPrice: 8999,
    stock: 18,
    category: 'Gaming',
    imageUrls: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80'
    ],
    videoUrls: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'demo-prod-2',
    name: 'KING Elite Mechanical Gaming Keyboard Hot-Swappable Switches',
    description: 'Compact 75% layout mechanical keyboard with custom mechanical switches, PBT double-shot keycaps, aluminum frame, per-key RGB backlighting, and bluetooth/2.4Ghz/wired triple connection modes.',
    originalPrice: 15999,
    discountPrice: 11499,
    stock: 12,
    category: 'Gaming',
    imageUrls: [
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800&auto=format&fit=crop&q=80'
    ],
    videoUrls: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'demo-prod-3',
    name: 'KING AirBuds Pro True Wireless TWS Earbuds Gaming Mode 40ms',
    description: 'Hyper-fast 40ms ultra-low latency gaming earbuds with deep bass 13mm drivers, IPX5 water resistance, dual HD microphones, and 30-hour playback charging case.',
    originalPrice: 6500,
    discountPrice: 4299,
    stock: 25,
    category: 'Audio',
    imageUrls: [
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=800&auto=format&fit=crop&q=80'
    ],
    videoUrls: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'demo-prod-4',
    name: 'KING CyberWatch GT AMOLED Ultra Fitness & Gaming Smartwatch',
    description: 'High-definition 1.43-inch AMOLED display, stainless steel bezel, Bluetooth HD phone calling, 100+ sports modes, 24/7 heart rate & SpO2 monitor with 14-day battery life.',
    originalPrice: 18000,
    discountPrice: 13999,
    stock: 8,
    category: 'Wearables',
    imageUrls: [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80'
    ],
    videoUrls: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const KING_SHOP_WHATSAPP_NUMBER = '923258448284';
export const KING_GOLDEN_LOGO_URL = 'https://res.cloudinary.com/xb0o3xwi/image/upload/king-golden-logo.png';

/**
 * Subscribe to real-time catalog products list from Firestore catalog_products collection
 */
export function subscribeCatalogProducts(
  includeInactive: boolean,
  callback: (products: CatalogProduct[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, 'catalog_products');
  // When includeInactive = false, query with where("isActive", "==", true) to satisfy Firestore security rules
  const targetQuery = includeInactive 
    ? query(colRef)
    : query(colRef, where('isActive', '==', true));

  return onSnapshot(
    targetQuery,
    (snapshot) => {
      const list: CatalogProduct[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const item: CatalogProduct = {
          id: docSnap.id,
          name: data.name || 'KING Product',
          description: data.description || '',
          originalPrice: Number(data.originalPrice) || 0,
          discountPrice: data.discountPrice !== undefined && data.discountPrice !== null ? Number(data.discountPrice) : undefined,
          stock: Number(data.stock) || 0,
          category: data.category || 'General',
          imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
          videoUrls: Array.isArray(data.videoUrls) ? data.videoUrls : [],
          isActive: data.isActive !== false,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString()
        };

        if (includeInactive || item.isActive) {
          list.push(item);
        }
      });

      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (list.length === 0 && !includeInactive) {
        callback(DEFAULT_DEMO_PRODUCTS);
      } else {
        callback(list);
      }
    },
    (err) => {
      console.warn('Notice: catalog_products snapshot notice:', err?.message || err);
      if (onError) onError(err);
      if (!includeInactive) {
        callback(DEFAULT_DEMO_PRODUCTS);
      }
    }
  );
}

export const CATALOG_LAST_SEEN_KEY = 'king_catalog_last_seen';
export const CATALOG_SEEN_EVENT = 'king-catalog-seen';

export function getCatalogLastSeenAt(): string {
  if (typeof window === 'undefined') return '1970-01-01T00:00:00.000Z';
  try {
    return window.localStorage.getItem(CATALOG_LAST_SEEN_KEY) || '1970-01-01T00:00:00.000Z';
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

export function markCatalogAsSeen(timestamp: string = new Date().toISOString()): string {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CATALOG_LAST_SEEN_KEY, timestamp);
      window.dispatchEvent(new CustomEvent(CATALOG_SEEN_EVENT, { detail: { timestamp } }));
    } catch (err) {
      console.warn('Notice: failed to update catalog last seen timestamp:', err);
    }
  }
  return timestamp;
}

/**
 * Subscribe to count of active catalog_products added after lastSeenAtTimestamp
 */
export function subscribeNewCatalogProductCount(
  lastSeenAtTimestamp: string,
  callback: (count: number) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, 'catalog_products');
  const targetQuery = query(colRef, where('createdAt', '>', lastSeenAtTimestamp));

  return onSnapshot(
    targetQuery,
    (snapshot) => {
      let count = 0;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isActive !== false) {
          count += 1;
        }
      });
      callback(count);
    },
    (err) => {
      console.warn('Notice: catalog_products badge snapshot notice:', err?.message || err);
      if (onError) onError(err);
    }
  );
}

function getAdminUserEmail(): string | null {
  return auth.currentUser?.email || (globalThis as any).__TEST_ADMIN_EMAIL__ || null;
}

/**
 * Save new catalog product to Firestore catalog_products collection
 */
export async function createCatalogProduct(
  productData: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const adminEmail = getAdminUserEmail();
  if (!adminEmail || adminEmail !== 'waqaahmad1230@gmail.com') {
    const errorMsg = 'Super Admin authentication required (waqaahmad1230@gmail.com). Please sign in first.';
    console.error('Catalog Error:', errorMsg);
    handleFirestoreError(new Error(errorMsg), OperationType.WRITE, 'catalog_products');
  }

  const now = new Date().toISOString();
  const payload: Record<string, any> = {
    name: productData.name.trim(),
    description: (productData.description || '').trim(),
    originalPrice: Number(productData.originalPrice),
    stock: Number(productData.stock),
    category: (productData.category || 'General').trim(),
    imageUrls: Array.isArray(productData.imageUrls) ? productData.imageUrls.slice(0, 4) : [],
    videoUrls: Array.isArray(productData.videoUrls) ? productData.videoUrls.slice(0, 4) : [],
    isActive: Boolean(productData.isActive),
    createdAt: now,
    updatedAt: now
  };

  if (productData.discountPrice !== undefined && productData.discountPrice !== null && !isNaN(Number(productData.discountPrice))) {
    payload.discountPrice = Number(productData.discountPrice);
  }

  // Immediately mark seen on the admin's own device so the admin does not get a badge for their own upload
  let prevLastSeen: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      prevLastSeen = window.localStorage.getItem(CATALOG_LAST_SEEN_KEY);
    } catch {
      prevLastSeen = null;
    }
    markCatalogAsSeen(now);
  }

  try {
    const docRef = await addDoc(collection(db, 'catalog_products'), payload);
    return docRef.id;
  } catch (error) {
    if (typeof window !== 'undefined') {
      try {
        if (prevLastSeen !== null) {
          markCatalogAsSeen(prevLastSeen);
        } else {
          window.localStorage.removeItem(CATALOG_LAST_SEEN_KEY);
          window.dispatchEvent(
            new CustomEvent(CATALOG_SEEN_EVENT, { detail: { timestamp: '1970-01-01T00:00:00.000Z' } })
          );
        }
      } catch {
        // Ignore storage restore errors
      }
    }
    handleFirestoreError(error, OperationType.WRITE, 'catalog_products');
  }
}

/**
 * Update an existing catalog product document in Firestore
 */
export async function updateCatalogProduct(
  productId: string,
  productData: Partial<CatalogProduct>
): Promise<void> {
  const adminEmail = getAdminUserEmail();
  if (!adminEmail || adminEmail !== 'waqaahmad1230@gmail.com') {
    const errorMsg = 'Super Admin authentication required (waqaahmad1230@gmail.com). Please sign in first.';
    console.error('Catalog Error:', errorMsg);
    handleFirestoreError(new Error(errorMsg), OperationType.UPDATE, `catalog_products/${productId}`);
  }

  const docRef = doc(db, 'catalog_products', productId);
  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    ...productData,
    updatedAt: now
  };

  if (payload.originalPrice !== undefined) payload.originalPrice = Number(payload.originalPrice);
  if (payload.discountPrice !== undefined) {
    if (payload.discountPrice !== null && !isNaN(Number(payload.discountPrice))) {
      payload.discountPrice = Number(payload.discountPrice);
    } else {
      delete payload.discountPrice;
    }
  }
  if (payload.stock !== undefined) payload.stock = Number(payload.stock);

  delete payload.id;

  try {
    await updateDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `catalog_products/${productId}`);
  }
}

/**
 * Quick toggle active status (publish / unpublish)
 */
export async function toggleProductActive(productId: string, currentIsActive: boolean): Promise<void> {
  const adminEmail = getAdminUserEmail();
  if (!adminEmail || adminEmail !== 'waqaahmad1230@gmail.com') {
    const errorMsg = 'Super Admin authentication required (waqaahmad1230@gmail.com). Please sign in first.';
    handleFirestoreError(new Error(errorMsg), OperationType.UPDATE, `catalog_products/${productId}`);
  }

  const docRef = doc(db, 'catalog_products', productId);
  try {
    await updateDoc(docRef, {
      isActive: !currentIsActive,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `catalog_products/${productId}`);
  }
}

/**
 * Delete product document from Firestore
 */
export async function deleteCatalogProduct(productId: string): Promise<void> {
  const adminEmail = getAdminUserEmail();
  if (!adminEmail || adminEmail !== 'waqaahmad1230@gmail.com') {
    const errorMsg = 'Super Admin authentication required (waqaahmad1230@gmail.com). Please sign in first.';
    handleFirestoreError(new Error(errorMsg), OperationType.DELETE, `catalog_products/${productId}`);
  }

  const docRef = doc(db, 'catalog_products', productId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `catalog_products/${productId}`);
  }
}

function getProductImageUrl(product: CatalogProduct): string {
  const candidate = product as CatalogProduct & {
    imageUrl?: string;
    image?: string;
    thumbnail?: string;
  };
  return (
    candidate.imageUrl ||
    candidate.image ||
    candidate.thumbnail ||
    (Array.isArray(candidate.imageUrls) && candidate.imageUrls.length > 0
      ? candidate.imageUrls[0]
      : '') ||
    ''
  );
}

function buildWhatsAppOrderMessage(product: CatalogProduct): string {
  const effectivePrice =
    product.discountPrice && product.discountPrice > 0
      ? product.discountPrice
      : product.originalPrice;
  const price = effectivePrice.toLocaleString();
  const productImageUrl = getProductImageUrl(product);
  const cleanImgUrl = productImageUrl.split('?')[0];
  const shortImg = cleanImgUrl.split('/').pop() || '';
  const shortLink =
    cleanImgUrl.includes('res.cloudinary.com') && shortImg
      ? `https://res.cloudinary.com/xb0o3xwi/image/upload/${shortImg}`
      : productImageUrl;

  return `Hello KING SHOP! 👑
I want to order:

🛍️ Product: ${product.name}
💰 Price: Rs. ${price}
🏷️ Category: ${product.category}

🖼️ Image:
${shortLink}

👑 Official:
${KING_GOLDEN_LOGO_URL}

Please confirm!`;
}

/**
 * Helper to generate direct WhatsApp Order Link for a product
 */
export function generateWhatsAppOrderUrl(
  product: CatalogProduct, 
  customNumber?: string, 
  useAppIntent = false
): string {
  const phone = (customNumber || KING_SHOP_WHATSAPP_NUMBER).replace(/[^0-9]/g, '');
  const message = buildWhatsAppOrderMessage(product);
  const encoded = encodeURIComponent(message);

  if (useAppIntent) {
    return `whatsapp://send?phone=${phone}&text=${encoded}`;
  }

  return `https://wa.me/${phone}?text=${encoded}`;
}

/**
 * Smart WhatsApp Direct App Opener (Android deep-link intent with web fallback)
 */
export function openWhatsAppOrder(product: CatalogProduct, customNumber?: string): void {
  const phone = (customNumber || KING_SHOP_WHATSAPP_NUMBER).replace(/[^0-9]/g, '');
  const message = buildWhatsAppOrderMessage(product);
  const encoded = encodeURIComponent(message);

  const primaryIntent = `whatsapp://send?phone=${phone}&text=${encoded}`;
  const fallbackWeb = `https://wa.me/${phone}?text=${encoded}`;

  if (typeof window === 'undefined') return;

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    let appDidOpen = false;

    const onBlur = () => {
      appDidOpen = true;
    };

    window.addEventListener('blur', onBlur);

    // Primary Android / Mobile Intent: Opens installed native WhatsApp app directly
    window.location.href = primaryIntent;

    // Fallback after 1200ms if native app did not handle intent
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (!appDidOpen) {
        window.open(fallbackWeb, '_blank');
      }
    }, 1200);
  } else {
    // Desktop / non-mobile fallback
    window.open(fallbackWeb, '_blank');
  }
}
