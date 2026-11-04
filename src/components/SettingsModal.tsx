import React, { useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { uploadFile } from '../services/storage';
import { ImageCropModal } from './ImageCropModal';
import { UserProfile } from '../types';
import {
  X,
  User,
  Palette,
  Shield,
  Bell,
  Camera,
  LogOut,
  Check,
  Moon,
  Sun,
  ChevronRight,
  MessageCircle,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { deleteUserAccount, usesPasswordSignIn } from '../services/account';

interface SettingsModalProps {
  onClose: () => void;
  currentTheme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
}

type Tab = 'profile' | 'appearance' | 'privacy' | 'notifications';

const WALLPAPERS = [
  { id: 'default', name: 'Doodle', hint: 'WhatsApp default' },
  { id: 'plain', name: 'Plain', hint: 'Solid colour' },
  { id: 'gradient', name: 'Soft green', hint: 'Fading gradient' },
];

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'profile', label: 'Profile', icon: User, desc: 'Name, photo and about' },
  { id: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme and wallpaper' },
  { id: 'privacy', label: 'Privacy', icon: Shield, desc: 'Read receipts and presence' },
  { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'Sounds and desktop alerts' },
];

export function SettingsModal({ onClose, currentTheme, setTheme }: SettingsModalProps) {
  const { user, profile, updateProfileData, logout } = useAuth();
  const { addToast, requestPermission } = useNotification();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [mobilePane, setMobilePane] = useState<'menu' | 'content'>('menu');
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.photoURL || '');
  const [chatWallpaper, setChatWallpaper] = useState(profile?.chatWallpaper || 'default');
  const [soundEnabled, setSoundEnabled] = useState(profile?.soundEnabled ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile?.notificationsEnabled ?? true);
  const [readReceipts, setReadReceipts] = useState(profile?.readReceipts ?? true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleteError('');
    if (usesPasswordSignIn(user) && !deletePassword) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    setDeleting(true);
    try {
      await deleteUserAccount(user, deletePassword);
      addToast({ type: 'success', title: 'Account deleted', message: 'Your account and all related data were removed.' });
      setConfirmDelete(false);
      await logout();
      onClose();
    } catch (err: unknown) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: string }).code) : '';
      let message = err instanceof Error ? err.message : 'Please try again.';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        message = 'Incorrect password. Please try again.';
      } else if (code === 'auth/requires-recent-login') {
        message = 'Please log out, log back in, and try deleting again.';
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        message = 'Google confirmation was cancelled.';
      } else if (code === 'auth/user-mismatch') {
        message = 'That account does not match the signed-in user. Try the same account again.';
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please wait a few minutes and try again.';
      }
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    setPendingAvatar(e.target.files[0]);
    e.target.value = '';
  };

  const handleCroppedAvatar = async (blob: Blob, previewUrl: string) => {
    if (!user) return;
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    setPendingAvatar(null);
    setUploadingAvatar(true);
    setAvatarUrl(previewUrl);
    try {
      const url = await uploadFile(file, `avatars/${user.uid}_${Date.now()}`);
      setAvatarUrl(url);
      await updateProfileData({ photoURL: url });
      addToast({ type: 'success', title: 'Photo updated', message: 'Your profile picture changed.' });
    } catch {
      setAvatarUrl(profile?.photoURL || '');
      addToast({ type: 'error', title: 'Upload failed', message: 'Could not upload the image.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    if (cleanUsername) {
      if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
        addToast({
          type: 'error',
          title: 'Invalid username',
          message: 'Use 3–24 letters, numbers or underscores.',
        });
        return;
      }
      if (cleanUsername !== (profile?.username || '')) {
        try {
          const snap = await getDocs(
            query(collection(db, 'users'), where('username', '==', cleanUsername))
          );
          const taken = snap.docs.some((d) => (d.data() as UserProfile).uid !== user?.uid);
          if (taken) {
            addToast({
              type: 'error',
              title: 'Username taken',
              message: 'Someone already uses that username. Try another one.',
            });
            return;
          }
        } catch (err) {
          console.warn('Username check failed:', err);
        }
      }
    }

    setSaving(true);
    try {
      await updateProfileData({
        displayName: displayName.trim(),
        username: cleanUsername,
        bio: bio.trim(),
        chatWallpaper,
        soundEnabled,
        notificationsEnabled,
        readReceipts,
      });
      addToast({ type: 'success', title: 'Settings saved', message: 'Your preferences were updated.' });
      onClose();
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Error',
        message: err instanceof Error ? err.message : 'Could not update your profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotifications = async () => {
    const nextVal = !notificationsEnabled;
    setNotificationsEnabled(nextVal);
    if (nextVal) {
      const granted = await requestPermission();
      if (!granted) {
        addToast({
          type: 'warning',
          title: 'Permission needed',
          message: 'Browser notification permission was not granted.',
        });
      }
    }
  };

  const toggleRow = (
    title: string,
    desc: string,
    checked: boolean,
    onChange: () => void
  ) => (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--wa-border)] px-4 py-3.5 last:border-none">
      <div className="min-w-0">
        <p className="text-[14.5px] text-[var(--wa-text)]">{title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-[var(--wa-text-2)]">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        role="switch"
        aria-checked={checked}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
          checked ? 'bg-[#00a884]' : 'bg-[var(--wa-text-3)]/40'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-6 animate-fade-in">
      <div className="flex h-full w-full max-w-[980px] overflow-hidden bg-[var(--wa-panel)] shadow-2xl sm:h-[85vh] sm:rounded-lg">
        {/* Settings navigation */}
        <div
          className={`${
            mobilePane === 'menu' ? 'flex' : 'hidden'
          } w-full shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] sm:flex sm:w-[320px]`}
        >
          <div className="flex h-[64px] items-center gap-4 bg-[var(--wa-header)] px-4">
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)] sm:hidden"
              aria-label="Back"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-[19px] font-medium text-[var(--wa-text)]">Settings</h2>
            <button
              onClick={onClose}
              className="ml-auto hidden rounded-full p-1.5 text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)] sm:block"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Profile card */}
          <button
            onClick={() => {
              setActiveTab('profile');
              setMobilePane('content');
            }}
            className="flex items-center gap-3 border-b border-[var(--wa-border)] px-4 py-4 text-left transition hover:bg-[var(--wa-hover)]"
          >
            <div className="relative">
              <img
                src={avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid}`}
                alt=""
                className="h-[56px] w-[56px] rounded-full object-cover"
              />
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[var(--wa-panel)] bg-[#25d366]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] text-[var(--wa-text)]">
                {profile?.displayName || 'Your name'}
              </p>
              <p className="mt-0.5 truncate text-[13.5px] text-[var(--wa-text-2)]">
                {bio || 'Hey there! I am using Chatly.'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--wa-text-3)]" />
          </button>

          <nav className="flex-1 overflow-y-auto py-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobilePane('content');
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                    active ? 'bg-[var(--wa-active)]' : 'hover:bg-[var(--wa-hover)]'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${
                      active ? 'text-[#00a884]' : 'text-[var(--wa-text-2)]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] text-[var(--wa-text)]">{tab.label}</p>
                    <p className="truncate text-[13px] text-[var(--wa-text-2)]">{tab.desc}</p>
                  </div>
                </button>
              );
            })}

            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="mt-1 flex w-full items-center gap-3 px-4 py-3 text-left text-[#ea0038] transition hover:bg-[var(--wa-hover)]"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span className="text-[14.5px]">Log out</span>
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-[#ea0038] transition hover:bg-[var(--wa-hover)]"
            >
              <Trash2 className="h-5 w-5 shrink-0" />
              <span className="text-[14.5px]">Delete account</span>
            </button>
          </nav>
        </div>

        {/* Content */}
        <div
          className={`${
            mobilePane === 'content' ? 'flex' : 'hidden'
          } min-w-0 flex-1 flex-col bg-[var(--wa-panel-2)] sm:flex`}
        >
          <div className="flex h-[64px] items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 sm:px-6">
            <button
              onClick={() => setMobilePane('menu')}
              className="rounded-full p-1.5 text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)] sm:hidden"
              aria-label="Back to settings"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-[16px] font-medium text-[var(--wa-text)]">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <button
              onClick={onClose}
              className="ml-auto hidden rounded-full p-1.5 text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)] sm:block"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'profile' && (
              <div className="mx-auto max-w-[560px] space-y-5">
                <div className="flex items-center gap-5">
                  <div className="group relative">
                    <img
                      src={avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid}`}
                      alt=""
                      className="h-[100px] w-[100px] rounded-full object-cover"
                    />
                    <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                      <Camera className="h-6 w-6" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-[var(--wa-text)]">Profile picture</p>
                    <p className="mt-1 text-[13px] leading-5 text-[var(--wa-text-2)]">
                      Click the photo to change it. Square PNG or JPG works best.
                    </p>
                    {uploadingAvatar && (
                      <p className="mt-1 text-[13px] font-medium text-[#00a884]">Uploading…</p>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg bg-[var(--wa-panel)] shadow-[0_1px_3px_rgba(11,20,26,0.08)]">
                  {[
                    {
                      label: 'Your name',
                      value: displayName,
                      set: setDisplayName,
                      placeholder: 'Display name',
                      maxLength: 40,
                    },
                    {
                      label: 'Username',
                      value: username,
                      set: setUsername,
                      placeholder: 'username',
                      maxLength: 24,
                    },
                  ].map((field) => (
                    <label
                      key={field.label}
                      className="block border-b border-[var(--wa-border)] px-4 py-3 last:border-none"
                    >
                      <span className="block text-[13px] text-[#00a884]">{field.label}</span>
                      <input
                        type="text"
                        value={field.value}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        onChange={(e) => field.set(e.target.value)}
                        className="mt-0.5 w-full bg-transparent text-[15px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                      />
                    </label>
                  ))}

                  <label className="block px-4 py-3">
                    <span className="block text-[13px] text-[#00a884]">About</span>
                    <textarea
                      rows={2}
                      value={bio}
                      maxLength={140}
                      placeholder="Hey there! I am using Chatly."
                      onChange={(e) => setBio(e.target.value)}
                      className="mt-0.5 w-full resize-none bg-transparent text-[15px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                    />
                  </label>
                </div>

                <p className="flex items-center gap-2 text-[13px] text-[var(--wa-text-2)]">
                  <MessageCircle className="h-4 w-4 text-[var(--wa-text-3)]" />
                  Your name, photo and about are visible to your contacts.
                </p>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="mx-auto max-w-[560px] space-y-6">
                <div>
                  <h4 className="mb-2 text-[13px] uppercase tracking-wide text-[var(--wa-text-2)]">
                    Theme
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        { id: 'light', label: 'Light', icon: Sun },
                        { id: 'dark', label: 'Dark', icon: Moon },
                      ] as const
                    ).map((opt) => {
                      const Icon = opt.icon;
                      const active = currentTheme === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTheme(opt.id)}
                          className={`flex items-center gap-3 rounded-lg border bg-[var(--wa-panel)] p-4 text-left transition ${
                            active
                              ? 'border-[#00a884] ring-1 ring-[#00a884]'
                              : 'border-[var(--wa-border)] hover:bg-[var(--wa-hover)]'
                          }`}
                        >
                          <Icon
                            className={`h-5 w-5 ${
                              opt.id === 'dark' ? 'text-[#8696a0]' : 'text-[#f0a500]'
                            }`}
                          />
                          <span className="flex-1 text-[14.5px] text-[var(--wa-text)]">
                            {opt.label}
                          </span>
                          {active && <Check className="h-4 w-4 text-[#00a884]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-[13px] uppercase tracking-wide text-[var(--wa-text-2)]">
                    Chat wallpaper
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {WALLPAPERS.map((wp) => {
                      const active = chatWallpaper === wp.id;
                      return (
                        <button
                          key={wp.id}
                          type="button"
                          onClick={() => setChatWallpaper(wp.id)}
                          className={`overflow-hidden rounded-lg border bg-[var(--wa-panel)] text-left transition ${
                            active
                              ? 'border-[#00a884] ring-1 ring-[#00a884]'
                              : 'border-[var(--wa-border)] hover:bg-[var(--wa-hover)]'
                          }`}
                        >
                          <div
                            className={`relative h-16 ${
                              wp.id === 'plain'
                                ? 'bg-[var(--wa-chat)]'
                                : wp.id === 'gradient'
                                ? 'bg-[linear-gradient(135deg,rgba(0,168,132,0.18),var(--wa-chat),rgba(0,128,105,0.18))]'
                                : 'wa-wallpaper'
                            }`}
                          >
                            <span className="absolute bottom-2 left-2 h-3 w-10 rounded-[4px] bg-[var(--wa-in)] shadow" />
                            <span className="absolute bottom-2 right-2 h-3 w-8 rounded-[4px] bg-[var(--wa-out)] shadow" />
                          </div>
                          <div className="flex items-center justify-between px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] text-[var(--wa-text)]">{wp.name}</p>
                              <p className="truncate text-[11px] text-[var(--wa-text-3)]">{wp.hint}</p>
                            </div>
                            {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#00a884]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="mx-auto max-w-[560px] overflow-hidden rounded-lg bg-[var(--wa-panel)] shadow-[0_1px_3px_rgba(11,20,26,0.08)]">
                {toggleRow(
                  'Read receipts',
                  'If turned off, you will not send or receive blue ticks. Read receipts are always sent for group chats.',
                  readReceipts,
                  () => setReadReceipts(!readReceipts)
                )}
                <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                  <div>
                    <p className="text-[14.5px] text-[var(--wa-text)]">Online presence</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-[var(--wa-text-2)]">
                      Contacts can see when you are active on Chatly.
                    </p>
                  </div>
                  <span className="mt-1 shrink-0 rounded-full bg-[#d9fdd3] px-2.5 py-0.5 text-[12px] font-medium text-[#008069] dark:bg-[#005c4b] dark:text-[#e9edef]">
                    Always on
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="mx-auto max-w-[560px] overflow-hidden rounded-lg bg-[var(--wa-panel)] shadow-[0_1px_3px_rgba(11,20,26,0.08)]">
                {toggleRow(
                  'Message and call sounds',
                  'Play a tone when messages arrive and when someone calls you.',
                  soundEnabled,
                  () => setSoundEnabled(!soundEnabled)
                )}
                {toggleRow(
                  'Desktop notifications',
                  'Show browser alerts when Chatly is running in the background.',
                  notificationsEnabled,
                  handleToggleNotifications
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-6 py-3">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-[14px] text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-[#00a884] px-5 py-2 text-[14px] font-medium text-white transition hover:bg-[#008069] disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-xl bg-[var(--wa-panel)] p-5 shadow-2xl animate-scale-in">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ea0038]/10">
                <AlertTriangle className="h-5 w-5 text-[#ea0038]" />
              </span>
              <h3 className="text-[16px] font-medium text-[var(--wa-text)]">Delete account?</h3>
            </div>
            <p className="mt-3 text-[13.5px] leading-6 text-[var(--wa-text-2)]">
              This permanently deletes your profile, statuses, channels and all your conversations.
              This cannot be undone.
            </p>

            {user && usesPasswordSignIn(user) ? (
              <label className="mt-4 block">
                <span className="text-[12.5px] text-[var(--wa-text-2)]">
                  Confirm with your password
                </span>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-lg border border-[var(--wa-border)] bg-[var(--wa-panel-2)] px-3 py-2 text-[14px] text-[var(--wa-text)] outline-none focus:border-[#00a884]"
                />
              </label>
            ) : (
              <p className="mt-3 text-[12.5px] text-[var(--wa-text-2)]">
                You will be asked to confirm with Google before this is completed.
              </p>
            )}

            {deleteError && (
              <p className="mt-2 text-[12.5px] font-medium text-[#ea0038]">{deleteError}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-full px-4 py-2 text-[14px] text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="rounded-full bg-[#ea0038] px-4 py-2 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingAvatar && (
        <ImageCropModal
          file={pendingAvatar}
          title="Crop profile photo"
          onCancel={() => setPendingAvatar(null)}
          onComplete={handleCroppedAvatar}
        />
      )}
    </div>
  );
}
