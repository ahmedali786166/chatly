import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDirectory } from '../context/DirectoryContext';
import { useNotification } from '../context/NotificationContext';
import { UserProfile } from '../types';
import { ensureDirectConversation } from '../services/chat';
import { Search, X, MessageCircle, Loader2, UserPlus, UserCheck } from 'lucide-react';
import { onAvatarError } from '../lib/avatar';

interface NewChatModalProps {
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export function NewChatModal({ onClose, onSelectConversation }: NewChatModalProps) {
  const { user, profile } = useAuth();
  const { addToast } = useNotification();
  const { directory, isSavedContact, saveContactFor } = useDirectory();
  const [searchTerm, setSearchTerm] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const users = useMemo(() => {
    const list: UserProfile[] = [];
    Object.values(directory).forEach((data) => {
      if (!data?.uid || data.uid === user?.uid) return;
      if (profile?.blockedUsers?.includes(data.uid)) return;
      list.push(data);
    });
    return list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }, [directory, user?.uid, profile?.blockedUsers]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return users;
    const handle = q.replace(/^@/, '');
    // Names and emails may match partially; usernames must match exactly so a
    // short query never exposes unrelated accounts.
    return users.filter(
      (u) =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase() === handle ||
        (u.email || '').toLowerCase() === q
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

  const handleSaveContact = async (target: UserProfile) => {
    if (!user || savingId) return;
    setSavingId(target.uid);
    try {
      await saveContactFor(target.uid);
      addToast({
        title: 'Contact saved',
        message: `${target.displayName || 'Contact'} was added to your contacts.`,
        type: 'success',
      });
    } catch {
      addToast({ title: 'Could not save contact', message: 'Please try again.', type: 'error' });
    } finally {
      setSavingId(null);
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
              placeholder="Search name, exact @username or email"
              className="h-10 w-full rounded-lg bg-[var(--wa-panel-2)] pl-10 pr-3 text-[14px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
              <MessageCircle className="h-8 w-8 text-[var(--wa-text-3)]" />
              <p className="text-sm font-medium text-[var(--wa-text)]">No contacts found</p>
              <p className="text-xs leading-relaxed text-[var(--wa-text-2)]">
                {searchTerm
                  ? 'Usernames need an exact match. Try their full @username or name.'
                  : 'Invite someone to join Chatly and start chatting.'}
              </p>
            </div>
          ) : (
            filteredUsers.map((target) => (
              <div
                key={target.uid}
                className="flex w-full items-center gap-1 pr-2 transition hover:bg-[var(--wa-hover)]"
              >
                <button
                  onClick={() => handleStartChat(target)}
                  disabled={!!startingId}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left disabled:opacity-60"
                >
                  <div className="relative shrink-0">
                    <img
                      src={target.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${target.uid}`}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                      onError={(e) => onAvatarError(e, target.uid)}
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
                      {target.username ? `@${target.username}` : target.email}
                    </div>
                  </div>
                  {startingId === target.uid && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#00a884]" />
                  )}
                </button>

                <button
                  onClick={() => handleSaveContact(target)}
                  disabled={isSavedContact(target.uid) || savingId === target.uid}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                    isSavedContact(target.uid)
                      ? 'text-[#00a884]'
                      : 'text-[var(--wa-text-2)] hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  title={isSavedContact(target.uid) ? 'Saved in contacts' : 'Add to contacts'}
                >
                  {savingId === target.uid ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isSavedContact(target.uid) ? (
                    <UserCheck className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                </button>
              </div>
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
