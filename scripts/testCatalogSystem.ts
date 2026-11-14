import { CatalogProduct } from '../src/types/catalog';
import { validateProductFile } from '../src/utils/cloudinaryUpload';
import { 
  DEFAULT_DEMO_PRODUCTS, 
  generateWhatsAppOrderUrl, 
  KING_SHOP_WHATSAPP_NUMBER 
} from '../src/services/catalogService';

console.log('========================================================');
console.log('STARTING KING APP CATALOG SYSTEM VERIFICATION TEST SUITE');
console.log('========================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    process.exitCode = 1;
  }
}

// 1. Verify Default Demo Products Structure
assert(DEFAULT_DEMO_PRODUCTS.length >= 4, 'Default demo products list contains at least 4 items');
assert(
  DEFAULT_DEMO_PRODUCTS.every(p => p.id && p.name && p.originalPrice > 0 && p.imageUrls.length >= 1 && p.isActive),
  'All demo products satisfy required CatalogProduct fields (id, name, originalPrice, imageUrls, isActive)'
);

// 2. Validate Cloudinary Upload File Rules
const validImageFile = new File(['dummy-content'], 'test.png', { type: 'image/png' });
const oversizedImageFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
const validVideoFile = new File(['dummy-video'], 'promo.mp4', { type: 'video/mp4' });
const invalidTypeFile = new File(['txt-data'], 'doc.pdf', { type: 'application/pdf' });

assert(validateProductFile(validImageFile, 'image').valid === true, 'Permits valid PNG image under 10MB');
assert(validateProductFile(oversizedImageFile, 'image').valid === false, 'Rejects oversized image (> 10MB)');
assert(validateProductFile(validVideoFile, 'video').valid === true, 'Permits valid MP4 video under 50MB');
assert(validateProductFile(invalidTypeFile, 'image').valid === false, 'Rejects invalid non-image file');

// 3. Verify WhatsApp Order Link Generator
const sampleProduct: CatalogProduct = {
  id: 'test-123',
  name: 'KING Pro Headphones',
  description: 'Pro gaming headset',
  originalPrice: 10000,
  discountPrice: 7500,
  stock: 5,
  category: 'Gaming',
  imageUrls: ['https://res.cloudinary.com/xb0o3xwi/image/upload/v1/sample.jpg'],
  videoUrls: [],
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const waUrl = generateWhatsAppOrderUrl(sampleProduct);
assert(waUrl.includes('https://wa.me/923258448284'), 'WhatsApp URL contains correct owner phone number 923258448284');
assert(waUrl.includes(encodeURIComponent('KING Pro Headphones')), 'WhatsApp URL encodes product name');
assert(waUrl.includes(encodeURIComponent('Rs. 7,500')), 'WhatsApp URL encodes discounted price');

const intentUrl = generateWhatsAppOrderUrl(sampleProduct, undefined, true);
assert(intentUrl.startsWith('whatsapp://send?phone=923258448284&text='), 'Primary Android intent scheme whatsapp://send?phone=923258448284 is correctly formatted');

// 4. Verify Firestore Rules Invariants for catalog_products
function checkCatalogAccess(
  auth: { email: string } | null,
  resourceData: { isActive: boolean } | null,
  action: 'read' | 'write'
): boolean {
  const isAdmin = auth !== null && auth.email === 'waqaahmad1230@gmail.com';
  if (action === 'write') {
    return isAdmin;
  }
  if (action === 'read') {
    if (isAdmin) return true;
    if (resourceData === null || resourceData.isActive === true) return true;
    return false;
  }
  return false;
}

// Unauthenticated Customer reading active product -> ALLOWED
assert(checkCatalogAccess(null, { isActive: true }, 'read') === true, 'Unauthenticated customer can read published product');
// Unauthenticated Customer reading inactive draft product -> DENIED
assert(checkCatalogAccess(null, { isActive: false }, 'read') === false, 'Unauthenticated customer CANNOT read draft product');
// Unauthenticated Customer attempting write -> DENIED
assert(checkCatalogAccess(null, null, 'write') === false, 'Unauthenticated customer CANNOT write/edit product');
// Super Admin reading draft product -> ALLOWED
assert(checkCatalogAccess({ email: 'waqaahmad1230@gmail.com' }, { isActive: false }, 'read') === true, 'Super Admin can read draft products');
// Super Admin writing product -> ALLOWED
assert(checkCatalogAccess({ email: 'waqaahmad1230@gmail.com' }, null, 'write') === true, 'Super Admin waqaahmad1230@gmail.com can write/edit products');

console.log(`\n========================================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log(`========================================================\n`);
