import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  enablePushNotifications,
  pushConfigured,
  pushSupported,
  registerPushToken,
} from '../services/push';

const DISMISSED_AT_KEY = 'chatly-notifications-dismissed-at';
const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;

export function NotificationPrompt() {
  const { user } = useAuth();
  const { addToast } = useNotification();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  // Silently refresh the FCM token when permission was already granted.
  useEffect(() => {
    if (!user || !pushConfigured || !pushSupported()) return;
    if (Notification.permission === 'granted') {
      registerPushToken(user.uid).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user || !pushConfigured || !pushSupported()) return;
    if (Notification.permission !== 'default') return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) || 0);
    if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const timer = window.setTimeout(() => setVisible(true), 3000);
    return () => window.clearTimeout(timer);
  }, [user]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  };

  const enable = async () => {
    if (!user) return;
    setEnabling(true);
    try {
      const granted = await enablePushNotifications(user.uid);
      if (granted) {
        window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
        setVisible(false);
        addToast({
          type: 'success',
          title: 'Notifications on',
          message: 'You will get message and call alerts even when Chatly is closed.',
        });
      } else {
        dismiss();
        addToast({
          type: 'warning',
          title: 'Notifications blocked',
          message: 'Allow notifications for Chatly in your browser settings to receive alerts.',
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Could not enable notifications',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setEnabling(false);
    }
  };

  if (!visible || !user || !pushConfigured) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[76] mx-auto flex max-w-sm items-start gap-3 rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-panel)] p-4 shadow-2xl animate-scale-in sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#00a884]/10 text-[#00a884]">
        <Bell className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--wa-text)]">Turn on notifications</h3>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--wa-text-2)]">
              Get messages and calls even when Chatly is closed.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-3)] transition hover:bg-[var(--wa-hover)]"
            title="Not now"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={dismiss}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)]"
          >
            Not now
          </button>
          <button
            onClick={enable}
            disabled={enabling}
            className="flex items-center gap-1.5 rounded-full bg-[#00a884] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#008069] disabled:opacity-60"
          >
            <Bell className="h-3.5 w-3.5" />
            {enabling ? 'Enabling…' : 'Turn on'}
          </button>
        </div>
      </div>
    </div>
  );
}
