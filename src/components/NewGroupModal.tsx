import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useDirectory } from '../context/DirectoryContext';
import { useNotification } from '../context/NotificationContext';
import { UserProfile, Conversation } from '../types';
import { uploadFile } from '../services/storage';
import {
  Camera,
  Check,
  Loader2,
  Search,
  Users,
  X,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface NewGroupModalProps {
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export function NewGroupModal({ onClose, onSelectConversation }: NewGroupModalProps) {
  const { user, profile } = useAuth();
  const { addToast } = useNotification();
  const { contacts, directory, contactsLoaded } = useDirectory();

  const [step, setStep] = useState<1 | 2>(1);
  const [extraProfiles, setExtraProfiles] = useState<Record<string, UserProfile>>({});
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [groupPhoto, setGroupPhoto] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Groups can only contain saved contacts, never the whole user directory.
  // Most profiles come from the directory cache; fetch any contact that is
  // missing from it (e.g. beyond the directory page size).
  useEffect(() => {
    if (!user) return;
    const missing = Object.values(contacts)
      .map((c) => c.contactUid)
      .filter(
        (uid): uid is string =>
          Boolean(uid) && uid !== user.uid && !directory[uid] && !extraProfiles[uid]
      );
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const loaded: Record<string, UserProfile> = {};
      await Promise.all(
        missing.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) {
              const data = snap.data() as UserProfile;
              loaded[uid] = { ...data, uid: data.uid || uid };
            }
          } catch {
            // Missing profiles are simply left out.
          }
        })
      );
      if (!cancelled && Object.keys(loaded).length > 0) {
        setExtraProfiles((prev) => ({ ...prev, ...loaded }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contacts, directory, extraProfiles, user]);

  const availableUsers = useMemo(() => {
    if (!user) return [];
    const list: UserProfile[] = [];
    Object.values(contacts).forEach((contact) => {
      const uid = contact.contactUid;
      if (!uid || uid === user.uid) return;
      if (profile?.blockedUsers?.includes(uid)) return;
      const data = directory[uid] || extraProfiles[uid];
      if (!data) return;
      list.push({ ...data, uid, displayName: contact.nickname || data.displayName });
    });
    list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    return list;
  }, [contacts, directory, extraProfiles, user, profile?.blockedUsers]);

  const loading = !contactsLoaded;

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return availableUsers;
    return availableUsers.filter(
      (u) =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }, [availableUsers, searchTerm]);

  const selectedProfiles = availableUsers.filter((u) => selectedMembers.includes(u.uid));

  const toggleMember = (uid: string) => {
    setSelectedMembers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    e.target.value = '';
    setUploadingPhoto(true);
    try {
      const url = await uploadFile(file, `groups/avatar_${Date.now()}`);
      setGroupPhoto(url);
    } catch (err) {
      addToast({
        title: 'Photo upload failed',
        message: err instanceof Error ? err.message : 'Could not upload this photo.',
        type: 'error',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !groupName.trim() || creating) return;
    setCreating(true);

    try {
      const newConvRef = doc(collection(db, 'conversations'));
      const participantIds = [user.uid, ...selectedMembers];
      const now = new Date().toISOString();

      const participantDetails: Record<string, { displayName: string; email: string; photoURL?: string; isOnline?: boolean; lastSeen?: string }> = {
        [user.uid]: {
          displayName: profile.displayName,
          email: profile.email,
          photoURL: profile.photoURL,
          isOnline: true,
          lastSeen: now,
        },
      };

      selectedProfiles.forEach((member) => {
        participantDetails[member.uid] = {
          displayName: member.displayName,
          email: member.email,
          photoURL: member.photoURL,
          isOnline: member.isOnline,
          lastSeen: member.lastSeen,
        };
      });

      const unreadCounts: Record<string, number> = {};
      selectedMembers.forEach((id) => {
        unreadCounts[id] = 0;
      });

      const newConv: Conversation = {
        id: newConvRef.id,
        type: 'group',
        participantIds,
        participantDetails,
        groupInfo: {
          name: groupName.trim(),
          description: description.trim(),
          photoURL:
            groupPhoto ||
            `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(groupName.trim())}`,
          adminIds: [user.uid],
          createdBy: user.uid,
        },
        lastMessage: {
          text: `${profile.displayName} created group "${groupName.trim()}"`,
          senderId: user.uid,
          senderName: profile.displayName,
          timestamp: now,
          readBy: [user.uid],
        },
        unreadCounts,
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(newConvRef, newConv);
      onSelectConversation(newConvRef.id);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'conversations');
      addToast({ title: 'Could not create group', message: 'Please try again.', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-[var(--wa-panel)] shadow-2xl animate-scale-in sm:h-[82vh] sm:rounded-xl">
        <header className="flex h-[60px] shrink-0 items-center gap-3 bg-[#008069] px-3 text-white">
          <button
            onClick={() => (step === 1 ? onClose() : setStep(1))}
            className="rounded-full p-1.5 hover:bg-white/10"
            title={step === 1 ? 'Close' : 'Back'}
          >
            {step === 1 ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-medium">
              {step === 1 ? 'New group' : 'Group info'}
            </h2>
            {step === 1 && (
              <p className="truncate text-[11.5px] text-white/80">
                {selectedMembers.length} of {availableUsers.length} selected
              </p>
            )}
          </div>
        </header>

        {step === 1 ? (
          <>
            <div className="border-b border-[var(--wa-border)] px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wa-text-2)]" />
                <input
                  autoFocus
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search contacts to add"
                  className="h-10 w-full rounded-lg bg-[var(--wa-panel-2)] pl-10 pr-3 text-[14px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                />
              </div>
            </div>

            {selectedProfiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-b border-[var(--wa-border)] px-3 py-2 no-scrollbar">
                {selectedProfiles.map((member) => (
                  <button
                    key={member.uid}
                    onClick={() => toggleMember(member.uid)}
                    className="flex shrink-0 flex-col items-center gap-0.5"
                    title={`Remove ${member.displayName}`}
                  >
                    <div className="relative">
                      <img
                        src={member.photoURL}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover"
                      />
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#54656f] text-white">
                        <X className="h-3 w-3" />
                      </span>
                    </div>
                    <span className="w-14 truncate text-center text-[10.5px] text-[var(--wa-text-2)]">
                      {member.displayName.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto py-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--wa-text-2)]">
                  <Loader2 className="h-6 w-6 animate-spin text-[#00a884]" />
                  <span className="text-xs">Loading contacts...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
                  <Users className="h-8 w-8 text-[var(--wa-text-3)]" />
                  <p className="text-sm font-medium text-[var(--wa-text)]">
                    {availableUsers.length === 0 ? 'No saved contacts' : 'No contacts found'}
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--wa-text-2)]">
                    {availableUsers.length === 0
                      ? 'Save a contact from New chat first, then add them to a group.'
                      : 'Try a different search term.'}
                  </p>
                </div>
              ) : (
                filteredUsers.map((member) => {
                  const selected = selectedMembers.includes(member.uid);
                  return (
                    <button
                      key={member.uid}
                      onClick={() => toggleMember(member.uid)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--wa-hover)]"
                    >
                      <img
                        src={member.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${member.uid}`}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-medium text-[var(--wa-text)]">
                          {member.displayName}
                        </div>
                        <div className="truncate text-[12px] text-[var(--wa-text-2)]">
                          {member.bio || `@${member.username}`}
                        </div>
                      </div>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                          selected
                            ? 'border-[#00a884] bg-[#00a884] text-white'
                            : 'border-[var(--wa-text-3)]'
                        }`}
                      >
                        {selected && <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end border-t border-[var(--wa-border)] px-4 py-3">
              <button
                onClick={() => setStep(2)}
                disabled={selectedMembers.length === 0}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg transition hover:bg-[#008069] disabled:cursor-not-allowed disabled:opacity-40"
                title="Next"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleCreateGroup} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="flex flex-col items-center">
                <label className="relative cursor-pointer">
                  <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-[var(--wa-panel-2)]">
                    {groupPhoto ? (
                      <img src={groupPhoto} alt="" className="h-full w-full object-cover" />
                    ) : uploadingPhoto ? (
                      <Loader2 className="h-6 w-6 animate-spin text-[#00a884]" />
                    ) : (
                      <Camera className="h-8 w-8 text-[var(--wa-text-2)]" />
                    )}
                  </div>
                  <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#00a884] text-white shadow">
                    <Camera className="h-4 w-4" />
                  </span>
                </label>
                <span className="mt-2 text-[11.5px] text-[var(--wa-text-2)]">
                  Add a group photo (optional)
                </span>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#00a884]">
                    Group name
                  </label>
                  <input
                    autoFocus
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g. Weekend Squad"
                    maxLength={60}
                    className="h-11 w-full border-b-2 border-[#00a884] bg-transparent px-1 text-[15px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                  />
                  <div className="mt-1 text-right text-[10.5px] text-[var(--wa-text-3)]">
                    {groupName.length}/60
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--wa-text-2)]">
                    Description (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={512}
                    placeholder="What is this group about?"
                    className="w-full resize-none rounded-lg bg-[var(--wa-panel-2)] px-3 py-2.5 text-[13.5px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-3)]"
                  />
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-medium text-[var(--wa-text-2)]">
                    Participants ({selectedMembers.length})
                  </div>
                  <div className="space-y-1">
                    {selectedProfiles.map((member) => (
                      <div key={member.uid} className="flex items-center gap-3 py-1.5">
                        <img
                          src={member.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${member.uid}`}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                        <span className="truncate text-[13.5px] text-[var(--wa-text)]">
                          {member.displayName}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 py-1.5">
                      <img
                        src={profile?.photoURL}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <span className="text-[13.5px] text-[var(--wa-text)]">
                        You <span className="text-[11px] text-[var(--wa-text-2)]">(admin)</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--wa-border)] px-4 py-3">
              <button
                type="submit"
                disabled={!groupName.trim() || creating}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00a884] py-3 text-[14px] font-medium text-white transition hover:bg-[#008069] disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-4 w-4" />}
                {creating ? 'Creating group...' : 'Create group'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
