import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

// One shared prompt event for every component that offers installation, so the
// menu and the automatic banner never try to prompt twice with the same event.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = isStandalone();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    installed = false;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

export function usePwaInstall() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    installed = isStandalone();
    const listener = () => forceRender((value) => value + 1);
    listeners.add(listener);
    forceRender((value) => value + 1);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const event = deferredPrompt;
    if (!event) return 'unavailable';
    // A beforeinstallprompt event can only be used once.
    deferredPrompt = null;
    emit();

    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') {
        installed = true;
        emit();
      }
      return outcome;
    } catch {
      // The browser can refuse the prompt (already installed, no user gesture).
      return 'unavailable';
    }
  };

  return { canInstall: !!deferredPrompt && !installed, isInstalled: installed, promptInstall };
}
