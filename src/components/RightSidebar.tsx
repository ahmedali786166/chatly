import React, { useState } from 'react';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Conversation, Message } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  X,
  Bell,
  BellOff,
  Star,
  FileText,
  Image as ImageIcon,
  UserX,
  UserCheck,
  ShieldAlert,
  ExternalLink,
  Lock,
  Users,
  CheckCircle2,
} from 'lucide-react';

interface RightSidebarProps {
  conversation: Conversation;
  messages: Message[];
  onClose: () => void;
}

export function RightSidebar({ conversation, messages, onClose }: RightSidebarProps) {
  const { user, profile } = useAuth();
  const { addToast } = useNotification();
  const [activeMediaTab, setActiveMediaTab] = useState<'media' | 'docs' | 'starred'>('media');

  const isGroup = conversation.type === 'group';
  const otherUserId = conversation.participantIds.find((id) => id !== user?.uid);
  const otherUserDetail = otherUserId ? conversation.participantDetails?.[otherUserId] : null;

  const isMuted = !!conversation.mutedBy?.includes(user?.uid || '');
  const isBlocked = !!otherUserId && !!profile?.blockedUsers?.includes(otherUserId);

  const mediaMessages = messages.filter(
    (m) => m.mediaUrl && (m.mediaType === 'image' || m.mediaType === 'video')
  );
  const docMessages = messages.filter((m) => m.mediaUrl && m.mediaType === 'document');
  const starredMessages = messages.filter((m) => m.starredBy?.includes(user?.uid || ''));

  const toggleMute = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        mutedBy: isMuted ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      addToast({
        title: isMuted ? 'Notifications unmuted' : 'Notifications muted',
        message: isMuted ? 'You will get alerts for this chat again.' : 'This chat is now muted.',
        type: 'success',
      });
    } catch {
      addToast({ title: 'Update failed', message: 'Please try again.', type: 'error' });
    }
  };

  const toggleBlock = async () => {
    if (!otherUserId || !profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        blockedUsers: isBlocked ? arrayRemove(otherUserId) : arrayUnion(otherUserId),
      });
      addToast({
        title: isBlocked ? 'Contact unblocked' : 'Contact blocked',
        message: isBlocked
          ? 'You can message this contact again.'
          : 'This contact can no longer message you.',
        type: isBlocked ? 'success' : 'info',
      });
    } catch {
      addToast({ title: 'Update failed', message: 'Please try again.', type: 'error' });
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        onClick={onClose}
        aria-hidden
      />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l border-[var(--wa-border)] bg-[var(--wa-panel)] shadow-2xl animate-slide-left lg:static lg:z-auto lg:w-[380px] lg:shrink-0 lg:shadow-none xl:w-[400px]">
        <header className="flex h-[60px] shrink-0 items-center gap-4 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4">
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--wa-text-2)] hover:bg-black/5 dark:hover:bg-white/5"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-[16px] font-medium text-[var(--wa-text)]">
            {isGroup ? 'Group info' : 'Contact info'}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Profile */}
          <div className="flex flex-col items-center bg-[var(--wa-panel)] px-6 pb-6 pt-8">
            <img
              src={
                isGroup
                  ? conversation.groupInfo?.photoURL ||
                    `https://api.dicebear.com/7.x/identicon/svg?seed=${conversation.id}`
                  : otherUserDetail?.photoURL ||
                    `https://api.dicebear.com/7.x/bottts/svg?seed=${otherUserId}`
              }
              alt=""
              className="h-40 w-40 rounded-full object-cover shadow-sm"
            />

            <h3 className="mt-4 text-center text-[20px] font-normal text-[var(--wa-text)]">
              {isGroup ? conversation.groupInfo?.name : otherUserDetail?.displayName || 'Contact'}
            </h3>

            <p className="mt-0.5 text-[13px] text-[var(--wa-text-2)]">
              {isGroup ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Group · {conversation.participantIds.length} members
                </span>
              ) : otherUserDetail?.isOnline ? (
                'online'
              ) : (
                otherUserDetail?.email || 'offline'
              )}
            </p>

            {isGroup && conversation.groupInfo?.description && (
              <p className="mt-3 w-full rounded-lg bg-[var(--wa-panel-2)] p-3 text-center text-[12.5px] leading-relaxed text-[var(--wa-text-2)]">
                {conversation.groupInfo.description}
              </p>
            )}

            {!isGroup && otherUserDetail?.email && otherUserDetail?.isOnline && (
              <p className="mt-1 text-[12px] text-[var(--wa-text-3)]">{otherUserDetail.email}</p>
            )}
          </div>

          <div className="h-2 bg-[var(--wa-panel-2)]" />

          {/* Actions */}
          <div className="border-b border-[var(--wa-border)] px-2 py-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleMute}
                className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
              >
                {isMuted ? (
                  <BellOff className="h-5 w-5 text-[var(--wa-text-2)]" />
                ) : (
                  <Bell className="h-5 w-5 text-[var(--wa-text-2)]" />
                )}
                <span className="text-[12px] font-medium">{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button
                onClick={() => setActiveMediaTab('starred')}
                className="flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
              >
                <Star className="h-5 w-5 text-[#ffbc38]" />
                <span className="text-[12px] font-medium">Starred ({starredMessages.length})</span>
              </button>
            </div>
          </div>

          {/* Group members */}
          {isGroup && (
            <div className="border-b border-[var(--wa-border)] px-4 py-4">
              <h4 className="mb-3 text-[13px] font-semibold text-[var(--wa-text-2)]">
                {conversation.participantIds.length} members
              </h4>
              <div className="space-y-1">
                {conversation.participantIds.map((memberId) => {
                  const detail = conversation.participantDetails?.[memberId];
                  const isAdmin = conversation.groupInfo?.adminIds?.includes(memberId);
                  const me = memberId === user?.uid;

                  return (
                    <div
                      key={memberId}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-[var(--wa-hover)]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={detail?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${memberId}`}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-[var(--wa-text)]">
                            {detail?.displayName || (me ? 'You' : 'Member')}
                            {me && <span className="ml-1 text-[11px] font-normal text-[var(--wa-text-2)]">(You)</span>}
                          </div>
                          <div className="text-[11.5px] text-[var(--wa-text-2)]">
                            {detail?.isOnline ? 'online' : 'offline'}
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <span className="rounded bg-[#d9fdd3] px-1.5 py-0.5 text-[10px] font-semibold text-[#008069] dark:bg-[#103529] dark:text-[#06cf9c]">
                          Admin
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Media / docs / starred */}
          <div className="border-b border-[var(--wa-border)] px-4 py-4">
            <div className="mb-3 flex items-center gap-4 border-b border-[var(--wa-border)]">
              {[
                { id: 'media' as const, label: `Media ${mediaMessages.length}` },
                { id: 'docs' as const, label: `Docs ${docMessages.length}` },
                { id: 'starred' as const, label: 'Starred' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveMediaTab(tab.id)}
                  className={`-mb-px border-b-2 pb-2 text-[12.5px] font-medium transition ${
                    activeMediaTab === tab.id
                      ? 'border-[#00a884] text-[#00a884]'
                      : 'border-transparent text-[var(--wa-text-2)] hover:text-[var(--wa-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeMediaTab === 'media' && (
              <div className="grid grid-cols-3 gap-1.5">
                {mediaMessages.length === 0 ? (
                  <div className="col-span-3 py-6 text-center text-[12px] text-[var(--wa-text-2)]">
                    No shared photos or videos
                  </div>
                ) : (
                  mediaMessages.map((m) => (
                    <a
                      key={m.id}
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square overflow-hidden rounded-md bg-[var(--wa-panel-2)]"
                    >
                      {m.mediaType === 'video' ? (
                        <div className="flex h-full w-full items-center justify-center text-[var(--wa-text-2)]">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      ) : (
                        <img src={m.mediaUrl} alt="" className="h-full w-full object-cover transition hover:opacity-90" />
                      )}
                    </a>
                  ))
                )}
              </div>
            )}

            {activeMediaTab === 'docs' && (
              <div className="space-y-1">
                {docMessages.length === 0 ? (
                  <div className="py-6 text-center text-[12px] text-[var(--wa-text-2)]">No documents shared</div>
                ) : (
                  docMessages.map((m) => (
                    <a
                      key={m.id}
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={m.fileName || 'document'}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-[var(--wa-hover)]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-[#7f66ff]" />
                        <span className="truncate text-[12.5px] text-[var(--wa-text)]">
                          {m.fileName || 'Attachment'}
                        </span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--wa-text-2)]" />
                    </a>
                  ))
                )}
              </div>
            )}

            {activeMediaTab === 'starred' && (
              <div className="space-y-1.5">
                {starredMessages.length === 0 ? (
                  <div className="py-6 text-center text-[12px] text-[var(--wa-text-2)]">
                    No starred messages yet
                  </div>
                ) : (
                  starredMessages.map((m) => (
                    <div key={m.id} className="rounded-lg bg-[var(--wa-panel-2)] px-3 py-2">
                      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#00a884]">
                        <Star className="h-3 w-3 fill-current" />
                        {m.senderName}
                      </div>
                      <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--wa-text)]">
                        {m.text || m.fileName || 'Attachment'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Privacy */}
          <div className="px-2 py-3">
            {!isGroup && (
              <button
                onClick={toggleBlock}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[13.5px] font-medium transition hover:bg-[var(--wa-hover)] ${
                  isBlocked ? 'text-[#00a884]' : 'text-[var(--wa-danger)]'
                }`}
              >
                {isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                {isBlocked ? 'Unblock contact' : 'Block contact'}
              </button>
            )}

            <button
              onClick={() =>
                addToast({
                  title: 'Report received',
                  message: 'Thanks. This chat has been flagged for review.',
                  type: 'info',
                })
              }
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-[13.5px] font-medium text-[#ff9f43] transition hover:bg-[var(--wa-hover)]"
            >
              <ShieldAlert className="h-4 w-4" />
              Report {isGroup ? 'group' : 'contact'}
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 px-6 pb-6 pt-2 text-center text-[11.5px] text-[var(--wa-text-3)]">
            <Lock className="h-3.5 w-3.5" />
            <span>Messages are end-to-end encrypted</span>
          </div>

          {isGroup && conversation.groupInfo?.adminIds?.includes(user?.uid || '') && (
            <div className="flex items-center justify-center gap-1.5 pb-6 text-[11px] text-[var(--wa-text-3)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              You are an admin of this group
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
