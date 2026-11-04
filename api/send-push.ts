import { cert, getApps, initializeApp } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Fan-out endpoint for Chatly web push. The sender's Firebase ID token is
// verified with Identity Toolkit (firebase-admin/auth has ESM interop issues
// on Vercel), then FCM delivers data-only messages to closed tabs.

const DEFAULT_DATABASE_ID = 'ai-studio-4ecc03ab-aea4-4c13-b251-755ae912abd0';
const PUBLIC_WEB_API_KEY = 'AIzaSyCVGDfL7nb_jT365QDRUshdBTvQsydUBrE';

export const config = { maxDuration: 30 };

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

function firstJsonObject(text: string) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
}

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  const text =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 === '1'
      ? Buffer.from(raw, 'base64').toString('utf8')
      : raw;
  return JSON.parse(firstJsonObject(text)) as ServiceAccount;
}

function adminApp() {
  return getApps()[0] ?? initializeApp({ credential: cert(serviceAccount()) });
}

function database() {
  return getFirestore(adminApp(), process.env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID);
}

async function verifyIdToken(idToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${
        process.env.FIREBASE_WEB_API_KEY || PUBLIC_WEB_API_KEY
      }`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { users?: { localId?: string }[] };
    return data.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

interface DeliveryTarget {
  uid: string;
  tokens: string[];
}

async function tokensFor(db: Firestore, uid: string) {
  const snapshot = await db.collection('users').doc(uid).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as {
    fcmTokens?: string[];
    notificationsEnabled?: boolean;
  };
  if (data.notificationsEnabled === false) return null;
  const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens.filter(Boolean) : [];
  if (tokens.length === 0) return null;
  return tokens;
}

async function cleanupTokens(db: Firestore, uid: string, tokensToDrop: string[]) {
  if (tokensToDrop.length === 0) return;
  try {
    await db
      .collection('users')
      .doc(uid)
      .update({ fcmTokens: FieldValue.arrayRemove(...tokensToDrop) });
  } catch {
    // Token cleanup is best effort.
  }
}

async function sendToTargets(
  db: Firestore,
  targets: DeliveryTarget[],
  payload: { title: string; body: string; icon?: string; type: 'message' | 'call'; url: string; tag: string }
) {
  const messaging = getMessaging(adminApp());
  let sent = 0;

  await Promise.all(
    targets.map(async (target) => {
      if (target.tokens.length === 0) return;
      const response = await messaging.sendEachForMulticast({
        tokens: target.tokens,
        data: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon || '',
          type: payload.type,
          url: payload.url,
          tag: payload.tag,
        },
        webpush: {
          headers: {
            Urgency: payload.type === 'call' ? 'high' : 'normal',
            TTL: '86400',
          },
          fcmOptions: { link: payload.url },
        },
      });

      sent += response.successCount;
      const stale = response.responses
        .map((result, index) =>
          !result.success &&
          (result.error?.code === 'messaging/registration-token-not-registered' ||
            result.error?.code === 'messaging/invalid-registration-token')
            ? target.tokens[index]
            : null
        )
        .filter((token): token is string => Boolean(token));

      await cleanupTokens(db, target.uid, stale);
    })
  );

  return sent;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const idToken = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!idToken) {
    res.status(401).json({ error: 'missing token' });
    return;
  }

  try {
    const callerId = await verifyIdToken(idToken);
    if (!callerId) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }

    const body = (req.body || {}) as { conversationId?: string; callId?: string };
    const db = database();

    if (body.callId) {
      const callSnap = await db.collection('calls').doc(body.callId).get();
      if (!callSnap.exists) {
        res.status(404).json({ error: 'call not found' });
        return;
      }
      const call = callSnap.data() as {
        callerId?: string;
        callerName?: string;
        callerPhoto?: string;
        receiverId?: string;
        callType?: string;
      };
      if (call.callerId !== callerId || !call.receiverId) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const tokens = await tokensFor(db, call.receiverId);
      if (!tokens) {
        res.status(200).json({ sent: 0 });
        return;
      }

      const sent = await sendToTargets(
        db,
        [{ uid: call.receiverId, tokens }],
        {
          title: `Incoming ${call.callType === 'video' ? 'video' : 'voice'} call`,
          body: call.callerName || 'Someone is calling you',
          icon: call.callerPhoto,
          type: 'call',
          url: '/',
          tag: `call-${body.callId}`,
        }
      );
      res.status(200).json({ sent });
      return;
    }

    if (!body.conversationId) {
      res.status(400).json({ error: 'conversationId or callId required' });
      return;
    }

    const conversationSnap = await db.collection('conversations').doc(body.conversationId).get();
    if (!conversationSnap.exists) {
      res.status(404).json({ error: 'conversation not found' });
      return;
    }

    const conversation = conversationSnap.data() as {
      type?: string;
      participantIds?: string[];
      participantDetails?: Record<string, { displayName?: string; photoURL?: string }>;
      groupInfo?: { name?: string; photoURL?: string };
      mutedBy?: string[];
      lastMessage?: {
        text?: string;
        senderId?: string;
        senderName?: string;
        timestamp?: string;
      };
    };

    const participants = conversation.participantIds || [];
    if (!participants.includes(callerId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const last = conversation.lastMessage;
    if (!last?.timestamp) {
      res.status(200).json({ sent: 0 });
      return;
    }

    const senderName =
      last.senderName ||
      conversation.participantDetails?.[callerId]?.displayName ||
      'Someone';
    const senderPhoto = conversation.participantDetails?.[callerId]?.photoURL;
    const isGroup = conversation.type === 'group';

    const recipients = participants.filter((uid) => uid !== callerId);
    const mutedBy = conversation.mutedBy || [];

    const targets: DeliveryTarget[] = [];
    for (const uid of recipients) {
      if (mutedBy.includes(uid)) continue;
      const tokens = await tokensFor(db, uid);
      if (tokens) targets.push({ uid, tokens });
    }

    if (targets.length === 0) {
      res.status(200).json({ sent: 0 });
      return;
    }

    const sent = await sendToTargets(db, targets, {
      title: isGroup ? conversation.groupInfo?.name || 'Group' : senderName,
      body: isGroup ? `${senderName}: ${last.text || 'New message'}` : last.text || 'New message',
      icon: isGroup ? conversation.groupInfo?.photoURL : senderPhoto,
      type: 'message',
      url: `/?chat=${encodeURIComponent(body.conversationId)}`,
      tag: `chat-${body.conversationId}`,
    });

    res.status(200).json({ sent });
  } catch (error) {
    console.error('Push send failed:', error);
    res.status(500).json({ error: 'push failed' });
  }
}
