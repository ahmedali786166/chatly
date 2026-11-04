import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { useDirectory } from '../context/DirectoryContext';
import { useNotification } from '../context/NotificationContext';
import { CallSession } from '../types';
import { formatTime12, isSameDay, toDate } from '../lib/time';
import { onAvatarError } from '../lib/avatar';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Trash2,
  X,
} from 'lucide-react';

interface CallsModalProps {
  onClose: () => void;
}

const formatDuration = (totalSeconds: number) => {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const dayLabel = (value: string) => {
  const date = toDate(value);
  if (!date) return '';
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function CallsModal({ onClose }: CallsModalProps) {
  const { user } = useAuth();
  const { startCall } = useCall();
  const { addToast } = useNotification();
  const { displayNameFor, photoFor } = useDirectory();
  const [outgoing, setOutgoing] = useState<CallSession[]>([]);
  const [incoming, setIncoming] = useState<CallSession[]>([]);

  useEffect(() => {
    if (!user) return;
    const calls = collection(db, 'calls');

    const unsubOut = onSnapshot(
      query(calls, where('callerId', '==', user.uid), limit(100)),
      (snapshot) => {
        setOutgoing(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CallSession));
      },
      () => setOutgoing([])
    );
    const unsubIn = onSnapshot(
      query(calls, where('receiverId', '==', user.uid), limit(100)),
      (snapshot) => {
        setIncoming(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CallSession));
      },
      () => setIncoming([])
    );

    return () => {
      unsubOut();
      unsubIn();
    };
  }, [user]);

  const calls = useMemo(() => {
    const map = new Map<string, CallSession>();
    [...outgoing, ...incoming].forEach((call) => map.set(call.id, call));
    return [...map.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [outgoing, incoming]);

  const grouped = useMemo(() => {
    const groups: { label: string; items: CallSession[] }[] = [];
    calls.forEach((call) => {
      const label = dayLabel(call.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(call);
      else groups.push({ label, items: [call] });
    });
    return groups;
  }, [calls]);

  const removeCall = async (callId: string) => {
    try {
      await deleteDoc(doc(db, 'calls', callId));
    } catch {
      addToast({ title: 'Could not delete', message: 'Please try again.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-[var(--wa-panel)] shadow-2xl animate-scale-in sm:h-[82vh] sm:rounded-xl">
        <header className="flex h-[60px] shrink-0 items-center gap-4 bg-[#008069] px-4 text-white">
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10" title="Close">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-[17px] font-medium">Calls</h2>
        </header>

        <div className="flex-1 overflow-y-auto">
          {calls.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <Phone className="h-10 w-10 text-[var(--wa-text-3)]" />
              <p className="text-sm font-medium text-[var(--wa-text)]">No calls yet</p>
              <p className="max-w-[240px] text-xs leading-relaxed text-[var(--wa-text-2)]">
                Your voice and video call history will appear here.
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-10 bg-[var(--wa-panel-2)] px-4 py-1.5 text-[12px] font-medium text-[var(--wa-text-2)]">
                  {group.label}
                </div>
                {group.items.map((call) => {
                  const isOutgoing = call.callerId === user?.uid;
                  const otherId = isOutgoing ? call.receiverId : call.callerId;
                  const otherName = displayNameFor(
                    otherId,
                    isOutgoing ? call.receiverName : call.callerName
                  );
                  const otherPhoto = photoFor(
                    otherId,
                    isOutgoing ? call.receiverPhoto : call.callerPhoto
                  );
                  const duration = call.duration || 0;
                  const missed =
                    call.status === 'missed' ||
                    (call.status === 'rejected' && !isOutgoing) ||
                    (call.status === 'ended' && duration === 0 && !isOutgoing);

                  const statusText =
                    call.status === 'ongoing'
                      ? 'Ongoing'
                      : call.status === 'calling'
                      ? isOutgoing
                        ? 'Calling…'
                        : 'Incoming'
                      : call.status === 'rejected'
                      ? 'Declined'
                      : duration > 0
                      ? formatDuration(duration)
                      : missed
                      ? 'Missed'
                      : 'Ended';

                  const StatusIcon = missed
                    ? PhoneMissed
                    : isOutgoing
                    ? PhoneOutgoing
                    : PhoneIncoming;

                  return (
                    <div
                      key={call.id}
                      className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--wa-hover)]"
                    >
                      <button
                        onClick={() => {
                          onClose();
                          void startCall(otherId, otherName, otherPhoto, call.callType);
                        }}
                        disabled={otherId === user?.uid}
                        className="relative shrink-0 rounded-full"
                        title={`Call ${otherName}`}
                      >
                        <img
                          src={otherPhoto}
                          alt=""
                          className="h-[49px] w-[49px] rounded-full object-cover"
                          onError={(e) => onAvatarError(e, otherId)}
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-[17px] leading-[22px] ${
                            missed ? 'text-[#ea0038]' : 'text-[var(--wa-text)]'
                          }`}
                        >
                          {otherName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[13px] leading-5 text-[var(--wa-text-2)]">
                          <StatusIcon
                            className={`h-4 w-4 shrink-0 ${
                              missed ? 'text-[#ea0038]' : 'text-[var(--wa-text-2)]'
                            }`}
                          />
                          <span className="truncate">{statusText}</span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">{formatTime12(call.createdAt)}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => {
                            onClose();
                            void startCall(otherId, otherName, otherPhoto, 'video');
                          }}
                          disabled={otherId === user?.uid}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-[#00a884] transition hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                          title="Video call"
                        >
                          <Video className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          onClick={() => {
                            onClose();
                            void startCall(otherId, otherName, otherPhoto, 'audio');
                          }}
                          disabled={otherId === user?.uid}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-[#00a884] transition hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                          title="Voice call"
                        >
                          <Phone className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          onClick={() => removeCall(call.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--wa-text-3)] opacity-0 transition hover:bg-black/5 group-hover:opacity-100 dark:hover:bg-white/10"
                          title="Delete from call log"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
