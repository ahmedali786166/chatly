import React, { createContext, useContext, useState, useEffect } from 'react';
import { sounds } from '../services/sound';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  avatar?: string;
  onClick?: () => void;
  duration?: number;
}

interface NotificationContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  requestPermission: () => Promise<boolean>;
  sendPushNotification: (title: string, body: string, icon?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    const duration = toast.duration || 4500;
    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  };

  const sendPushNotification = (title: string, body: string, icon?: string) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification(title, {
          body,
          icon: icon || '/favicon.ico',
          badge: '/favicon.ico',
        });
      } catch (err) {
        console.warn('Push notification failed', err);
      }
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        toasts,
        addToast,
        removeToast,
        requestPermission,
        sendPushNotification,
      }}
    >
      {children}

      {/* Floating toasts — WhatsApp style */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] mx-auto flex w-full max-w-sm flex-col gap-2 px-4 sm:left-auto sm:right-6 sm:mx-0 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => {
              if (toast.onClick) toast.onClick();
              removeToast(toast.id);
            }}
            className="pointer-events-auto flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--wa-border)] bg-[var(--wa-panel)] p-3 shadow-[0_6px_24px_rgba(11,20,26,0.18)] animate-scale-in transition hover:brightness-[0.99]"
          >
            {toast.avatar ? (
              <img
                src={toast.avatar}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${
                  toast.type === 'error'
                    ? 'bg-[#ea0038]'
                    : toast.type === 'warning'
                    ? 'bg-[#f0a500]'
                    : 'bg-[#00a884]'
                }`}
              >
                <span className="text-base font-semibold">!</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold leading-5 text-[var(--wa-text)]">
                {toast.title}
              </div>
              {toast.message && (
                <div className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-[var(--wa-text-2)]">
                  {toast.message}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              className="shrink-0 rounded-md p-1 text-[var(--wa-text-3)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
}
