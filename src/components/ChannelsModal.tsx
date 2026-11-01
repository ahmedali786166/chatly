import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Channel, ChannelPost } from '../types';
import {
  Radio,
  Plus,
  X,
  Send,
  CheckCircle2,
  ArrowLeft,
  Users,
  Megaphone,
  ChevronRight,
} from 'lucide-react';

interface ChannelsModalProps {
  onClose: () => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ChannelsModal({ onClose }: ChannelsModalProps) {
  const { user, profile } = useAuth();
  const { addToast } = useNotification();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [mode, setMode] = useState<'browse' | 'create'>('browse');
  const [loading, setLoading] = useState(false);
  const [mobilePane, setMobilePane] = useState<'list' | 'channel'>('list');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newPostContent, setNewPostContent] = useState('');

  // Realtime channels list
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'channels'),
      (snap) => {
        const list: Channel[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Channel));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setChannels(list);
        setActiveChannelId((prev) => prev ?? list[0]?.id ?? null);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'channels')
    );
    return () => unsubscribe();
  }, []);

  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
  const isSubscribed = !!activeChannel?.subscribers?.includes(user?.uid || '');
  const isOwner = activeChannel?.ownerId === user?.uid;

  // Realtime posts for the active channel
  useEffect(() => {
    if (!activeChannelId) {
      setPosts([]);
      return;
    }
    const unsubscribe = onSnapshot(
      collection(db, 'channels', activeChannelId, 'posts'),
      (snap) => {
        const list: ChannelPost[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ChannelPost));
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setPosts(list);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `channels/${activeChannelId}/posts`)
    );
    return () => unsubscribe();
  }, [activeChannelId]);

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !name.trim() || loading) return;
    setLoading(true);

    try {
      const newChannel: Omit<Channel, 'id'> = {
        name: name.trim(),
        description: description.trim(),
        ownerId: user.uid,
        ownerName: profile.displayName,
        subscribers: [user.uid],
        subscriberCount: 1,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'channels'), newChannel);
      setActiveChannelId(docRef.id);
      setMobilePane('channel');
      setMode('browse');
      setName('');
      setDescription('');
      addToast({ type: 'success', title: 'Channel created', message: `“${newChannel.name}” is live.` });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'channels');
      addToast({ type: 'error', title: 'Could not create channel', message: 'Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSubscribe = async () => {
    if (!user || !activeChannel) return;
    const channelRef = doc(db, 'channels', activeChannel.id);

    try {
      if (isSubscribed) {
        await updateDoc(channelRef, {
          subscribers: arrayRemove(user.uid),
          subscriberCount: increment(-1),
        });
      } else {
        await updateDoc(channelRef, {
          subscribers: arrayUnion(user.uid),
          subscriberCount: increment(1),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `channels/${activeChannel.id}`);
      addToast({ type: 'error', title: 'Action failed', message: 'Could not update subscription.' });
    }
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !activeChannel || !newPostContent.trim()) return;

    const content = newPostContent.trim();
    setNewPostContent('');

    try {
      const newPost: Omit<ChannelPost, 'id'> = {
        channelId: activeChannel.id,
        authorId: user.uid,
        authorName: profile.displayName,
        authorPhoto: profile.photoURL,
        content,
        reactions: {},
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, 'channels', activeChannel.id, 'posts'), newPost);
    } catch (err) {
      setNewPostContent(content);
      handleFirestoreError(err, OperationType.WRITE, `channels/${activeChannel.id}/posts`);
      addToast({ type: 'error', title: 'Not published', message: 'Could not post the update.' });
    }
  };

  const openChannel = (id: string) => {
    setActiveChannelId(id);
    setMobilePane('channel');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 animate-fade-in sm:p-6">
      <div className="flex h-full w-full max-w-[1040px] overflow-hidden bg-[var(--wa-panel)] shadow-2xl sm:h-[85vh] sm:rounded-lg">
        {/* Channel list */}
        <div
          className={`${
            mobilePane === 'list' ? 'flex' : 'hidden'
          } w-full shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] sm:flex sm:w-[340px]`}
        >
          <div className="flex h-[64px] items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884]/15 text-[#00a884]">
              <Radio className="h-5 w-5" />
            </div>
            <h2 className="text-[19px] font-medium text-[var(--wa-text)]">Channels</h2>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setMode('create')}
                className="rounded-full p-2 text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
                title="New channel"
              >
                <Plus className="h-5 w-5" />
              </button>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <button
            onClick={() => setMode('create')}
            className="flex items-center gap-3 border-b border-[var(--wa-border)] px-4 py-3.5 text-left transition hover:bg-[var(--wa-hover)]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
              <Plus className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-[var(--wa-text)]">New channel</p>
              <p className="truncate text-[13px] text-[var(--wa-text-2)]">
                Broadcast updates to your followers
              </p>
            </div>
          </button>

          <div className="flex-1 overflow-y-auto">
            {channels.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <Megaphone className="mb-3 h-10 w-10 text-[var(--wa-text-3)]" />
                <p className="text-[14px] text-[var(--wa-text-2)]">No channels yet</p>
                <p className="mt-1 text-[12.5px] leading-5 text-[var(--wa-text-3)]">
                  Create one to share updates with as many followers as you like.
                </p>
              </div>
            ) : (
              channels.map((chan) => {
                const selected = chan.id === activeChannelId && mode === 'browse';
                return (
                  <button
                    key={chan.id}
                    onClick={() => {
                      setMode('browse');
                      openChannel(chan.id);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      selected ? 'bg-[var(--wa-active)]' : 'hover:bg-[var(--wa-hover)]'
                    }`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#008069] text-[16px] font-medium text-white">
                      {chan.photoURL ? (
                        <img src={chan.photoURL} alt="" className="h-full w-full object-cover" />
                      ) : (
                        chan.name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-[15px] text-[var(--wa-text)]">
                        <span className="truncate">{chan.name}</span>
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#00a884]" />
                      </p>
                      <p className="truncate text-[13px] text-[var(--wa-text-2)]">
                        {chan.subscriberCount || 0}{' '}
                        {chan.subscriberCount === 1 ? 'follower' : 'followers'}
                        {chan.description ? ` · ${chan.description}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--wa-text-3)]" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right pane */}
        <div
          className={`${
            mobilePane === 'channel' ? 'flex' : 'hidden'
          } min-w-0 flex-1 flex-col bg-[var(--wa-panel-2)] sm:flex`}
        >
          {mode === 'create' ? (
            <form onSubmit={handleCreateChannel} className="flex flex-1 flex-col">
              <div className="flex h-[64px] items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => setMobilePane('list')}
                  className="rounded-full p-1.5 text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)] sm:hidden"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h3 className="text-[16px] font-medium text-[var(--wa-text)]">Create channel</h3>
                <button
                  type="button"
                  onClick={() => setMode('browse')}
                  className="ml-auto rounded-full p-1.5 text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
                  aria-label="Close create form"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="mx-auto max-w-[520px] space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00a884]/15 text-[#00a884]">
                      <Radio className="h-7 w-7" />
                    </div>
                    <p className="text-[13.5px] leading-5 text-[var(--wa-text-2)]">
                      Channels are a one-way broadcast. Only you can post, and followers can react
                      and forward updates.
                    </p>
                  </div>

                  <label className="block rounded-lg bg-[var(--wa-panel)] px-4 py-3 shadow-[0_1px_3px_rgba(11,20,26,0.08)]">
                    <span className="block text-[13px] text-[#00a884]">Channel name</span>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Tech Radar Daily"
                      className="mt-0.5 w-full bg-transparent text-[15px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                    />
                  </label>

                  <label className="block rounded-lg bg-[var(--wa-panel)] px-4 py-3 shadow-[0_1px_3px_rgba(11,20,26,0.08)]">
                    <span className="block text-[13px] text-[#00a884]">Description</span>
                    <textarea
                      rows={3}
                      maxLength={200}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What will you share on this channel?"
                      className="mt-0.5 w-full resize-none bg-transparent text-[15px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-6 py-3">
                <button
                  type="button"
                  onClick={() => setMode('browse')}
                  className="rounded-full px-4 py-2 text-[14px] text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="rounded-full bg-[#00a884] px-5 py-2 text-[14px] font-medium text-white transition hover:bg-[#008069] disabled:opacity-60"
                >
                  {loading ? 'Creating…' : 'Create channel'}
                </button>
              </div>
            </form>
          ) : activeChannel ? (
            <>
              <div className="flex h-[64px] items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 sm:px-5">
                <button
                  onClick={() => setMobilePane('list')}
                  className="rounded-full p-1.5 text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)] sm:hidden"
                  aria-label="Back to channels"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#008069] text-[15px] font-medium text-white">
                  {activeChannel.photoURL ? (
                    <img src={activeChannel.photoURL} alt="" className="h-full w-full object-cover" />
                  ) : (
                    activeChannel.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-[15px] text-[var(--wa-text)]">
                    <span className="truncate">{activeChannel.name}</span>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#00a884]" />
                  </p>
                  <p className="truncate text-[12.5px] text-[var(--wa-text-2)]">
                    {(activeChannel.subscriberCount || 0).toLocaleString()}{' '}
                    {activeChannel.subscriberCount === 1 ? 'follower' : 'followers'} · by{' '}
                    {activeChannel.ownerName}
                  </p>
                </div>
                <button
                  onClick={handleToggleSubscribe}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                    isSubscribed
                      ? 'bg-[var(--wa-panel-2)] text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]'
                      : 'bg-[#00a884] text-white hover:bg-[#008069]'
                  }`}
                >
                  {isSubscribed ? 'Following' : 'Follow'}
                </button>
                <button
                  onClick={onClose}
                  className="hidden rounded-full p-1.5 text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)] sm:block"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="wa-wallpaper flex-1 overflow-y-auto px-4 py-5 sm:px-8">
                {activeChannel.description && (
                  <div className="mx-auto mb-5 max-w-[640px] rounded-lg bg-[var(--wa-panel)] p-4 text-center shadow-[0_1px_3px_rgba(11,20,26,0.08)]">
                    <Users className="mx-auto mb-2 h-5 w-5 text-[#00a884]" />
                    <p className="text-[13.5px] leading-5 text-[var(--wa-text-2)]">
                      {activeChannel.description}
                    </p>
                  </div>
                )}

                {posts.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Megaphone className="mb-3 h-10 w-10 text-[var(--wa-text-3)]" />
                    <p className="text-[14px] text-[var(--wa-text-2)]">No updates yet</p>
                    <p className="mt-1 max-w-xs text-[12.5px] leading-5 text-[var(--wa-text-3)]">
                      {isOwner
                        ? 'Use the box below to publish your first broadcast.'
                        : 'When the channel owner posts, updates will appear here.'}
                    </p>
                  </div>
                ) : (
                  <div className="mx-auto max-w-[640px] space-y-2.5">
                    {posts.map((post) => (
                      <div
                        key={post.id}
                        className="rounded-lg bg-[var(--wa-panel)] px-3.5 py-2.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <p className="truncate text-[13px] font-medium text-[#00a884]">
                            {post.authorName}
                          </p>
                          <span className="shrink-0 text-[11.5px] text-[var(--wa-text-3)]">
                            {timeAgo(post.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-[14.5px] leading-[21px] text-[var(--wa-text)]">
                          {post.content}
                        </p>
                        {post.mediaUrl && post.mediaType === 'image' && (
                          <img
                            src={post.mediaUrl}
                            alt=""
                            className="mt-2 max-h-72 w-full rounded-md object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isOwner ? (
                <form
                  onSubmit={handlePublishPost}
                  className="flex items-center gap-2 border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-4 py-3"
                >
                  <input
                    type="text"
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Broadcast an update to followers…"
                    className="min-w-0 flex-1 rounded-lg bg-[var(--wa-panel)] px-4 py-2.5 text-[14.5px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                  />
                  <button
                    type="submit"
                    disabled={!newPostContent.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#008069] disabled:opacity-50"
                    aria-label="Publish"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <div className="border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-4 py-2.5 text-center text-[12.5px] text-[var(--wa-text-2)]">
                  Only the channel owner can post updates.
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <Radio className="mb-3 h-12 w-12 text-[var(--wa-text-3)]" />
              <h3 className="text-[20px] font-light text-[var(--wa-text)]">Stay updated</h3>
              <p className="mt-2 max-w-sm text-[13.5px] leading-5 text-[var(--wa-text-2)]">
                Follow channels to get broadcasts, announcements and media from the people and
                topics you care about.
              </p>
              <button
                onClick={() => setMode('create')}
                className="mt-5 rounded-full bg-[#00a884] px-5 py-2 text-[14px] font-medium text-white transition hover:bg-[#008069]"
              >
                Create a channel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
