import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { UserProfile } from '../types';
import { ensureDirectConversation } from '../services/chat';
import { Search, X, MessageCircle, Loader2 } from 'lucide-react';

interface NewChatModalProps {
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export function NewChatModal({ onClose, onSelectConversation }: NewChatModalProps) {
  const { user, profile } = useAuth();
  const { addToast } = useNotification();
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user) return;
      try {
        const snap = await getDocs(query(collection(db, 'users'), limit(100)));
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data() as UserProfile;
          if (data.uid !== user.uid && !profile?.blockedUsers?.includes(data.uid)) {
            list.push(data);
          }
        });
        list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setUsers(list);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [user, profile?.blockedUsers]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const handleStartChat = async (target: UserProfile) => {
    if (!user || !profile || startingId) return;
    setStartingId(target.uid);
    try {
      const id = await ensureDirectConversation(profile, target);
      onSelectConversation(id);
      onClose();
    } catch (err) {
      console.error(err);
      addToast({ title: 'Could not open chat', message: 'Please try again.', type: 'error' });
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-[var(--wa-panel)] shadow-2xl animate-scale-in sm:h-[82vh] sm:rounded-xl">
        <header className="flex h-[60px] shrink-0 items-center gap-4 bg-[#008069] px-4 text-white">
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10" title="Close">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-[17px] font-medium">New chat</h2>
        </header>

        <div className="border-b border-[var(--wa-border)] bg-[var(--wa-panel)] px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wa-text-2)]" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, @username or email"
              className="h-10 w-full rounded-lg bg-[var(--wa-panel-2)] pl-10 pr-3 text-[14px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--wa-text-2)]">
              <Loader2 className="h-6 w-6 animate-spin text-[#00a884]" />
              <span className="text-xs">Finding people...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
              <MessageCircle className="h-8 w-8 text-[var(--wa-text-3)]" />
              <p className="text-sm font-medium text-[var(--wa-text)]">No contacts found</p>
              <p className="text-xs leading-relaxed text-[var(--wa-text-2)]">
                {searchTerm
                  ? 'Try a different search term.'
                  : 'Invite someone to join Chatly and start chatting.'}
              </p>
            </div>
          ) : (
            filteredUsers.map((target) => (
              <button
                key={target.uid}
                onClick={() => handleStartChat(target)}
                disabled={!!startingId}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
              >
                <div className="relative shrink-0">
                  <img
                    src={target.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${target.uid}`}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                  {target.isOnline && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--wa-panel)] bg-[#25d366]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium text-[var(--wa-text)]">
                    {target.displayName}
                  </div>
                  <div className="truncate text-[12.5px] text-[var(--wa-text-2)]">
                    {target.bio || (target.username ? `@${target.username}` : target.email)}
                  </div>
                </div>
                {startingId === target.uid && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#00a884]" />
                )}
              </button>
            ))
          )}
        </div>

        <div className="border-t border-[var(--wa-border)] px-4 py-3 text-center text-[11.5px] text-[var(--wa-text-2)]">
          Your personal messages are end-to-end encrypted
        </div>
      </div>
    </div>
  );
}
