import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useDirectory } from '../context/DirectoryContext';
import { useNotification } from '../context/NotificationContext';
import { StatusStory } from '../types';
import {
  X,
  Plus,
  Image as ImageIcon,
  Type,
  Eye,
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  Trash2,
  Camera,
} from 'lucide-react';
import { deleteCloudinaryMedia, uploadFileDetailed } from '../services/storage';
import { formatTime12 } from '../lib/time';

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const expiryMs = (story: StatusStory) =>
  typeof story.expiresAtMs === 'number'
    ? story.expiresAtMs
    : new Date(story.expiresAt).getTime();

const isExpired = (story: StatusStory) => {
  const ms = expiryMs(story);
  return Number.isFinite(ms) && ms <= Date.now();
};

/** Deletes an expired story document and its Cloudinary media, best-effort. */
async function cleanupStory(story: StatusStory) {
  try {
    if (story.deleteToken) await deleteCloudinaryMedia(story.deleteToken);
    await deleteDoc(doc(db, 'statuses', story.id));
  } catch {
    // Rules may reject deleting someone else's story; it stays hidden client-side.
  }
}

interface StatusModalProps {
  onClose: () => void;
  onReplyToStatus?: (userId: string, statusText: string) => void;
}

const BG_GRADIENTS = [
  'from-[#075e54] to-[#00a884]',
  'from-[#5b2c6f] to-[#8e44ad]',
  'from-[#7b241c] to-[#e74c3c]',
  'from-[#0b3d91] to-[#2e86c1]',
  'from-[#7e5109] to-[#f39c12]',
  'from-[#17202a] to-[#566573]',
];

export function StatusModal({ onClose, onReplyToStatus }: StatusModalProps) {
  const { user, profile } = useAuth();
  const { contacts, displayNameFor, photoFor } = useDirectory();
  const { addToast } = useNotification();

  const [statuses, setStatuses] = useState<StatusStory[]>([]);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'view' | 'create_text' | 'create_media'>('view');
  const [textContent, setTextContent] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(BG_GRADIENTS[0]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');

  const contactUids = useMemo(() => Object.keys(contacts), [contacts]);

  // Load our own statuses plus statuses from people we saved as contacts.
  // Firestore rules enforce the same boundary (a viewer must have saved the
  // creator), so those are the only documents the queries can return.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchStatuses = async () => {
      try {
        const queries = [
          query(collection(db, 'statuses'), where('userId', '==', user.uid)),
          ...contactUids.map((contactUid) =>
            query(collection(db, 'statuses'), where('userId', '==', contactUid))
          ),
        ];

        const snapshots = await Promise.all(
          queries.map((q) => getDocs(q).catch(() => null))
        );

        const byId = new Map<string, StatusStory>();
        snapshots.forEach((snap) => {
          snap?.forEach((d) =>
            byId.set(d.id, { id: d.id, ...d.data() } as StatusStory)
          );
        });

        const all = Array.from(byId.values());
        const expired = all.filter(isExpired);
        expired.forEach((story) => {
          void cleanupStory(story);
        });

        const active = all
          .filter((story) => !isExpired(story))
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        if (!cancelled) setStatuses(active);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'statuses');
      }
    };

    fetchStatuses();
    const timer = window.setInterval(fetchStatuses, CLEANUP_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, contactUids]);


  useEffect(() => {
    if (activeStoryIndex !== null && user && statuses[activeStoryIndex]) {
      const current = statuses[activeStoryIndex];
      if (!current.viewers?.includes(user.uid) && current.userId !== user.uid) {
        updateDoc(doc(db, 'statuses', current.id), {
          viewers: arrayUnion(user.uid),
        }).catch(() => {});
      }
    }
  }, [activeStoryIndex, user, statuses]);

  useEffect(() => {
    if (activeStoryIndex === null) return;
    const timer = window.setTimeout(() => {
      setActiveStoryIndex((prev) =>
        prev !== null && prev < statuses.length - 1 ? prev + 1 : null
      );
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [activeStoryIndex, statuses.length]);

  const myStatuses = useMemo(
    () => statuses.filter((s) => s.userId === user?.uid),
    [statuses, user?.uid]
  );
  const contactStatuses = useMemo(
    () => statuses.filter((s) => s.userId !== user?.uid),
    [statuses, user?.uid]
  );

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMode('create_media');
  };

  const handlePublishTextStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !textContent.trim() || loading) return;
    setLoading(true);

    try {
      const now = new Date();
      const expiresAtMs = now.getTime() + STATUS_TTL_MS;
      const newStory: Omit<StatusStory, 'id'> = {
        userId: user.uid,
        userName: profile.displayName,
        userPhoto: profile.photoURL,
        type: 'text',
        content: textContent.trim(),
        backgroundColor: selectedGradient,
        viewers: [],
        createdAt: now.toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresAtMs,
      };

      const docRef = await addDoc(collection(db, 'statuses'), newStory);
      setStatuses((prev) => [{ id: docRef.id, ...newStory }, ...prev]);
      setMode('view');
      setTextContent('');
      addToast({ title: 'Status shared', message: 'Your update is visible for 24 hours.', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'statuses');
      addToast({ title: 'Could not share status', message: 'Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePublishMediaStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !mediaFile || loading) return;
    setLoading(true);

    try {
      const upload = await uploadFileDetailed(
        mediaFile,
        `statuses/${Date.now()}_${mediaFile.name.replace(/[^\w.\-]+/g, '_')}`
      );
      const isVideo = mediaFile.type.startsWith('video');
      const now = new Date();
      const expiresAtMs = now.getTime() + STATUS_TTL_MS;

      const newStory: Omit<StatusStory, 'id'> = {
        userId: user.uid,
        userName: profile.displayName,
        userPhoto: profile.photoURL,
        type: isVideo ? 'video' : 'image',
        content: upload.url,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        ...(upload.publicId ? { publicId: upload.publicId } : {}),
        ...(upload.deleteToken ? { deleteToken: upload.deleteToken } : {}),
        viewers: [],
        createdAt: now.toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresAtMs,
      };

      const docRef = await addDoc(collection(db, 'statuses'), newStory);
      setStatuses((prev) => [{ id: docRef.id, ...newStory }, ...prev]);
      setMode('view');
      setMediaFile(null);
      setMediaPreview(null);
      setCaption('');
      addToast({ title: 'Status shared', message: 'Your update is visible for 24 hours.', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      handleFirestoreError(err, OperationType.WRITE, 'statuses');
      addToast({
        title: 'Could not share status',
        message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStatus = async (story: StatusStory) => {
    if (!user || story.userId !== user.uid) return;
    try {
      if (story.deleteToken) await deleteCloudinaryMedia(story.deleteToken);
      await deleteDoc(doc(db, 'statuses', story.id));
      setStatuses((prev) => prev.filter((s) => s.id !== story.id));
      setActiveStoryIndex(null);
      addToast({ title: 'Status deleted', message: 'Your update was removed.', type: 'success' });
    } catch {
      addToast({ title: 'Could not delete status', message: 'Please try again.', type: 'error' });
    }
  };

  const handleSendReply = () => {
    if (!replyText.trim() || activeStoryIndex === null || !onReplyToStatus) return;
    const current = statuses[activeStoryIndex];
    onReplyToStatus(current.userId, replyText.trim());
    setReplyText('');
    setActiveStoryIndex(null);
    onClose();
  };

  /* ---------- Story viewer ---------- */
  if (activeStoryIndex !== null && statuses[activeStoryIndex]) {
    const current = statuses[activeStoryIndex];
    const isMine = current.userId === user?.uid;
    const authorName = isMine ? 'My status' : displayNameFor(current.userId, current.userName);
    const authorPhoto = photoFor(current.userId, current.userPhoto);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-0 sm:p-4">
        <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-black sm:h-[90vh] sm:rounded-xl">
          <div className="absolute inset-x-3 top-3 z-30 flex items-center gap-1.5">
            {statuses.map((_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className={`h-full bg-white ${
                    i < activeStoryIndex
                      ? 'w-full'
                      : i === activeStoryIndex
                      ? 'w-full animate-[wa-fade-in_6s_linear]'
                      : 'w-0'
                  }`}
                />
              </div>
            ))}
          </div>

          <div className="absolute inset-x-4 top-7 z-30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={authorPhoto}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
              <div>
                <h4 className="text-[14px] font-semibold text-white drop-shadow">
                  {authorName}
                </h4>
                <p className="text-[11px] text-white/75">
                  {formatTime12(current.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {isMine && (
                <button
                  onClick={() => handleDeleteStatus(current)}
                  className="rounded-full bg-black/40 p-2 text-white/90 hover:bg-black/60"
                  title="Delete status"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setActiveStoryIndex(null)}
                className="rounded-full bg-black/40 p-2 text-white/90 hover:bg-black/60"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            onClick={() => setActiveStoryIndex((prev) => (prev && prev > 0 ? prev - 1 : 0))}
            className="absolute left-1 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/80 hover:bg-black/50"
            title="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={() =>
              setActiveStoryIndex((prev) =>
                prev !== null && prev < statuses.length - 1 ? prev + 1 : null
              )
            }
            className="absolute right-1 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/80 hover:bg-black/50"
            title="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div className="flex h-full w-full items-center justify-center">
            {current.type === 'text' ? (
              <div
                className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${
                  current.backgroundColor || BG_GRADIENTS[0]
                } px-8`}
              >
                <p className="whitespace-pre-wrap text-center text-[24px] font-semibold leading-relaxed text-white drop-shadow">
                  {current.content}
                </p>
              </div>
            ) : current.type === 'video' ? (
              <video src={current.content} autoPlay playsInline controls className="h-full w-full object-contain" />
            ) : (
              <div className="relative flex h-full w-full items-center justify-center">
                <img src={current.content} alt="" className="h-full w-full object-contain" />
                {current.caption && (
                  <p className="absolute inset-x-0 bottom-20 bg-gradient-to-t from-black/80 to-transparent px-6 pb-4 pt-12 text-center text-[14px] text-white">
                    {current.caption}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/80 to-transparent p-4">
            {isMine ? (
              <div className="flex items-center justify-center gap-2 text-[12px] text-white/85">
                <Eye className="h-4 w-4" />
                <span>{current.viewers?.length || 0} views</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                  placeholder={`Reply to ${displayNameFor(current.userId, current.userName)}`}
                  className="h-11 flex-1 rounded-full border border-white/20 bg-white/10 px-4 text-[13px] text-white placeholder:text-white/60 outline-none focus:border-white/40"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim()}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-40"
                  title="Send reply"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Status list / composer ---------- */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-[var(--wa-panel)] shadow-2xl animate-scale-in sm:h-[85vh] sm:rounded-xl">
        <header className="flex h-[60px] shrink-0 items-center justify-between bg-[#008069] px-4 text-white">
          <div className="flex items-center gap-3">
            {mode === 'view' ? (
              <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10" title="Close">
                <X className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setMode('view');
                  setMediaFile(null);
                  setMediaPreview(null);
                }}
                className="rounded-full p-1 hover:bg-white/10"
                title="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="text-[17px] font-medium">
              {mode === 'view' ? 'Status' : mode === 'create_text' ? 'Text status' : 'New status'}
            </h2>
          </div>
          {mode === 'view' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMode('create_text')}
                className="rounded-full p-2 hover:bg-white/10"
                title="Text status"
              >
                <Type className="h-5 w-5" />
              </button>
              <label className="cursor-pointer rounded-full p-2 hover:bg-white/10" title="Photo status">
                <ImageIcon className="h-5 w-5" />
                <input type="file" accept="image/*,video/*" onChange={handleMediaSelect} className="hidden" />
              </label>
            </div>
          )}
        </header>

        {mode === 'view' && (
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => setMode('create_text')}
              className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-[var(--wa-hover)]"
            >
              <div className="relative shrink-0">
                <img
                  src={profile?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid}`}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover"
                />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--wa-panel)] bg-[#00a884] text-white">
                  <Plus className="h-4 w-4" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold text-[var(--wa-text)]">My status</h3>
                <p className="text-[12.5px] text-[var(--wa-text-2)]">
                  {myStatuses.length > 0
                    ? `${myStatuses.length} active update${myStatuses.length > 1 ? 's' : ''}`
                    : 'Tap to add status update'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--wa-panel-2)] text-[var(--wa-text-2)]">
                  <Type className="h-4 w-4" />
                </span>
                <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[var(--wa-panel-2)] text-[var(--wa-text-2)]">
                  <Camera className="h-4 w-4" />
                  <input type="file" accept="image/*,video/*" onChange={handleMediaSelect} className="hidden" />
                </label>
              </div>
            </button>

            <div className="h-2 bg-[var(--wa-panel-2)]" />

            <div className="px-4 pb-1 pt-3">
              <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--wa-text-2)]">
                Recent updates
              </h4>
            </div>

            {statuses.length === 0 ? (
              <div className="px-8 py-12 text-center">
                <p className="text-sm font-medium text-[var(--wa-text)]">No status updates</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--wa-text-2)]">
                  Share your first status and it will appear here for 24 hours.
                </p>
              </div>
            ) : (
              <div className="py-1">
                {statuses.map((story, index) => {
                  const viewed = story.viewers?.includes(user?.uid || '');
                  const mine = story.userId === user?.uid;
                  return (
                    <button
                      key={story.id}
                      onClick={() => setActiveStoryIndex(index)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--wa-hover)]"
                    >
                      <div
                        className={`shrink-0 rounded-full p-[2px] ${
                          viewed && !mine ? 'bg-[var(--wa-text-3)]' : 'bg-[#00a884]'
                        }`}
                      >
                        <img
                          src={photoFor(story.userId, story.userPhoto)}
                          alt=""
                          className="h-[52px] w-[52px] rounded-full border-2 border-[var(--wa-panel)] object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-[14.5px] font-medium text-[var(--wa-text)]">
                          {mine ? 'My status' : displayNameFor(story.userId, story.userName)}
                        </h4>
                        <p className="truncate text-[12px] text-[var(--wa-text-2)]">
                          {formatTime12(story.createdAt)}
                          {story.type === 'text' ? ' · Text' : story.type === 'video' ? ' · Video' : ' · Photo'}
                          {mine ? ` · ${story.viewers?.length || 0} views` : ''}
                        </p>
                      </div>
                      {contactStatuses.length > 0 && !viewed && !mine && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#00a884]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 px-6 py-6 text-center text-[11.5px] text-[var(--wa-text-3)]">
              Status updates disappear after 24 hours
            </div>
          </div>
        )}

        {mode === 'create_text' && (
          <form onSubmit={handlePublishTextStatus} className="flex flex-1 flex-col overflow-hidden">
            <div className={`flex flex-1 items-center justify-center bg-gradient-to-br ${selectedGradient} p-6`}>
              <textarea
                autoFocus
                rows={6}
                required
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Type a status"
                maxLength={700}
                className="w-full resize-none bg-transparent text-center text-[24px] font-medium leading-relaxed text-white placeholder:text-white/60 outline-none"
              />
            </div>

            <div className="flex items-center justify-center gap-2.5 bg-[var(--wa-panel)] px-4 py-3">
              {BG_GRADIENTS.map((grad) => (
                <button
                  key={grad}
                  type="button"
                  onClick={() => setSelectedGradient(grad)}
                  className={`h-8 w-8 rounded-full bg-gradient-to-br ${grad} transition ${
                    selectedGradient === grad ? 'ring-2 ring-[#00a884] ring-offset-2 ring-offset-[var(--wa-panel)]' : 'opacity-80'
                  }`}
                  title="Background colour"
                />
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--wa-border)] px-4 py-3">
              <button
                type="button"
                onClick={() => setMode('view')}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !textContent.trim()}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white shadow transition hover:bg-[#008069] disabled:opacity-40"
                title="Share status"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </form>
        )}

        {mode === 'create_media' && (
          <form onSubmit={handlePublishMediaStatus} className="flex flex-1 flex-col overflow-hidden">
            <div className="relative flex flex-1 items-center justify-center bg-black">
              {mediaPreview &&
                (mediaFile?.type.startsWith('video') ? (
                  <video src={mediaPreview} controls className="max-h-full w-full object-contain" />
                ) : (
                  <img src={mediaPreview} alt="" className="max-h-full w-full object-contain" />
                ))}
            </div>

            <div className="space-y-3 border-t border-[var(--wa-border)] bg-[var(--wa-panel)] px-4 py-3">
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption"
                maxLength={200}
                className="h-11 w-full rounded-lg bg-[var(--wa-panel-2)] px-4 text-[14px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMode('view');
                    setMediaFile(null);
                    setMediaPreview(null);
                  }}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white shadow transition hover:bg-[#008069] disabled:opacity-40"
                  title="Share status"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
