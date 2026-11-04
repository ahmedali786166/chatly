import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDirectory } from '../context/DirectoryContext';
import { formatTime12 } from '../lib/time';
import { onAvatarError } from '../lib/avatar';
import {
  Check,
  CheckCheck,
  MoreVertical,
  Reply,
  Star,
  Pin,
  Trash2,
  Edit2,
  Copy,
  FileText,
  Download,
  Play,
  Pause,
  Smile,
} from 'lucide-react';

interface MessageItemProps {
  message: Message;
  isMe: boolean;
  isGroup: boolean;
  onReply: (message: Message) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onDeleteForEveryone: (messageId: string) => void;
  onDeleteForMe: (messageId: string) => void;
  onStar: (messageId: string) => void;
  onPin: (messageId: string) => void;
  onEdit: (message: Message) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const SENDER_COLORS = [
  '#e542a3',
  '#7f66ff',
  '#00a884',
  '#ffa97a',
  '#53bdeb',
  '#ffbc38',
  '#a791ff',
  '#f15c6d',
];

const senderColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  return SENDER_COLORS[hash % SENDER_COLORS.length];
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function MessageItem({
  message,
  isMe,
  isGroup,
  onReply,
  onReaction,
  onDeleteForEveryone,
  onDeleteForMe,
  onStar,
  onPin,
  onEdit,
}: MessageItemProps) {
  const { user } = useAuth();
  const { displayNameFor, photoFor } = useDirectory();
  const [showMenu, setShowMenu] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  if (message.deletedFor?.includes(user?.uid || '')) return null;

  const isStarred = message.starredBy?.includes(user?.uid || '');
  const othersRead = message.readBy?.some((id) => id !== user?.uid);
  const othersDelivered = message.deliveredTo?.some((id) => id !== user?.uid);
  const isVoice = message.mediaType === 'voice' || message.mediaType === 'audio';

  const toggleAudio = () => {
    if (!message.mediaUrl) return;
    if (!audioRef.current) {
      const audio = new Audio(message.mediaUrl);
      audio.onloadedmetadata = () => setAudioDuration(audio.duration || 0);
      audio.ontimeupdate = () => setAudioProgress(audio.currentTime);
      audio.onended = () => {
        setPlaying(false);
        setAudioProgress(0);
      };
      audioRef.current = audio;
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const copyToClipboard = () => {
    if (message.text) navigator.clipboard.writeText(message.text).catch(() => {});
    setShowMenu(false);
  };

  const reactions = Object.entries(message.reactions || {}).filter(
    ([, users]) => users && users.length > 0
  );

  return (
    <div
      className={`group mb-1 flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
      onMouseLeave={() => {
        setShowMenu(false);
        setShowReactions(false);
      }}
    >
      <div className={`flex max-w-full items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isMe && isGroup && (
          <img
            src={photoFor(message.senderId, message.senderPhoto)}
            alt=""
            className="mb-1 h-7 w-7 shrink-0 rounded-full object-cover"
            onError={(e) => onAvatarError(e, message.senderId)}
          />
        )}

        <div className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
          {/* Hover reaction toolbar */}
          {showReactions && (
            <div
              className={`absolute -top-11 z-30 flex items-center gap-0.5 rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] px-1 py-1 shadow-lg animate-pop ${
                isMe ? 'right-0' : 'left-0'
              }`}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReaction(message.id, emoji);
                    setShowReactions(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-[var(--wa-hover)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Message bubble */}
          <div
            onDoubleClick={() => onReaction(message.id, '❤️')}
            className={`wa-bubble ${
              isMe ? 'wa-bubble-out' : 'wa-bubble-in'
            } px-2 py-1.5 ${message.mediaUrl ? 'p-1.5' : ''}`}
          >
            {!isMe && isGroup && (
              <div
                className="mb-0.5 px-0.5 text-[12.5px] font-semibold"
                style={{ color: senderColor(message.senderId) }}
              >
                {displayNameFor(message.senderId, message.senderName)}
              </div>
            )}

            {message.replyTo && (
              <div
                className={`mb-1.5 overflow-hidden rounded-md border-l-4 px-2 py-1 ${
                  isMe
                    ? 'border-[#00a884] bg-black/[0.06] dark:bg-black/20'
                    : 'border-[#7f66ff] bg-black/[0.04] dark:bg-black/20'
                }`}
              >
                <div className="text-[11.5px] font-semibold text-[#00a884]">
                  {message.replyTo.senderName}
                </div>
                <div className="truncate text-[12px] text-[var(--wa-text-2)]">
                  {message.replyTo.text}
                </div>
              </div>
            )}

            {message.isDeleted ? (
              <p className="px-1.5 py-1 text-[13.5px] italic text-[var(--wa-text-2)]">
                🚫 This message was deleted
              </p>
            ) : (
              <>
                {message.mediaUrl && message.mediaType === 'image' && (
                  <div className="mb-1 overflow-hidden rounded-md">
                    <img
                      src={message.mediaUrl}
                      alt="Shared photo"
                      className="h-auto max-h-72 w-auto max-w-[300px] cursor-pointer object-contain transition hover:opacity-95"
                      onClick={() => window.open(message.mediaUrl, '_blank')}
                    />
                  </div>
                )}

                {message.mediaUrl && message.mediaType === 'video' && (
                  <div className="mb-1 overflow-hidden rounded-md bg-black">
                    <video
                      src={message.mediaUrl}
                      controls
                      playsInline
                      className="max-h-80 w-full max-w-sm object-contain"
                    />
                  </div>
                )}

                {message.mediaUrl && isVoice && (
                  <div className="flex min-w-[210px] items-center gap-2 px-1 py-0.5">
                    <button
                      onClick={toggleAudio}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#008069]"
                    >
                      {playing ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="ml-0.5 h-4 w-4" />
                      )}
                    </button>

                    <div className="flex-1">
                      <div className="relative h-4">
                        <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/15 dark:bg-white/15" />
                        <div
                          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#00a884]"
                          style={{
                            width: `${
                              audioDuration > 0 ? Math.min(100, (audioProgress / audioDuration) * 100) : 0
                            }%`,
                          }}
                        />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10.5px] text-[var(--wa-text-2)]">
                        <span>{playing ? 'Playing' : 'Voice message'}</span>
                        <span className="tabular-nums">
                          {audioDuration > 0
                            ? formatDuration(playing ? audioProgress : audioDuration)
                            : '0:00'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {message.mediaUrl && message.mediaType === 'document' && (
                  <a
                    href={message.mediaUrl}
                    download={message.fileName || 'document'}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1 flex min-w-[210px] items-center justify-between gap-3 rounded-md bg-black/[0.06] px-2.5 py-2 transition hover:bg-black/[0.09] dark:bg-black/20 dark:hover:bg-black/30"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-6 w-6 shrink-0 text-[#7f66ff]" />
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-medium text-[var(--wa-text)]">
                          {message.fileName || 'Attachment'}
                        </div>
                        {message.fileSize ? (
                          <div className="text-[10.5px] text-[var(--wa-text-2)]">
                            {(message.fileSize / 1024).toFixed(1)} KB
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-[var(--wa-text-2)]" />
                  </a>
                )}

                {message.text && (
                  <p className="whitespace-pre-wrap break-words px-1 text-[14.2px] leading-[19px] text-[var(--wa-text)]">
                    {message.text}
                  </p>
                )}
              </>
            )}

            {/* Meta row */}
            <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10.5px] leading-none text-[var(--wa-text-2)]">
              {message.pinned && <Pin className="h-3 w-3" />}
              {isStarred && <Star className="h-3 w-3 fill-current text-[#ffbc38]" />}
              {message.isEdited && <span className="italic">edited</span>}
              <span className="tabular-nums">{formatTime12(message.createdAt)}</span>
              {isMe &&
                (othersRead ? (
                  <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                ) : othersDelivered ? (
                  <CheckCheck className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                ))}
            </div>
          </div>

          {/* Reaction chips */}
          {reactions.length > 0 && (
            <div className={`-mt-1.5 flex flex-wrap gap-1 px-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {reactions.map(([emoji, users]) => (
                <button
                  key={emoji}
                  onClick={() => onReaction(message.id, emoji)}
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] shadow-sm transition ${
                    users.includes(user?.uid || '')
                      ? 'border-[#00a884] bg-[#d9fdd3] text-[#008069] dark:bg-[#103529] dark:text-[#06cf9c]'
                      : 'border-[var(--wa-border)] bg-[var(--wa-panel)] text-[var(--wa-text-2)]'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="font-medium">{users.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Hover actions */}
          <div
            className={`absolute top-0 z-20 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 ${
              isMe ? '-left-9' : '-right-9'
            }`}
          >
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--wa-panel)] text-[var(--wa-text-2)] shadow-sm ring-1 ring-[var(--wa-border)] transition hover:text-[var(--wa-text)]"
              title="Message options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>

          {showMenu && (
            <div
              ref={menuRef}
              className={`absolute top-8 z-40 w-48 overflow-hidden rounded-lg border border-[var(--wa-border)] bg-[var(--wa-panel)] py-1.5 shadow-2xl animate-scale-in ${
                isMe ? 'right-0' : 'left-0'
              }`}
            >
              <button
                onClick={() => {
                  onReply(message);
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
              >
                <Reply className="h-4 w-4 text-[var(--wa-text-2)]" /> Reply
              </button>
              <button
                onClick={() => {
                  setShowReactions(true);
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
              >
                <Smile className="h-4 w-4 text-[var(--wa-text-2)]" /> React
              </button>
              <button
                onClick={copyToClipboard}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
              >
                <Copy className="h-4 w-4 text-[var(--wa-text-2)]" /> Copy
              </button>
              <button
                onClick={() => {
                  onStar(message.id);
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
              >
                <Star className="h-4 w-4 text-[var(--wa-text-2)]" />
                {isStarred ? 'Unstar message' : 'Star message'}
              </button>
              <button
                onClick={() => {
                  onPin(message.id);
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
              >
                <Pin className="h-4 w-4 text-[var(--wa-text-2)]" />
                {message.pinned ? 'Unpin message' : 'Pin message'}
              </button>

              {isMe && !message.isDeleted && !!message.text && (
                <button
                  onClick={() => {
                    onEdit(message);
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                >
                  <Edit2 className="h-4 w-4 text-[var(--wa-text-2)]" /> Edit
                </button>
              )}

              <div className="my-1 border-t border-[var(--wa-border)]" />

              <button
                onClick={() => {
                  onDeleteForMe(message.id);
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-danger)] hover:bg-[var(--wa-hover)]"
              >
                <Trash2 className="h-4 w-4" /> Delete for me
              </button>

              {isMe && !message.isDeleted && (
                <button
                  onClick={() => {
                    onDeleteForEveryone(message.id);
                    setShowMenu(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-danger)] hover:bg-[var(--wa-hover)]"
                >
                  <Trash2 className="h-4 w-4" /> Delete for everyone
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
