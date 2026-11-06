import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDirectory } from '../context/DirectoryContext';
import { formatTime12 } from '../lib/time';
import { onAvatarError } from '../lib/avatar';
import {
  Check,
  CheckCheck,
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
  Mic,
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

const WAVE_BARS = 30;
const SWIPE_LIMIT = 46;
const SWIPE_MAX = 76;

const waveformFor = (seedSource: string) => {
  let seed = 0;
  for (let i = 0; i < seedSource.length; i += 1) {
    seed = (seed * 31 + seedSource.charCodeAt(i)) % 9973;
  }
  const bars: number[] = [];
  for (let i = 0; i < WAVE_BARS; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    bars.push(5 + (seed % 15));
  }
  return bars;
};

interface MenuPoint {
  x: number;
  y: number;
}

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
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const swipeXRef = useRef(0);
  const pressRef = useRef<{
    x: number;
    y: number;
    axis: 'x' | 'y' | null;
    swiped: boolean;
  } | null>(null);
  const lastSwipeRef = useRef(false);
  const bars = useMemo(() => waveformFor(message.id), [message.id]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuPoint) return;
    const close = () => setMenuPoint(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuPoint]);

  if (message.deletedFor?.includes(user?.uid || '')) return null;

  const isStarred = message.starredBy?.includes(user?.uid || '');
  const othersRead = message.readBy?.some((id) => id !== user?.uid);
  const othersDelivered = message.deliveredTo?.some((id) => id !== user?.uid);
  const isVoice = message.mediaType === 'voice' || message.mediaType === 'audio';
  const totalDuration = audioDuration || message.duration || 0;

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

  const seekAudio = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || totalDuration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * totalDuration;
    setAudioProgress(ratio * totalDuration);
  };

  const copyToClipboard = () => {
    if (message.text) navigator.clipboard.writeText(message.text).catch(() => {});
    setMenuPoint(null);
  };

  const openMenu = (x: number, y: number) => {
    const width = 228;
    const height = 340;
    setMenuPoint({
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y - 24, window.innerHeight - height - 8)),
    });
    if (navigator.vibrate) navigator.vibrate(12);
  };

  const clearHold = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const target = event.target as HTMLElement;
    if (target.closest('button,a,video,audio,input,textarea,[data-no-hold]')) return;

    pressRef.current = { x: event.clientX, y: event.clientY, axis: null, swiped: false };
    lastSwipeRef.current = false;
    clearHold();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      const press = pressRef.current;
      if (!press || press.axis) return;
      press.axis = 'y';
      openMenu(event.clientX, event.clientY);
    }, 450);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;

    if (!press.axis) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        press.axis = 'x';
        clearHold();
      } else if (Math.abs(dy) > 8) {
        press.axis = 'y';
        clearHold();
      }
    }

    if (press.axis === 'x') {
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic/ended pointers cannot be captured; swiping still works.
      }
      if (dx > 0) {
        const next = Math.min(SWIPE_MAX, dx * 0.65);
        swipeXRef.current = next;
        setDragging(true);
        setSwipeX(next);
        press.swiped = true;
      } else {
        swipeXRef.current = 0;
        setSwipeX(0);
      }
    }
  };

  const endPress = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    clearHold();
    if (press?.swiped) {
      lastSwipeRef.current = true;
      window.setTimeout(() => {
        lastSwipeRef.current = false;
      }, 120);
      if (swipeXRef.current >= SWIPE_LIMIT) onReply(message);
    }
    swipeXRef.current = 0;
    setSwipeX(0);
    setDragging(false);
    pressRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer already released.
    }
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    clearHold();
    pressRef.current = null;
    openMenu(event.clientX, event.clientY);
  };

  const reactions = Object.entries(message.reactions || {}).filter(
    ([, users]) => users && users.length > 0
  );

  const playRatio =
    totalDuration > 0 ? Math.min(1, Math.max(0, audioProgress / totalDuration)) : 0;

  return (
    <div
      className={`mb-1 flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
      onClickCapture={(event) => {
        if (lastSwipeRef.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className={`flex w-full max-w-full items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isMe && isGroup && (
          <img
            src={photoFor(message.senderId, message.senderPhoto)}
            alt=""
            className="mb-1 h-7 w-7 shrink-0 rounded-full object-cover"
            onError={(e) => onAvatarError(e, message.senderId)}
          />
        )}

        <div
          className={`wa-message-col wa-swipe-col relative flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onContextMenu={handleContextMenu}
        >
          {/* Swipe-to-reply affordance */}
          <div
            className={`pointer-events-none absolute left-0 top-1/2 z-0 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#00a884] text-white transition-opacity ${
              swipeX > 0 ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transform: 'translateY(-50%)' }}
          >
            <Reply className="h-5 w-5" />
          </div>

          {/* Message bubble */}
          <div
            style={{
              transform: `translateX(${swipeX}px)`,
              transition: dragging ? 'none' : 'transform 0.18s ease-out',
            }}
            className={`wa-bubble ${isMe ? 'wa-bubble-out' : 'wa-bubble-in'} px-2 py-1.5 ${
              message.mediaUrl ? 'p-1.5' : ''
            }`}
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
                  <div className="flex min-w-[236px] max-w-[320px] items-center gap-2.5 px-1 py-1">
                    <button
                      onClick={toggleAudio}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#008069] active:scale-95"
                      title={playing ? 'Pause voice message' : 'Play voice message'}
                    >
                      {playing ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div
                        className="flex h-6 cursor-pointer items-center gap-[2px]"
                        onClick={seekAudio}
                        role="slider"
                        aria-label="Voice message progress"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(playRatio * 100)}
                        tabIndex={0}
                      >
                        {bars.map((height, index) => {
                          const played = index / WAVE_BARS <= playRatio;
                          return (
                            <span
                              key={index}
                              className={`w-[2px] shrink-0 rounded-full transition-colors ${
                                played ? 'bg-[#00a884]' : 'bg-black/20 dark:bg-white/25'
                              }`}
                              style={{ height: `${height}px` }}
                            />
                          );
                        })}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between pr-3 text-[10.5px] leading-none text-[var(--wa-text-2)]">
                        <span className="flex items-center gap-1">
                          <Mic className="h-2.5 w-2.5" />
                          {playing ? 'Playing' : 'Voice'}
                        </span>
                        <span className="tabular-nums">
                          {formatDuration(playing ? audioProgress : totalDuration)}
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

          {/* Long-press context menu */}
          {menuPoint && (
            <>
              <div
                className="fixed inset-0 z-[70]"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuPoint(null);
                }}
                onContextMenu={(event) => event.preventDefault()}
              />
              <div
                className="fixed z-[71] w-[228px] overflow-hidden rounded-xl border border-[var(--wa-border)] bg-[var(--wa-panel)] py-1.5 shadow-2xl animate-scale-in"
                style={{ left: menuPoint.x, top: menuPoint.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between px-2 pb-1.5">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onReaction(message.id, emoji);
                        setMenuPoint(null);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-[var(--wa-hover)]"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="mb-1 border-t border-[var(--wa-border)]" />

                <button
                  onClick={() => {
                    onReply(message);
                    setMenuPoint(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                >
                  <Reply className="h-4 w-4 text-[var(--wa-text-2)]" /> Reply
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
                    setMenuPoint(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                >
                  <Star className="h-4 w-4 text-[var(--wa-text-2)]" />
                  {isStarred ? 'Unstar message' : 'Star message'}
                </button>
                <button
                  onClick={() => {
                    onPin(message.id);
                    setMenuPoint(null);
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
                      setMenuPoint(null);
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
                    setMenuPoint(null);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-danger)] hover:bg-[var(--wa-hover)]"
                >
                  <Trash2 className="h-4 w-4" /> Delete for me
                </button>

                {isMe && !message.isDeleted && (
                  <button
                    onClick={() => {
                      onDeleteForEveryone(message.id);
                      setMenuPoint(null);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--wa-danger)] hover:bg-[var(--wa-hover)]"
                  >
                    <Trash2 className="h-4 w-4" /> Delete for everyone
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
