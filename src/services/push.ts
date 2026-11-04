import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import app, { db } from '../firebase/config';

const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim();

export const pushConfigured = Boolean(VAPID_KEY);

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

async function activeServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.ready;
  }
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return navigator.serviceWorker.ready;
  return null;
}

/**
 * Registers this device for closed-app push. Safe to call on every login:
 * the token is deduplicated with arrayUnion.
 */
export async function registerPushToken(uid: string): Promise<string | null> {
  if (!VAPID_KEY || !pushSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const registration = await activeServiceWorker();
    if (!registration) return null;

    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return null;

    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
    return token;
  } catch (error) {
    console.warn('Push registration failed:', error);
    return null;
  }
}

/** Must be called from a user gesture so browsers allow the permission prompt. */
export async function enablePushNotifications(uid: string): Promise<boolean> {
  if (!VAPID_KEY) {
    throw new Error(
      'Push is not configured yet. Add VITE_FIREBASE_VAPID_KEY in your deployment settings.'
    );
  }
  if (!pushSupported()) {
    throw new Error('This browser does not support push notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  await registerPushToken(uid);
  return true;
}

/**
 * Fire-and-forget ping to the server so it can fan out FCM messages while the
 * sender has the app open. The server verifies the caller's Firebase ID token.
 */
export async function notifyRecipients(
  payload: { conversationId?: string; callId?: string },
  idToken: string
): Promise<void> {
  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    console.warn('Push request failed:', error);
  }
}
