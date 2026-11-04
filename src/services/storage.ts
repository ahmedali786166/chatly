import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

export interface UploadProgressCallback {
  (progress: number): void;
}

const MAX_INLINE_BYTES = 700 * 1024;
const MAX_IMAGE_DIMENSION = 1600;

// Free Cloudinary tier for files too big to inline into Firestore.
// Setup: cloudinary.com free account → Settings → Upload → Upload presets →
// Add preset → Signing mode: "Unsigned" → save. Paste the cloud name and
// preset name below. Both are public-by-design client values (unsigned
// uploads are meant to be called from the browser), so committing them is safe.
const CLOUDINARY_CLOUD_NAME = 'ofewcx2t';
const CLOUDINARY_UPLOAD_PRESET = 'chatly';

const cloudinaryConfigured = () =>
  CLOUDINARY_CLOUD_NAME.length > 0 && CLOUDINARY_UPLOAD_PRESET.length > 0;

export interface UploadResult {
  url: string;
  publicId?: string;
  deleteToken?: string;
}

async function uploadToCloudinaryDetailed(
  file: Blob,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<UploadResult> {
  const filename = path.split('/').pop() || 'file';
  const publicId = path.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\-/]+/g, '_');
  const form = new FormData();
  form.append('file', file, filename);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('public_id', publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: form }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Cloudinary upload failed (${response.status}): ${detail.slice(0, 160)}`);
  }
  const data = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    delete_token?: string;
  };
  if (!data.secure_url) throw new Error('Cloudinary returned no URL');
  if (onProgress) onProgress(100);
  return {
    url: data.secure_url,
    publicId: data.public_id,
    deleteToken: data.delete_token,
  };
}

/**
 * Deletes an unsigned Cloudinary upload using the delete token returned at
 * upload time. The preset must have "Return delete token" enabled in the
 * Cloudinary console for the token to be issued. Returns false when the media
 * could not be removed (already gone, token missing, or token disabled).
 */
export async function deleteCloudinaryMedia(deleteToken?: string): Promise<boolean> {
  if (!deleteToken || !cloudinaryConfigured()) return false;
  try {
    const form = new FormData();
    form.append('token', deleteToken);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/delete_by_token`,
      { method: 'POST', body: form }
    );
    return response.ok;
  } catch (error) {
    console.warn('Cloudinary media cleanup failed:', error);
    return false;
  }
}

/**
 * Downscales large photos before upload so chat media stays fast on mobile
 * and still fits inside a Firestore document if Storage is unavailable.
 */
export async function compressImage(file: File | Blob, maxDimension = MAX_IMAGE_DIMENSION): Promise<Blob> {
  if (typeof document === 'undefined') return file;
  if (file.type && !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    if (scale >= 1 && file.size <= 400 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/webp', 0.82)
    );
    if (!blob) return file;
    return blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// If Storage is not provisioned the SDK keeps retrying CORS failures for a
// long time without ever rejecting, so cap the wait and fall back below.
const STORAGE_TIMEOUT_MS = 12000;

async function uploadToStorage(file: Blob, path: string, onProgress?: UploadProgressCallback) {
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, file);

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      uploadTask.cancel();
      reject(new Error('Storage request timed out'));
    }, STORAGE_TIMEOUT_MS);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) * 100;
        if (onProgress) onProgress(Math.min(99, Math.round(progress)));
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
      () => {
        window.clearTimeout(timer);
        resolve();
      }
    );
  });

  return getDownloadURL(uploadTask.snapshot.ref);
}

/**
 * Uploads media to Firebase Storage. If Storage is not provisioned or rules
 * reject the write, the file goes to Cloudinary when configured, otherwise
 * small files fall back to inline data URLs so sending never breaks; oversized
 * files surface a clear error instead of corrupting a Firestore document.
 */
export async function uploadFile(
  file: File | Blob,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  return (await uploadFileDetailed(file, path, onProgress)).url;
}

/**
 * Same upload chain as uploadFile but also reports the Cloudinary public id and
 * delete token so expiring media (status stories) can be removed later.
 */
export async function uploadFileDetailed(
  file: File | Blob,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<UploadResult> {
  const prepared = await compressImage(file);

  if (cloudinaryConfigured()) {
    try {
      return await uploadToCloudinaryDetailed(prepared, path, onProgress);
    } catch (error) {
      console.warn('Cloudinary upload failed, trying Firebase Storage:', error);
    }
  }

  try {
    const url = await uploadToStorage(prepared, path, onProgress);
    if (onProgress) onProgress(100);
    return { url };
  } catch (error) {
    console.warn('Firebase Storage upload unavailable, using inline media fallback:', error);
  }

  const dataUrl = await fileToDataUrl(prepared);
  if (dataUrl.length * 0.75 > MAX_INLINE_BYTES) {
    throw new Error(
      'This file is too large to send right now. Please choose a smaller photo or document.'
    );
  }
  if (onProgress) onProgress(100);
  return { url: dataUrl };
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
