import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';
import { Contact, UserProfile } from '../types';
import { removeContact, saveContact, subscribeContacts } from '../services/contacts';

interface DirectoryContextType {
  directory: Record<string, UserProfile>;
  contacts: Record<string, Contact>;
  contactCount: number;
  isSavedContact: (uid?: string | null) => boolean;
  nicknameFor: (uid?: string | null) => string | undefined;
  displayNameFor: (uid?: string | null, fallback?: string) => string;
  photoFor: (uid?: string | null, fallback?: string) => string | undefined;
  saveContactFor: (uid: string, nickname?: string) => Promise<void>;
  removeContactFor: (uid: string) => Promise<void>;
}

const DirectoryContext = createContext<DirectoryContextType | undefined>(undefined);

const avatarFallback = (uid?: string | null) =>
  `https://api.dicebear.com/7.x/bottts/svg?seed=${uid || 'chatly'}`;

export function DirectoryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [directory, setDirectory] = useState<Record<string, UserProfile>>({});
  const [contactList, setContactList] = useState<Contact[]>([]);

  useEffect(() => {
    if (!user) {
      setDirectory({});
      return;
    }
    const unsubscribe = onSnapshot(
      query(collection(db, 'users'), limit(500)),
      (snap) => {
        const next: Record<string, UserProfile> = {};
        snap.forEach((d) => {
          const profile = d.data() as UserProfile;
          next[profile.uid || d.id] = profile;
        });
        setDirectory(next);
      },
      (err) => console.warn('User directory is unavailable:', err.message)
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setContactList([]);
      return;
    }
    return subscribeContacts(user.uid, setContactList);
  }, [user]);

  const contacts = useMemo(() => {
    const map: Record<string, Contact> = {};
    contactList.forEach((c) => {
      map[c.contactUid] = c;
    });
    return map;
  }, [contactList]);

  const isSavedContact = (uid?: string | null) => !!uid && !!contacts[uid];
  const nicknameFor = (uid?: string | null) => (uid ? contacts[uid]?.nickname || undefined : undefined);
  const displayNameFor = (uid?: string | null, fallback = 'Contact') => {
    if (!uid) return fallback;
    return nicknameFor(uid) || directory[uid]?.displayName || fallback;
  };
  const photoFor = (uid?: string | null, fallback?: string) => {
    if (!uid) return fallback || avatarFallback(uid);
    return directory[uid]?.photoURL || fallback || avatarFallback(uid);
  };

  const value: DirectoryContextType = {
    directory,
    contacts,
    contactCount: contactList.length,
    isSavedContact,
    nicknameFor,
    displayNameFor,
    photoFor,
    saveContactFor: async (uid, nickname) => {
      if (!user) throw new Error('Not logged in');
      await saveContact(user.uid, uid, nickname);
    },
    removeContactFor: async (uid) => {
      if (!user) throw new Error('Not logged in');
      await removeContact(user.uid, uid);
    },
  };

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory() {
  const context = useContext(DirectoryContext);
  if (!context) throw new Error('useDirectory must be used within a DirectoryProvider');
  return context;
}
