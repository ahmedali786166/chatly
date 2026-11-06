import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useDirectory } from '../context/DirectoryContext';
import { useNotification } from '../context/NotificationContext';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { sounds } from '../services/sound';
import { pushConfigured } from '../services/push';
import { formatTime12 } from '../lib/time';
import { onAvatarError } from '../lib/avatar';
import { Conversation } from '../types';
import {
  Archive,
  BellOff,
  CheckCheck,
  Download,
  MessageCircle,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Settings,
  Users,
  Radio,
  CircleDashed,
  Pin,
  ArchiveRestore,
  Check,
  Camera,
} from 'lucide-react';

interface LeftSidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onOpenCalls: () => void;
  onOpenStatus: () => void;
  onOpenChannels: () => void;
  onOpenSettings: () => void;
  onUnreadChange?: (count: number) => void;
}

type FilterTab = 'all' | 'unread' | 'favorites' | 'groups' | 'archived';

export function LeftSidebar({
  activeConversationId,
  onSelectConversation,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenCalls,
  onOpenStatus,
  onOpenChannels,
  onOpenSettings,
  onUnreadChange,
}: LeftSidebarProps) {
  const { user, profile } = useAuth();
  const { addToast, sendPushNotification } = useNotification();
  const { isInstalled, promptInstall } = usePwaInstall();
  const { displayNameFor, photoFor, nicknameFor, directory, isSavedContact } = useDirectory();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);

  const seenTimestamps = useRef<Record<string, string>>({});
  const initialized = useRef(false);
  const activeIdRef = useRef(activeConversationId);
  activeIdRef.current = activeConversationId;
  const unreadCallbackRef = useRef(onUnreadChange);
  unreadCallbackRef.current = onUnreadChange;

  // Real-time conversations (sorted client-side to avoid composite indexes)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Conversation[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Conversation));

        list.sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        );

        const isFirst = !initialized.current;
        let notified = false;

        list.forEach((conv) => {
          const ts = conv.lastMessage?.timestamp;
          if (!ts) return;
          const previous = seenTimestamps.current[conv.id];

          if (
            !isFirst &&
            previous &&
            new Date(ts).getTime() > new Date(previous).getTime() &&
            conv.lastMessage?.senderId !== user.uid &&
            conv.id !== activeIdRef.current &&
            !conv.mutedBy?.includes(user.uid)
          ) {
            const otherId = conv.participantIds.find((id) => id !== user.uid) || '';
            const title =
              conv.type === 'group'
                ? conv.groupInfo?.name || 'Group'
                : displayNameFor(otherId, conv.participantDetails?.[otherId]?.displayName || 'New message');
            const body = conv.lastMessage?.text || 'New message';
            const avatar =
              conv.type === 'group'
                ? conv.groupInfo?.photoURL
                : photoFor(otherId, conv.participantDetails?.[otherId]?.photoURL);

            addToast({
              title,
              message: body,
              avatar,
              onClick: () => onSelectConversation(conv.id),
            });
            if (profile?.notificationsEnabled !== false && !pushConfigured) {
              sendPushNotification(title, body, avatar);
            }
            if (!notified) {
              sounds.playReceived();
              notified = true;
            }
          }

          seenTimestamps.current[conv.id] = ts;
        });

        initialized.current = true;
        setConversations(list);

        const unreadTotal = list.reduce((sum, conv) => {
          if (conv.archivedBy?.includes(user.uid)) return sum;
          const own = conv.unreadCounts?.[user.uid] || 0;
          const fallback =
            conv.lastMessage &&
            conv.lastMessage.senderId !== user.uid &&
            !conv.lastMessage.readBy?.includes(user.uid)
              ? 1
              : 0;
          return sum + Math.max(own, fallback);
        }, 0);
        unreadCallbackRef.current?.(unreadTotal);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'conversations');
      }
    );

    return () => unsubscribe();
  }, [user, profile?.notificationsEnabled]);

  useEffect(() => {
    if (!showHeaderMenu && !menuFor) return;
    const close = () => {
      setShowHeaderMenu(false);
      setMenuFor(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showHeaderMenu, menuFor]);

  const filteredConversations = useMemo(() => {
    // Pinned chats stay on top, then latest activity
    return conversations
      .filter((c) => {
      const isArchived = c.archivedBy?.includes(user?.uid || '');
      if (filterTab === 'archived' && !isArchived) return false;
      if (filterTab !== 'archived' && isArchived) return false;
      if (filterTab === 'groups' && c.type !== 'group') return false;

      if (filterTab === 'favorites') {
        if (c.type === 'group') return false;
        const otherId = c.participantIds.find((id) => id !== user?.uid);
        if (!isSavedContact(otherId)) return false;
      }

      const unread = c.unreadCounts?.[user?.uid || ''] || 0;
      if (filterTab === 'unread' && unread === 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (c.type === 'group') {
          return (
            (c.groupInfo?.name || '').toLowerCase().includes(q) ||
            (c.lastMessage?.text || '').toLowerCase().includes(q)
          );
        }
        const otherId = c.participantIds.find((id) => id !== user?.uid);
        const other = otherId ? c.participantDetails?.[otherId] : null;
        return (
          displayNameFor(otherId, other?.displayName || '').toLowerCase().includes(q) ||
          (nicknameFor(otherId) || '').toLowerCase().includes(q) ||
          (directory[otherId || '']?.username || '').toLowerCase().includes(q) ||
          (other?.email || '').toLowerCase().includes(q) ||
          (c.lastMessage?.text || '').toLowerCase().includes(q)
        );
      }

      return true;
      })
      .sort((a, b) => {
        const aPinned = a.pinnedBy?.includes(user?.uid || '') ? 1 : 0;
        const bPinned = b.pinnedBy?.includes(user?.uid || '') ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        return (
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
        );
      });
  }, [conversations, filterTab, searchQuery, user?.uid, displayNameFor, nicknameFor, directory, isSavedContact]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const time = date.getTime();

    if (time >= startOfToday) {
      return formatTime12(date);
    }
    if (time >= startOfToday - 86400000) return 'Yesterday';
    if (time >= startOfToday - 6 * 86400000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const updateChatListField = async (
    convId: string,
    field: 'pinnedBy' | 'mutedBy' | 'archivedBy',
    add: boolean
  ) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'conversations', convId), {
        [field]: add ? arrayUnion(user.uid) : arrayRemove(user.uid),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `conversations/${convId}`);
    }
  };

  const archivedCount = conversations.filter((c) => c.archivedBy?.includes(user?.uid || '')).length;
  const unreadChatCount = conversations.filter((c) => {
    if (c.archivedBy?.includes(user?.uid || '')) return false;
    const own = c.unreadCounts?.[user?.uid || ''] || 0;
    const fallback =
      c.lastMessage &&
      c.lastMessage.senderId !== user?.uid &&
      !c.lastMessage.readBy?.includes(user?.uid || '')
        ? 1
        : 0;
    return own > 0 || fallback > 0;
  }).length;

  const menuItems: {
    label: string;
    icon: React.ElementType;
    action: () => void | Promise<void>;
  }[] = [
    { label: 'New group', icon: Users, action: onOpenNewGroup },
    { label: 'Calls', icon: Phone, action: onOpenCalls },
    { label: 'Status', icon: CircleDashed, action: onOpenStatus },
    { label: 'Channels', icon: Radio, action: onOpenChannels },
    { label: 'Archived chats', icon: Archive, action: () => setFilterTab('archived') },
    { label: 'Settings', icon: Settings, action: onOpenSettings },
  ];

  if (!isInstalled) {
    menuItems.push({
      label: 'Install app',
      icon: Download,
      action: async () => {
        const outcome = await promptInstall();
        if (outcome === 'accepted') {
          addToast({
            title: 'Installing Chatly',
            message: 'Chatly will open like an app from your home screen.',
            type: 'success',
          });
        } else if (outcome === 'unavailable') {
          addToast({
            title: 'Install Chatly',
            message:
              'Open your browser menu and choose "Install app" or "Add to Home screen".',
            type: 'info',
          });
        }
      },
    });
  }

  const chipClass = (tab: FilterTab) =>
    `shrink-0 rounded-full px-2 py-1.5 text-[12px] font-medium transition ${
      filterTab === tab
        ? 'bg-[#d9fdd3] text-[#008069] dark:bg-[#103529] dark:text-[#06cf9c]'
        : 'bg-[var(--wa-panel-2)] text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]'
    }`;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--wa-panel)]">
      {/* Header */}
      <header className="flex h-[60px] shrink-0 items-center justify-between bg-[var(--wa-header)] px-4">
        <h1 className="text-[22px] font-bold tracking-tight text-[var(--wa-text)] md:hidden">
          Chatly
        </h1>

        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={onOpenSettings}
            className="relative shrink-0 rounded-full transition hover:opacity-90"
            title="Profile & settings"
          >
            <img
              src={profile?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid}`}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              onError={(e) => onAvatarError(e, user?.uid)}
            />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--wa-header)] bg-[#25d366]" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-tight text-[var(--wa-text)]">
              Chatly
            </h1>
            <p className="truncate text-[12px] text-[var(--wa-text-2)]">
              {profile?.isOnline ? 'online' : 'offline'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenStatus}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 md:hidden dark:text-[#aebac1] dark:hover:bg-white/5"
            title="Camera"
          >
            <Camera className="h-6 w-6" />
          </button>
          <button
            onClick={onOpenNewChat}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 md:flex dark:text-[#aebac1] dark:hover:bg-white/5"
            title="New chat"
          >
            <Plus className="h-6 w-6" />
          </button>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowHeaderMenu((v) => !v);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 dark:text-[#aebac1] dark:hover:bg-white/5"
              title="Menu"
            >
              <MoreVertical className="h-6 w-6" />
            </button>

            {showHeaderMenu && (
              <div
                className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-lg border border-[var(--wa-border)] bg-[var(--wa-panel)] py-1.5 shadow-xl animate-scale-in"
                onClick={(e) => e.stopPropagation()}
              >
                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setShowHeaderMenu(false);
                      item.action();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                  >
                    <item.icon className="h-[18px] w-[18px] text-[var(--wa-text-2)]" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="shrink-0 bg-[var(--wa-panel)] px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--wa-text-2)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            className="h-9 w-full rounded-lg bg-[var(--wa-panel-2)] pl-10 pr-3 text-[15px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)] focus:ring-1 focus:ring-[#00a884]/40"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-2.5 pb-2 no-scrollbar">
        <button className={chipClass('all')} onClick={() => setFilterTab('all')}>
          All
        </button>
        <button className={chipClass('unread')} onClick={() => setFilterTab('unread')}>
          Unread {unreadChatCount > 0 ? unreadChatCount : ''}
        </button>
        <button className={chipClass('favorites')} onClick={() => setFilterTab('favorites')}>
          Favorites
        </button>
        <button className={chipClass('groups')} onClick={() => setFilterTab('groups')}>
          Groups
        </button>
        <button
          onClick={onOpenNewChat}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--wa-border)] text-[var(--wa-text-2)] transition hover:bg-[var(--wa-hover)]"
          title="New chat"
        >
          <Plus className="h-4 w-4" />
        </button>
        {filterTab === 'archived' && (
          <button className={chipClass('archived')} onClick={() => setFilterTab('all')}>
            Archived {archivedCount > 0 ? `(${archivedCount})` : ''}
          </button>
        )}
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
        {filteredConversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <MessageCircle className="mb-3 h-10 w-10 text-[var(--wa-text-3)]" />
            <p className="text-sm font-medium text-[var(--wa-text)]">
              {searchQuery ? 'No chats found' : 'No chats yet'}
            </p>
            <p className="mt-1 max-w-[230px] text-xs leading-relaxed text-[var(--wa-text-2)]">
              {searchQuery
                ? 'Try a different name or message.'
                : 'Start a new chat and your conversations will appear here.'}
            </p>
            <button
              onClick={onOpenNewChat}
              className="mt-4 rounded-full bg-[#00a884] px-4 py-2 text-xs font-semibold text-white hover:bg-[#008069]"
            >
              New chat
            </button>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isGroup = conv.type === 'group';
            const otherId = conv.participantIds.find((id) => id !== user?.uid);
            const other = otherId ? conv.participantDetails?.[otherId] : null;
            const isSelected = activeConversationId === conv.id;

            const name = isGroup
              ? conv.groupInfo?.name || 'Group'
              : displayNameFor(otherId, other?.displayName || 'Chat');
            const photo = isGroup
              ? conv.groupInfo?.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${conv.id}`
              : photoFor(otherId, other?.photoURL);

            const last = conv.lastMessage;
            const mine = last?.senderId === user?.uid;
            const unreadFallback =
              last && last.senderId !== user?.uid && !last.readBy?.includes(user?.uid || '')
                ? 1
                : 0;
            const unread = conv.unreadCounts?.[user?.uid || ''] || unreadFallback;
            const isPinned = conv.pinnedBy?.includes(user?.uid || '');
            const isMuted = conv.mutedBy?.includes(user?.uid || '');
            const isArchived = conv.archivedBy?.includes(user?.uid || '');
            const lastRead = last?.readBy && last.readBy.length > 1;
            const lastDelivered = last?.deliveredTo && last.deliveredTo.length > 1;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuFor(conv.id);
                }}
                className={`group relative flex cursor-pointer items-center gap-3 px-4 py-3 transition ${
                  isSelected
                    ? 'bg-[var(--wa-active)]'
                    : 'hover:bg-[var(--wa-hover)]'
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={photo}
                    alt=""
                    className="h-[49px] w-[49px] rounded-full object-cover"
                    onError={(e) => onAvatarError(e, isGroup ? conv.id : otherId, isGroup ? 'identicon' : 'bottts')}
                  />
                  {!isGroup && other?.isOnline && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--wa-panel)] bg-[#25d366]" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-[17px] font-normal leading-[22px] text-[var(--wa-text)]">
                      {name}
                    </h3>
                    <span
                      className={`shrink-0 text-[12px] ${
                        unread > 0 ? 'font-medium text-[#00a884]' : 'text-[var(--wa-text-2)]'
                      }`}
                    >
                      {formatTime(last?.timestamp || conv.updatedAt)}
                    </span>
                  </div>

                    <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1 text-[14px] leading-5 text-[var(--wa-text-2)]">
                      {mine && last && lastRead ? (
                        <CheckCheck className="h-4 w-4 shrink-0 text-[#53bdeb]" />
                      ) : mine && last && lastDelivered ? (
                        <CheckCheck className="h-4 w-4 shrink-0 text-[var(--wa-text-3)]" />
                      ) : mine && last ? (
                        <Check className="h-4 w-4 shrink-0 text-[var(--wa-text-3)]" />
                      ) : null}
                      {isGroup && last && !mine && (
                        <span className="shrink-0 text-[var(--wa-text-2)]">
                          {last.senderId
                            ? `${displayNameFor(last.senderId, last.senderName || '')}: `
                            : ''}
                        </span>
                      )}
                      <span className="truncate">
                        {last?.text || 'No messages yet'}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isMuted && <BellOff className="h-4 w-4 text-[var(--wa-text-3)]" />}
                      {isPinned && <Pin className="h-4 w-4 text-[var(--wa-text-3)]" />}
                      {unread > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[12px] font-semibold leading-none text-white">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(menuFor === conv.id ? null : conv.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--wa-text-2)] opacity-0 transition hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
                        title="Chat options"
                      >
                        <MoreVertical className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                  </div>
                </div>

                {menuFor === conv.id && (
                  <div
                    className="absolute right-3 top-12 z-40 w-44 overflow-hidden rounded-lg border border-[var(--wa-border)] bg-[var(--wa-panel)] py-1.5 shadow-xl animate-scale-in"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        updateChatListField(conv.id, 'pinnedBy', !isPinned);
                        setMenuFor(null);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                    >
                      <Pin className="h-[18px] w-[18px] text-[var(--wa-text-2)]" />
                      {isPinned ? 'Unpin chat' : 'Pin chat'}
                    </button>
                    <button
                      onClick={() => {
                        updateChatListField(conv.id, 'mutedBy', !isMuted);
                        setMenuFor(null);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                    >
                      <BellOff className="h-[18px] w-[18px] text-[var(--wa-text-2)]" />
                      {isMuted ? 'Unmute notifications' : 'Mute notifications'}
                    </button>
                    <button
                      onClick={() => {
                        updateChatListField(conv.id, 'archivedBy', !isArchived);
                        setMenuFor(null);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                    >
                      {isArchived ? (
                        <ArchiveRestore className="h-[18px] w-[18px] text-[var(--wa-text-2)]" />
                      ) : (
                        <Archive className="h-[18px] w-[18px] text-[var(--wa-text-2)]" />
                      )}
                      {isArchived ? 'Unarchive chat' : 'Archive chat'}
                    </button>
                    <button
                      onClick={() => {
                        onSelectConversation(conv.id);
                        setMenuFor(null);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                    >
                      <Check className="h-[18px] w-[18px] text-[var(--wa-text-2)]" />
                      Open chat
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Compose FAB (mobile) */}
      <button
        onClick={onOpenNewChat}
        className="fixed bottom-[84px] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--wa-panel)] text-[var(--wa-text)] shadow-xl ring-1 ring-[var(--wa-border)] transition active:scale-95 md:hidden"
        title="New chat"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Footer hint */}
      <div className="hidden shrink-0 items-center justify-between border-t border-[var(--wa-border)] px-4 py-2.5 text-[11px] text-[var(--wa-text-2)] md:flex">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#25d366]" />
          Real-time synced
        </span>
        <button onClick={onOpenNewGroup} className="font-medium text-[#00a884] hover:underline">
          New group
        </button>
      </div>
    </div>
  );
}
