import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  limit,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useDirectory } from '../context/DirectoryContext';
import { useCall } from '../context/CallContext';
import { useNotification } from '../context/NotificationContext';
import { Conversation, Message, MediaType } from '../types';
import { MessageItem } from './MessageItem';
import { ProfilePhotoViewer } from './ProfilePhotoViewer';
import { ContactDialog } from './ContactDialog';
import { formatTime12, startOfToday, isSameDay, toDate } from '../lib/time';
import { onAvatarError } from '../lib/avatar';
import { uploadFile } from '../services/storage';
import { sounds } from '../services/sound';
import { notifyRecipients } from '../services/push';
import {
  Phone,
  Video,
  Search,
  MoreVertical,
  Paperclip,
  Smile,
  Mic,
  Send,
  X,
  ChevronDown,
  Image as ImageIcon,
  FileText,
  Square,
  ArrowLeft,
  Lock,
  Trash2,
  UserPlus,
  Loader2,
  Clock,
} from 'lucide-react';

interface ChatPanelProps {
  conversation: Conversation;
  onToggleRightSidebar: () => void;
  isRightSidebarOpen: boolean;
  onBackMobile?: () => void;
}

interface PendingUpload {
  id: string;
  docId?: string;
  mediaType: MediaType;
  fileName: string;
  fileSize: number;
  previewUrl?: string;
  progress: number;
}

const pendingText = (mediaType: MediaType) => {
  if (mediaType === 'image') return 'Sending photo…';
  if (mediaType === 'video') return 'Sending video…';
  if (mediaType === 'voice' || mediaType === 'audio') return 'Sending voice message…';
  return 'Sending document…';
};

const PENDING_WAVE = Array.from({ length: 30 }, (_, i) => 6 + ((i * 7) % 14));

function PendingMessage({ item }: { item: PendingUpload }) {
  return (
    <div className="mb-1 flex flex-col items-end">
      <div className="flex w-full max-w-full items-end justify-end">
        <div className="wa-message-col flex flex-col items-end">
          <div className="wa-bubble wa-bubble-out p-1.5">
            {item.mediaType === 'image' && item.previewUrl && (
              <div className="relative mb-1 overflow-hidden rounded-md">
                <img
                  src={item.previewUrl}
                  alt="Sending"
                  className="h-auto max-h-72 w-auto max-w-[300px] object-contain opacity-80"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 px-3 text-center text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-[12px] font-medium">
                    {pendingText(item.mediaType)} {item.progress}%
                  </span>
                </div>
              </div>
            )}

            {item.mediaType === 'video' && item.previewUrl && (
              <div className="relative mb-1 overflow-hidden rounded-md bg-black">
                <video
                  src={item.previewUrl}
                  muted
                  playsInline
                  className="max-h-80 w-full max-w-sm object-contain opacity-80"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 px-3 text-center text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-[12px] font-medium">
                    {pendingText(item.mediaType)} {item.progress}%
                  </span>
                </div>
              </div>
            )}

            {(item.mediaType === 'voice' || item.mediaType === 'audio') && (
              <div className="flex min-w-[236px] items-center gap-2.5 px-1 py-1">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884]/70 text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex h-6 items-center gap-[2px]">
                    {PENDING_WAVE.map((height, index) => (
                      <span
                        key={index}
                        className="w-[2px] shrink-0 rounded-full bg-black/20 dark:bg-white/25"
                        style={{ height: `${height}px` }}
                      />
                    ))}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10.5px] leading-none text-[var(--wa-text-2)]">
                    <span className="truncate">
                      {pendingText(item.mediaType)} {item.progress}%
                    </span>
                    <span>{Math.round(item.fileSize / 1024)} KB</span>
                  </div>
                </div>
              </div>
            )}

            {item.mediaType === 'document' && (
              <div className="mb-1 flex min-w-[230px] items-center gap-2.5 rounded-md bg-black/[0.06] px-2.5 py-2 dark:bg-black/20">
                <FileText className="h-6 w-6 shrink-0 text-[#7f66ff]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-[var(--wa-text)]">
                    {item.fileName}
                  </div>
                  <div className="text-[10.5px] text-[var(--wa-text-2)]">
                    {pendingText(item.mediaType)} {item.progress}%
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                    <div
                      className="h-full rounded-full bg-[#00a884] transition-all duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--wa-text-2)]" />
              </div>
            )}

            <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10.5px] leading-none text-[var(--wa-text-2)]">
              <Clock className="h-3 w-3" />
              <span className="tabular-nums">{formatTime12(new Date())}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMOJI_LIST = [
  '😀', '😂', '😍', '😊', '😘', '😎', '🤔', '😅', '😭', '😡',
  '👍', '👏', '🙏', '💪', '🙌', '👋', '🔥', '❤️', '💯', '🎉',
  '✨', '🌟', '🚀', '💡', '👀', '🎁', '☀️', '🌙', '☕', '⚽',
];

const sameDay = (a: Date, b: Date) => isSameDay(a, b);

const formatDayLabel = (value: unknown) => {
  const date = toDate(value);
  if (!date) return '';
  const now = new Date();
  const dayStart = startOfToday(now);
  const time = date.getTime();
  if (isSameDay(date, now)) return 'Today';
  if (time >= dayStart - 86400000) return 'Yesterday';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatLastSeen = (value?: unknown) => {
  const date = toDate(value);
  if (!date) return 'offline';
  const dayStart = startOfToday();
  const time = date.getTime();
  if (time >= dayStart - 86400000) {
    return `last seen ${formatTime12(date)}`;
  }
  return `last seen ${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
};

export function ChatPanel({
  conversation,
  onToggleRightSidebar,
  isRightSidebarOpen,
  onBackMobile,
}: ChatPanelProps) {
  const { user, profile } = useAuth();
  const { startCall } = useCall();
  const { addToast } = useNotification();
  const {
    directory,
    displayNameFor,
    photoFor,
    isSavedContact,
    saveContactFor,
    removeContactFor,
    nicknameFor,
  } = useDirectory();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isVisible, setIsVisible] = useState(
    () => document.visibilityState === 'visible'
  );

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingSecondsRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const typingTimeoutRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);

  const isGroup = conversation.type === 'group';
  const otherUserId = conversation.participantIds.find((id) => id !== user?.uid);
  const otherDetail = otherUserId ? conversation.participantDetails?.[otherUserId] : null;
  const otherUser = otherUserId ? directory[otherUserId] : undefined;
  const otherName = displayNameFor(otherUserId, otherDetail?.displayName || 'Contact');
  const otherPhoto = photoFor(otherUserId, otherDetail?.photoURL);
  const isBlocked = !!otherUserId && !!profile?.blockedUsers?.includes(otherUserId);

  const typingUsers = Object.entries(conversation.typingUsers || {})
    .filter(([uid, active]) => active && uid !== user?.uid)
    .map(([uid]) =>
      displayNameFor(uid, conversation.participantDetails?.[uid]?.displayName || 'Someone')
    );
  const isOtherTyping = typingUsers.length > 0;

  // Track connectivity and tab visibility. Receipts must never be written
  // while offline (Firestore would queue them and flush later, showing the
  // sender "delivered/seen" even though the user never opened the chat).
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleVisibility = () => setIsVisible(document.visibilityState === 'visible');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Messages stream
  useEffect(() => {
    const messagesCol = collection(db, 'conversations', conversation.id, 'messages');
    const q = query(messagesCol, orderBy('createdAt', 'asc'), limit(250));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Message[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Message));
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `conversations/${conversation.id}/messages`);
      }
    );

    return () => unsubscribe();
  }, [conversation.id]);

  // Delivery receipts: only while the device is truly online.
  useEffect(() => {
    if (!user || !isOnline) return;

    const last = conversation.lastMessage;
    if (
      last &&
      last.senderId !== user.uid &&
      !last.deliveredTo?.includes(user.uid)
    ) {
      updateDoc(doc(db, 'conversations', conversation.id), {
        'lastMessage.deliveredTo': arrayUnion(user.uid),
      }).catch(() => {});
    }

    const pending = messages.filter(
      (m) => m.senderId !== user.uid && !m.deliveredTo?.includes(user.uid)
    );
    if (pending.length === 0) return;
    const batch = writeBatch(db);
    pending.forEach((m) => {
      batch.update(doc(db, 'conversations', conversation.id, 'messages', m.id), {
        deliveredTo: arrayUnion(user.uid),
      });
    });
    batch.commit().catch(() => {});
  }, [messages, isOnline, conversation.id, conversation.lastMessage, user]);

  // Read receipts: only while online AND the chat is actually on screen.
  useEffect(() => {
    if (!user || !isOnline || !isVisible) return;
    if (profile?.readReceipts === false) return;
    const pending = messages.filter(
      (m) => m.senderId !== user.uid && !m.readBy?.includes(user.uid)
    );
    if (pending.length === 0) return;
    const batch = writeBatch(db);
    pending.forEach((m) => {
      batch.update(doc(db, 'conversations', conversation.id, 'messages', m.id), {
        readBy: arrayUnion(user.uid),
        deliveredTo: arrayUnion(user.uid),
      });
    });
    batch.commit().catch(() => {});
  }, [messages, isOnline, isVisible, conversation.id, profile?.readReceipts, user]);

  // Clear unread badge only when the chat is open and visible.
  useEffect(() => {
    if (!user || !isOnline || !isVisible) return;
    const unread = conversation.unreadCounts?.[user.uid];
    const lastUnread =
      conversation.lastMessage && !conversation.lastMessage.readBy?.includes(user.uid);

    if (unread || lastUnread) {
      const updates: Record<string, unknown> = { [`unreadCounts.${user.uid}`]: 0 };
      if (conversation.lastMessage) {
        if (profile?.readReceipts !== false) {
          updates['lastMessage.readBy'] = arrayUnion(user.uid);
        }
        updates['lastMessage.deliveredTo'] = arrayUnion(user.uid);
      }
      updateDoc(doc(db, 'conversations', conversation.id), updates).catch(() => {});
    }
  }, [
    conversation.id,
    conversation.unreadCounts?.[user?.uid || ''],
    conversation.lastMessage?.timestamp,
    isOnline,
    isVisible,
    profile?.readReceipts,
    user,
  ]);

  // Auto-scroll on new messages. Scroll the message pane itself so mobile
  // browsers never scroll the whole page (which hides the chat header).
  useEffect(() => {
    const container = scrollContainerRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending.length]);

  // Drop the optimistic bubble once Firestore delivers the real message.
  useEffect(() => {
    if (pending.length === 0 || messages.length === 0) return;
    const arrivedIds = new Set(messages.map((m) => m.id));
    const arrived = pending.filter((item) => item.docId && arrivedIds.has(item.docId));
    if (arrived.length === 0) return;
    arrived.forEach((item) => {
      if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    });
    setPending((prev) => prev.filter((item) => !arrived.some((a) => a.id === item.id)));
  }, [messages, pending]);

  // Reset draft / reply state when switching chats
  useEffect(() => {
    setText('');
    setReplyingTo(null);
    setEditingMessage(null);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setSearchQuery('');
    setShowSearchBar(false);
    setPending((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    if (typingActiveRef.current && user) {
      updateDoc(doc(db, 'conversations', conversation.id), {
        [`typingUsers.${user.uid}`]: false,
      }).catch(() => {});
      typingActiveRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Typing indicator cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      if (typingActiveRef.current && user) {
        updateDoc(doc(db, 'conversations', conversation.id), {
          [`typingUsers.${user.uid}`]: false,
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTyping = (active: boolean) => {
    if (!user || typingActiveRef.current === active) return;
    typingActiveRef.current = active;
    updateDoc(doc(db, 'conversations', conversation.id), {
      [`typingUsers.${user.uid}`]: active,
    }).catch(() => {});
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (!user) return;
    setTyping(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => setTyping(false), 2200);
  };

  const appendUnreadForOthers = () => {
    const updates: Record<string, unknown> = {};
    conversation.participantIds
      .filter((id) => id !== user?.uid)
      .forEach((id) => {
        updates[`unreadCounts.${id}`] = increment(1);
      });
    return updates;
  };

  const sendPushPing = async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await notifyRecipients({ conversationId: conversation.id }, idToken);
    } catch (error) {
      console.warn('Push ping failed:', error);
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 250);
  };

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !profile) return;

    if (editingMessage) {
      const trimmed = text.trim();
      if (!trimmed) return;
      try {
        await updateDoc(
          doc(db, 'conversations', conversation.id, 'messages', editingMessage.id),
          { text: trimmed, isEdited: true, updatedAt: new Date().toISOString() }
        );
        setEditingMessage(null);
        setText('');
        setTyping(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'message');
        addToast({ title: 'Could not edit', message: 'Please try again.', type: 'error' });
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setText('');
    setShowEmojiPicker(false);
    setTyping(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const now = new Date().toISOString();
      const messagesCol = collection(db, 'conversations', conversation.id, 'messages');

      await addDoc(messagesCol, {
        conversationId: conversation.id,
        senderId: user.uid,
        senderName: profile.displayName,
        senderPhoto: profile.photoURL,
        text: trimmed,
        readBy: [user.uid],
        deliveredTo: [user.uid],
        createdAt: now,
        ...(replyingTo
          ? {
              replyTo: {
                id: replyingTo.id,
                senderName: replyingTo.senderName,
                text: replyingTo.text ? replyingTo.text.slice(0, 120) : 'Attachment',
              },
            }
          : {}),
      });

      await updateDoc(doc(db, 'conversations', conversation.id), {
        lastMessage: {
          text: trimmed,
          senderId: user.uid,
          senderName: profile.displayName,
          timestamp: now,
          readBy: [user.uid],
        },
        updatedAt: now,
        ...appendUnreadForOthers(),
      });

      if (profile.soundEnabled !== false) sounds.playSent();
      void sendPushPing();
      setReplyingTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'messages');
      addToast({ title: 'Message not sent', message: 'Check your connection and try again.', type: 'error' });
      setText(trimmed);
    }
  };

  const handleFileAttachment = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'media' | 'document'
  ) => {
    if (!e.target.files?.length || !user || !profile) return;
    const file = e.target.files[0];
    e.target.value = '';
    setShowAttachMenu(false);

    const mediaType: MediaType =
      kind === 'document'
        ? 'document'
        : file.type.startsWith('video')
        ? 'video'
        : file.type.startsWith('image')
        ? 'image'
        : 'document';

    // Show the attachment in the chat right away, WhatsApp-style, then swap it
    // for the Firestore message once the upload finishes.
    const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const previewUrl = mediaType === 'document' ? undefined : URL.createObjectURL(file);
    setPending((prev) => [
      ...prev,
      {
        id: localId,
        mediaType,
        fileName: file.name,
        fileSize: file.size,
        previewUrl,
        progress: 0,
      },
    ]);

    const patchPending = (patch: Partial<PendingUpload>) => {
      setPending((prev) =>
        prev.map((item) => (item.id === localId ? { ...item, ...patch } : item))
      );
    };

    try {
      const url = await uploadFile(
        file,
        `chat_media/${conversation.id}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`,
        (progress) => patchPending({ progress })
      );

      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, 'conversations', conversation.id, 'messages'), {
        conversationId: conversation.id,
        senderId: user.uid,
        senderName: profile.displayName,
        senderPhoto: profile.photoURL,
        text: '',
        mediaUrl: url,
        mediaType,
        fileName: file.name,
        fileSize: file.size,
        readBy: [user.uid],
        deliveredTo: [user.uid],
        createdAt: now,
      });
      patchPending({ docId: docRef.id, progress: 100 });

      const preview =
        mediaType === 'image'
          ? '📷 Photo'
          : mediaType === 'video'
          ? '🎥 Video'
          : `📄 ${file.name}`;

      await updateDoc(doc(db, 'conversations', conversation.id), {
        lastMessage: {
          text: preview,
          senderId: user.uid,
          senderName: profile.displayName,
          timestamp: now,
          readBy: [user.uid],
        },
        updatedAt: now,
        ...appendUnreadForOthers(),
      });

      if (profile.soundEnabled !== false) sounds.playSent();
      void sendPushPing();
    } catch (err) {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      setPending((prev) => prev.filter((item) => item.id !== localId));
      addToast({
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Could not send this file.',
        type: 'error',
      });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingSecondsRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const seconds = recordingSecondsRef.current;
        if (seconds < 1 || !user || !profile) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const previewUrl = URL.createObjectURL(audioBlob);
        setPending((prev) => [
          ...prev,
          {
            id: localId,
            mediaType: 'voice',
            fileName: `voice-note-${seconds}s.webm`,
            fileSize: audioBlob.size,
            previewUrl,
            progress: 0,
          },
        ]);

        const patchPending = (patch: Partial<PendingUpload>) => {
          setPending((prev) =>
            prev.map((item) => (item.id === localId ? { ...item, ...patch } : item))
          );
        };

        try {
          const audioUrl = await uploadFile(
            audioBlob,
            `voice_notes/${conversation.id}/${Date.now()}.webm`,
            (progress) => patchPending({ progress })
          );
          const now = new Date().toISOString();

          const docRef = await addDoc(collection(db, 'conversations', conversation.id, 'messages'), {
            conversationId: conversation.id,
            senderId: user.uid,
            senderName: profile.displayName,
            senderPhoto: profile.photoURL,
            text: '',
            mediaUrl: audioUrl,
            mediaType: 'voice',
            fileName: `voice-note-${seconds}s.webm`,
            fileSize: audioBlob.size,
            duration: seconds,
            readBy: [user.uid],
            deliveredTo: [user.uid],
            createdAt: now,
          });
          patchPending({ docId: docRef.id, progress: 100 });

          await updateDoc(doc(db, 'conversations', conversation.id), {
            lastMessage: {
              text: '🎤 Voice message',
              senderId: user.uid,
              senderName: profile.displayName,
              timestamp: now,
              readBy: [user.uid],
            },
            updatedAt: now,
            ...appendUnreadForOthers(),
          });

          if (profile.soundEnabled !== false) sounds.playSent();
          void sendPushPing();
        } catch (err) {
          URL.revokeObjectURL(previewUrl);
          setPending((prev) => prev.filter((item) => item.id !== localId));
          addToast({
            title: 'Voice note failed',
            message: err instanceof Error ? err.message : 'Could not send the recording.',
            type: 'error',
          });
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);
    } catch {
      addToast({
        title: 'Microphone blocked',
        message: 'Allow microphone access to record voice messages.',
        type: 'error',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      recordingSecondsRef.current = 0;
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    try {
      const msgRef = doc(db, 'conversations', conversation.id, 'messages', messageId);
      const targetMsg = messages.find((m) => m.id === messageId);
      const reacted = targetMsg?.reactions?.[emoji]?.includes(user.uid);
      await updateDoc(msgRef, {
        [`reactions.${emoji}`]: reacted ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'reaction');
    }
  };

  const handleDeleteForEveryone = async (messageId: string) => {
    try {
      await updateDoc(doc(db, 'conversations', conversation.id, 'messages', messageId), {
        isDeleted: true,
        text: '',
        mediaUrl: null,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'message');
    }
  };

  const handleDeleteForMe = async (messageId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'conversations', conversation.id, 'messages', messageId), {
        deletedFor: arrayUnion(user.uid),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'message');
    }
  };

  const handleStar = async (messageId: string) => {
    if (!user) return;
    try {
      const target = messages.find((m) => m.id === messageId);
      const starred = target?.starredBy?.includes(user.uid);
      await updateDoc(doc(db, 'conversations', conversation.id, 'messages', messageId), {
        starredBy: starred ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'message');
    }
  };

  const handlePin = async (messageId: string) => {
    try {
      const target = messages.find((m) => m.id === messageId);
      await updateDoc(doc(db, 'conversations', conversation.id, 'messages', messageId), {
        pinned: !target?.pinned,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'message');
    }
  };

  const handleUnblock = async () => {
    if (!otherUserId || !profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), { blockedUsers: arrayRemove(otherUserId) });
      addToast({ title: 'Contact unblocked', message: 'You can message this contact again.', type: 'success' });
    } catch {
      addToast({ title: 'Could not unblock', message: 'Please try again.', type: 'error' });
    }
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.text?.toLowerCase().includes(q) ||
        m.fileName?.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  const wallpaperClass =
    profile?.chatWallpaper === 'plain'
      ? 'wa-wallpaper-plain'
      : profile?.chatWallpaper === 'gradient'
      ? 'wa-wallpaper-gradient-light'
      : 'wa-wallpaper';

  const statusText = isGroup
    ? `${conversation.participantIds.length} members`
    : isOtherTyping
    ? 'typing...'
    : otherUser?.isOnline ?? otherDetail?.isOnline
    ? 'online'
    : formatLastSeen(otherUser?.lastSeen || otherDetail?.lastSeen);

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-[var(--wa-chat)]">
      {/* Chat header */}
      <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center justify-between border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--wa-text-2)] hover:bg-black/5 md:hidden dark:hover:bg-white/5"
              title="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => (isGroup ? onToggleRightSidebar() : setShowPhoto(true))}
              className="relative shrink-0 rounded-full transition hover:opacity-90"
              title="View profile photo"
            >
              <img
                src={
                  isGroup
                    ? conversation.groupInfo?.photoURL ||
                      `https://api.dicebear.com/7.x/identicon/svg?seed=${conversation.id}`
                    : otherPhoto || `https://api.dicebear.com/7.x/bottts/svg?seed=${otherUserId}`
                }
                alt=""
                className="h-10 w-10 rounded-full object-cover"
                onError={(e) => onAvatarError(e, otherUserId)}
              />
              {!isGroup && (otherUser?.isOnline ?? otherDetail?.isOnline) && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--wa-header)] bg-[#25d366]" />
              )}
            </button>

            <button onClick={onToggleRightSidebar} className="min-w-0 text-left">
              <h2 className="truncate text-[17px] font-normal leading-[22px] text-[var(--wa-text)]">
                {isGroup ? conversation.groupInfo?.name || 'Group' : otherName}
              </h2>
              <p
                className={`truncate text-[13px] leading-4 ${
                  isOtherTyping ? 'text-[#00a884]' : 'text-[var(--wa-text-2)]'
                }`}
              >
                {statusText}
              </p>
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!isGroup && otherUserId && (
            <>
              {!isSavedContact(otherUserId) && (
                <button
                  onClick={() => setShowContactDialog(true)}
                  className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-2)] transition hover:bg-black/5 min-[400px]:flex dark:hover:bg-white/5"
                  title="Add to contacts"
                >
                  <UserPlus className="h-6 w-6" />
                </button>
              )}
              <button
                onClick={() => startCall(otherUserId, otherName, otherPhoto, 'video')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-2)] transition hover:bg-black/5 dark:hover:bg-white/5"
                title="Video call"
              >
                <Video className="h-6 w-6" />
              </button>
              <button
                onClick={() => startCall(otherUserId, otherName, otherPhoto, 'audio')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-2)] transition hover:bg-black/5 dark:hover:bg-white/5"
                title="Voice call"
              >
                <Phone className="h-6 w-6" />
              </button>
            </>
          )}

          <button
            onClick={() => setShowSearchBar((v) => !v)}
            className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 min-[400px]:flex dark:hover:bg-white/5 ${
              showSearchBar ? 'text-[#00a884]' : 'text-[var(--wa-text-2)]'
            }`}
            title="Search in chat"
          >
            <Search className="h-[22px] w-[22px]" />
          </button>

          <button
            onClick={onToggleRightSidebar}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/5 ${
              isRightSidebarOpen ? 'text-[#00a884]' : 'text-[var(--wa-text-2)]'
            }`}
            title="Chat info"
          >
            <MoreVertical className="h-[22px] w-[22px]" />
          </button>
        </div>
      </header>

      {/* In-chat search */}
      {showSearchBar && (
        <div className="flex items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-panel)] px-4 py-2 animate-fade-in">
          <Search className="h-4 w-4 shrink-0 text-[var(--wa-text-2)]" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages"
            className="flex-1 bg-transparent text-sm text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
          />
          {searchQuery && (
            <span className="text-[11px] font-medium text-[var(--wa-text-2)]">
              {filteredMessages.length} found
            </span>
          )}
          <button
            onClick={() => {
              setShowSearchBar(false);
              setSearchQuery('');
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`${wallpaperClass} min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 sm:px-4 md:px-8 lg:px-14`}
      >
        {filteredMessages.length === 0 && pending.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wa-panel)] text-[#00a884] shadow-sm">
              <Smile className="h-8 w-8" />
            </div>
            <p className="text-sm font-medium text-[var(--wa-text)]">
              {searchQuery ? 'No messages found' : 'No messages yet'}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--wa-text-2)]">
              {searchQuery
                ? 'Try another keyword.'
                : 'Send a message to start the conversation. Messages are synced in real time.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-4 flex max-w-md items-center justify-center gap-2 rounded-lg bg-[#fdf4c5] px-3 py-1.5 text-center text-[11.5px] text-[#54656f] dark:bg-[#182229] dark:text-[#ffd279]">
              <Lock className="h-3 w-3 shrink-0" />
              <span>Messages are end-to-end encrypted. Only people in this chat can read them.</span>
            </div>

            {filteredMessages.map((msg, index) => {
              const previous = filteredMessages[index - 1];
              const showDivider =
                !previous ||
                !sameDay(new Date(previous.createdAt), new Date(msg.createdAt));

              return (
                <React.Fragment key={msg.id}>
                  {showDivider && (
                    <div className="my-3 flex justify-center">
                      <span className="wa-date-pill">{formatDayLabel(msg.createdAt)}</span>
                    </div>
                  )}
                  <MessageItem
                    message={msg}
                    isMe={msg.senderId === user?.uid}
                    isGroup={isGroup}
                    onReply={(message) => {
                      setEditingMessage(null);
                      setReplyingTo(message);
                      textareaRef.current?.focus();
                    }}
                    onReaction={handleReaction}
                    onDeleteForEveryone={handleDeleteForEveryone}
                    onDeleteForMe={handleDeleteForMe}
                    onStar={handleStar}
                    onPin={handlePin}
                    onEdit={(m) => {
                      setEditingMessage(m);
                      setText(m.text || '');
                      textareaRef.current?.focus();
                    }}
                  />
                </React.Fragment>
              );
            })}

            {!searchQuery &&
              pending.map((item) => <PendingMessage key={item.id} item={item} />)}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Scroll to bottom */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] text-[var(--wa-text-2)] shadow-lg transition hover:bg-[var(--wa-hover)]"
          title="Scroll to latest"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      {/* Reply / edit banner */}
      {(replyingTo || editingMessage) && (
        <div className="z-20 flex items-center justify-between border-t border-[var(--wa-border)] bg-[var(--wa-panel)] px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-1 rounded-full bg-[#00a884]" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-[#00a884]">
                {editingMessage
                  ? 'Edit message'
                  : `Reply to ${displayNameFor(replyingTo?.senderId, replyingTo?.senderName || 'Contact')}`}
              </p>
              <p className="truncate text-[12.5px] text-[var(--wa-text-2)]">
                {editingMessage ? editingMessage.text : replyingTo?.text || 'Attachment'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setReplyingTo(null);
              setEditingMessage(null);
              setText('');
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Blocked contact banner */}
      {isBlocked && (
        <div className="z-20 flex items-center justify-between gap-3 border-t border-[var(--wa-border)] bg-[#fff4e5] px-4 py-2 text-[12.5px] text-[#8a6d3b] dark:bg-[#2a2318] dark:text-[#ffd279]">
          <span>You blocked this contact. Unblock to send messages.</span>
          <button
            onClick={handleUnblock}
            className="shrink-0 rounded-full bg-[#00a884] px-3 py-1 text-xs font-semibold text-white hover:bg-[#008069]"
          >
            Unblock
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="composer-safe relative z-20 shrink-0 border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-2 py-2 md:px-4 md:py-2.5">
        {showEmojiPicker && (
          <div className="absolute bottom-full left-3 mb-2 z-40 w-[292px] rounded-xl border border-[var(--wa-border)] bg-[var(--wa-panel)] p-2 shadow-2xl animate-scale-in">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    handleTextChange(text + emoji);
                    textareaRef.current?.focus();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-[var(--wa-hover)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {showAttachMenu && (
          <div className="absolute bottom-full left-12 z-40 mb-2 w-48 overflow-hidden rounded-xl border border-[var(--wa-border)] bg-[var(--wa-panel)] py-1.5 shadow-2xl animate-scale-in">
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[13.5px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]">
              <ImageIcon className="h-4 w-4 text-[#00a884]" />
              Photos & videos
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => handleFileAttachment(e, 'media')}
                className="hidden"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[13.5px] text-[var(--wa-text)] hover:bg-[var(--wa-hover)]">
              <FileText className="h-4 w-4 text-[#7f66ff]" />
              Document
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.zip,.csv,.xls,.xlsx,.ppt,.pptx"
                onChange={(e) => handleFileAttachment(e, 'document')}
                className="hidden"
              />
            </label>
          </div>
        )}

        {isRecording ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--wa-panel)] px-4 py-2 animate-fade-in">
            <button
              onClick={cancelRecording}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#ea0038] hover:bg-[#ea0038]/10"
              title="Delete recording"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-[var(--wa-text)]">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ea0038]" />
              <span className="tabular-nums">
                {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
              <span className="text-xs text-[var(--wa-text-2)]">Recording...</span>
            </div>
            <button
              onClick={stopRecording}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-white hover:bg-[#008069]"
              title="Send voice note"
            >
              <Send className="h-6 w-6" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker((v) => !v);
                setShowAttachMenu(false);
              }}
              className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/5 ${
                showEmojiPicker ? 'text-[#00a884]' : 'text-[var(--wa-text-2)]'
              }`}
              title="Emoji"
            >
              <Smile className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAttachMenu((v) => !v);
                setShowEmojiPicker(false);
              }}
              className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/5 ${
                showAttachMenu ? 'text-[#00a884]' : 'text-[var(--wa-text-2)]'
              }`}
              title="Attach"
            >
              <Paperclip className="h-6 w-6" />
            </button>

            <div className="flex flex-1 items-end rounded-lg bg-[var(--wa-panel)] px-3 py-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => {
                  handleTextChange(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={isBlocked ? 'Unblock this contact to send messages' : 'Type a message'}
                disabled={isBlocked}
                className="max-h-[120px] w-full resize-none bg-transparent text-[15px] leading-6 text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)] disabled:cursor-not-allowed"
              />
            </div>

            {text.trim() || editingMessage ? (
              <button
                type="submit"
                disabled={isBlocked}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#008069] disabled:opacity-50"
                title={editingMessage ? 'Save edit' : 'Send'}
              >
                <Send className="h-6 w-6" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={isBlocked}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-2)] transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
                title="Record voice message"
              >
                <Mic className="h-6 w-6" />
              </button>
            )}
          </form>
        )}
      </div>

      {showPhoto && !isGroup && otherUserId && (
        <ProfilePhotoViewer
          src={otherPhoto || `https://api.dicebear.com/7.x/bottts/svg?seed=${otherUserId}`}
          name={otherName}
          onClose={() => setShowPhoto(false)}
        />
      )}

      {showContactDialog && otherUserId && (
        <ContactDialog
          personName={otherUser?.displayName || otherDetail?.displayName || 'Contact'}
          initialNickname={nicknameFor(otherUserId) || ''}
          isSaved={isSavedContact(otherUserId)}
          onSave={async (nickname) => {
            try {
              await saveContactFor(otherUserId, nickname);
              setShowContactDialog(false);
              addToast({
                title: 'Contact saved',
                message: nickname ? `Saved as “${nickname}”.` : 'Added to your contacts.',
                type: 'success',
              });
            } catch {
              addToast({ title: 'Could not save contact', message: 'Please try again.', type: 'error' });
            }
          }}
          onRemove={async () => {
            try {
              await removeContactFor(otherUserId);
              setShowContactDialog(false);
              addToast({ title: 'Contact removed', message: 'Removed from your contacts.', type: 'success' });
            } catch {
              addToast({ title: 'Could not remove contact', message: 'Please try again.', type: 'error' });
            }
          }}
          onClose={() => setShowContactDialog(false)}
        />
      )}
    </div>
  );
}
