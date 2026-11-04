import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { useNotification } from '../context/NotificationContext';

const DISMISSED_AT_KEY = 'chatly-install-dismissed-at';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export function InstallPrompt() {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const { addToast } = useNotification();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!canInstall || isInstalled) return;
    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) || 0);
    if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const timer = window.setTimeout(() => setVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [canInstall, isInstalled]);

  useEffect(() => {
    if (isInstalled) setVisible(false);
  }, [isInstalled]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    setInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
        setVisible(false);
        addToast({
          type: 'success',
          title: 'Installing Chatly',
          message: 'Chatly will open like an app from your home screen.',
        });
      } else if (outcome === 'unavailable') {
        addToast({
          type: 'info',
          title: 'Install Chatly',
          message:
            'Open your browser menu and choose "Install app" or "Add to Home screen".',
        });
        dismiss();
      } else {
        dismiss();
      }
    } finally {
      setInstalling(false);
    }
  };

  if (!visible || !canInstall || isInstalled) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[75] mx-auto flex max-w-sm items-start gap-3 rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-panel)] p-4 shadow-2xl animate-scale-in sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0">
      <img
        src="/icons/icon-192.png"
        alt=""
        className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--wa-text)]">Install Chatly</h3>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--wa-text-2)]">
              Add Chatly to your home screen for instant access and notifications.
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
            onClick={install}
            disabled={installing}
            className="flex items-center gap-1.5 rounded-full bg-[#00a884] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[#008069] disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {installing ? 'Opening…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
}
