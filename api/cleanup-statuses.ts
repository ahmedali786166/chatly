import { cert, getApps, initializeApp } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Status media tokens expire 10 minutes after upload, so expired assets can
// only be removed with the Admin API. This endpoint runs from Vercel (cron and
// status-screen triggers) instead of Cloud Functions, which Spark forbids.

const DEFAULT_DATABASE_ID = 'ai-studio-4ecc03ab-aea4-4c13-b251-755ae912abd0';
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'ofewcx2t';
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CRON_SECRET = process.env.CRON_SECRET;

export const config = { maxDuration: 60 };

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  const json =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 === '1'
      ? Buffer.from(raw, 'base64').toString('utf8')
      : raw;
  return JSON.parse(json) as ServiceAccount;
}

function database() {
  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount()) });
  return getFirestore(app, process.env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID);
}

async function authorized(req: ApiRequest) {
  const header = req.headers.authorization;
  return Boolean(CRON_SECRET) && header === `Bearer ${CRON_SECRET}`;
}

async function deleteCloudinaryAsset(publicId: string, resourceType?: string) {
  if (!API_KEY || !API_SECRET) return false;
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
  const types =
    resourceType === 'image' || resourceType === 'video'
      ? [resourceType]
      : ['image', 'video'];

  for (const type of types) {
    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${type}/upload?public_ids=${encodeURIComponent(publicId)}`,
        { method: 'DELETE', headers: { Authorization: `Basic ${auth}` } }
      );
      if (!response.ok) continue;
      const data = (await response.json()) as { deleted?: Record<string, string> };
      if (data.deleted && Object.keys(data.deleted).length > 0) return true;
    } catch {
      // Try the next resource type, then move on to the next status.
    }
  }
  return false;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  if (!CRON_SECRET) {
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }
  if (!(await authorized(req))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const db = database();
    const now = Date.now();
    const iso = new Date(now).toISOString();

    const [byMillis, byIso] = await Promise.all([
      db.collection('statuses').where('expiresAtMs', '<=', now).get(),
      db.collection('statuses').where('expiresAt', '<=', iso).get(),
    ]);

    const expired = new Map<string, Record<string, unknown>>();
    [...byMillis.docs, ...byIso.docs].forEach((snapshot) => {
      expired.set(snapshot.id, snapshot.data() as Record<string, unknown>);
    });

    let mediaDeleted = 0;
    let mediaSkipped = 0;

    for (const [id, story] of expired) {
      const publicId = typeof story.publicId === 'string' ? story.publicId : '';
      const resourceType =
        typeof story.resourceType === 'string' ? story.resourceType : undefined;
      if (publicId) {
        const removed = await deleteCloudinaryAsset(publicId, resourceType);
        if (removed) mediaDeleted += 1;
        else mediaSkipped += 1;
      }
      try {
        await db.collection('statuses').doc(id).delete();
      } catch {
        // A concurrent client cleanup may have removed it already.
      }
    }

    res.status(200).json({
      expired: expired.size,
      mediaDeleted,
      mediaSkipped,
      mediaConfigured: Boolean(API_KEY && API_SECRET),
    });
  } catch (error) {
    console.error('Status cleanup failed:', error);
    res.status(500).json({ error: 'cleanup failed' });
  }
}
