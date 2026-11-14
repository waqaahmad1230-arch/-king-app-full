import { uploadFileToCloudinary, validateProductFile } from '../src/utils/cloudinaryUpload';
import { createCatalogProduct, subscribeCatalogProducts } from '../src/services/catalogService';
import { db, auth } from '../src/firebase';
import { collection, doc, getDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';

async function runMobileGalleryUploadTest() {
  console.log('========================================================');
  console.log('MOBILE GALLERY TEST: 3 PHOTOS + 2 VIDEOS CLOUDINARY & FIRESTORE');
  console.log('========================================================');

  // Simulate authenticated Super Admin session for test runner
  (globalThis as any).__TEST_ADMIN_EMAIL__ = 'waqaahmad1230@gmail.com';

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${description}`);
    }
  }

  try {
    // 1. Prepare 3 PNG photo buffers
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBuffer = Buffer.from(pngBase64, 'base64');

    const photoFile1 = new File([pngBuffer], 'mobile_photo_1.png', { type: 'image/png' });
    const photoFile2 = new File([pngBuffer], 'mobile_photo_2.png', { type: 'image/png' });
    const photoFile3 = new File([pngBuffer], 'mobile_photo_3.png', { type: 'image/png' });

    assert(validateProductFile(photoFile1, 'image').valid, 'Photo 1 passes validation');
    assert(validateProductFile(photoFile2, 'image').valid, 'Photo 2 passes validation');
    assert(validateProductFile(photoFile3, 'image').valid, 'Photo 3 passes validation');

    // 2. Upload 3 photos to Cloudinary
    console.log('\n--- Uploading 3 Photos to Cloudinary (xb0o3xwi / kingtube) ---');
    const photoUrl1 = await uploadFileToCloudinary(photoFile1, 'image', (pct, txt) => console.log(`  [Photo 1] ${pct}%: ${txt}`));
    const photoUrl2 = await uploadFileToCloudinary(photoFile2, 'image', (pct, txt) => console.log(`  [Photo 2] ${pct}%: ${txt}`));
    const photoUrl3 = await uploadFileToCloudinary(photoFile3, 'image', (pct, txt) => console.log(`  [Photo 3] ${pct}%: ${txt}`));

    assert(photoUrl1.startsWith('https://res.cloudinary.com/xb0o3xwi/image/upload/'), 'Photo 1 returned HTTPS Cloudinary URL');
    assert(photoUrl2.startsWith('https://res.cloudinary.com/xb0o3xwi/image/upload/'), 'Photo 2 returned HTTPS Cloudinary URL');
    assert(photoUrl3.startsWith('https://res.cloudinary.com/xb0o3xwi/image/upload/'), 'Photo 3 returned HTTPS Cloudinary URL');

    // 3. Prepare 2 MP4 video files
    let videoFile1: File;
    let videoFile2: File;

    if (fs.existsSync('sample_test.mp4')) {
      const vidBuffer = fs.readFileSync('sample_test.mp4');
      videoFile1 = new File([vidBuffer], 'mobile_video_1.mp4', { type: 'video/mp4' });
      videoFile2 = new File([vidBuffer], 'mobile_video_2.mp4', { type: 'video/mp4' });
    } else {
      const mp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAA1tZGF0AAAAGAG8...';
      videoFile1 = new File([Buffer.from(mp4Base64, 'base64')], 'mobile_video_1.mp4', { type: 'video/mp4' });
      videoFile2 = new File([Buffer.from(mp4Base64, 'base64')], 'mobile_video_2.mp4', { type: 'video/mp4' });
    }

    assert(validateProductFile(videoFile1, 'video').valid, 'Video 1 passes validation');
    assert(validateProductFile(videoFile2, 'video').valid, 'Video 2 passes validation');

    console.log('\n--- Uploading 2 Videos to Cloudinary (xb0o3xwi / kingtube) ---');
    const videoUrl1 = await uploadFileToCloudinary(videoFile1, 'video', (pct, txt) => console.log(`  [Video 1] ${pct}%: ${txt}`));
    const videoUrl2 = await uploadFileToCloudinary(videoFile2, 'video', (pct, txt) => console.log(`  [Video 2] ${pct}%: ${txt}`));

    assert(videoUrl1.startsWith('https://res.cloudinary.com/xb0o3xwi/video/upload/'), 'Video 1 returned HTTPS Cloudinary URL');
    assert(videoUrl2.startsWith('https://res.cloudinary.com/xb0o3xwi/video/upload/'), 'Video 2 returned HTTPS Cloudinary URL');

    // 4. Save Product to Firestore
    console.log('\n--- Saving Product with 3 Photos & 2 Videos to Firestore ---');
    const productData = {
      name: 'Mobile Gallery Test - KING Cyber Headset 5-Media Pack',
      description: 'E2E test product verifying 3 photo uploads and 2 video uploads stored in catalog_products.',
      originalPrice: 19999,
      discountPrice: 14999,
      stock: 15,
      category: 'Gaming',
      imageUrls: [photoUrl1, photoUrl2, photoUrl3],
      videoUrls: [videoUrl1, videoUrl2],
      isActive: true
    };

    const docId = await createCatalogProduct(productData);
    assert(Boolean(docId), `Product created in Firestore with document ID: ${docId}`);

    // 5. Read back document from Firestore and confirm all 5 HTTPS URLs exist
    const docSnap = await getDoc(doc(db, 'catalog_products', docId));
    assert(docSnap.exists(), 'Document exists in Firestore database king-5f52e');

    if (docSnap.exists()) {
      const data = docSnap.data();
      assert(Array.isArray(data.imageUrls) && data.imageUrls.length === 3, 'Firestore document contains exactly 3 imageUrls');
      assert(Array.isArray(data.videoUrls) && data.videoUrls.length === 2, 'Firestore document contains exactly 2 videoUrls');
      assert(data.imageUrls.every((u: string) => u.startsWith('https://res.cloudinary.com/')), 'All 3 imageUrls are valid Cloudinary HTTPS links');
      assert(data.videoUrls.every((u: string) => u.startsWith('https://res.cloudinary.com/')), 'All 2 videoUrls are valid Cloudinary HTTPS links');
      assert(data.name === productData.name, 'Product name verified');
      assert(data.originalPrice === 19999, 'Original price verified');
      assert(data.discountPrice === 14999, 'Discount price verified');
      assert(data.stock === 15, 'Stock quantity verified');
    }

    // Clean up test document
    await deleteDoc(doc(db, 'catalog_products', docId));
    console.log(`\nCleaned up test product ${docId}`);

  } catch (err: any) {
    console.error('Test execution error:', err);
    assert(false, `Execution failed: ${err.message}`);
  }

  console.log('\n========================================================');
  console.log(`MOBILE GALLERY TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('========================================================');
}

runMobileGalleryUploadTest();
