import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  deleteUser,
  updateProfile as updateFirebaseProfile
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  where,
} from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/config';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, pass: string, displayName: string, username: string) => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const usernameChecked = new Set<string>();

/** Picks a free @username so Gmail-alias sign-ins never collide. */
async function uniqueUsername(base: string, uid: string) {
  const clean =
    base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18) ||
    `user_${uid.slice(0, 5)}`.toLowerCase();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = (attempt === 0 ? clean : `${clean}${attempt + 1}`).slice(0, 24);
    try {
      const taken = await getDocs(
        query(collection(db, 'users'), where('username', '==', candidate))
      );
      if (taken.empty) return candidate;
    } catch {
      return `${clean}_${uid.slice(0, 4)}`.slice(0, 24).toLowerCase();
    }
  }
  return `${clean}_${uid.slice(0, 4)}`.slice(0, 24).toLowerCase();
}

/**
 * Older duplicate handles keep their name; a newer duplicate renames itself
 * once, so repeated sign-ins eventually stop sharing an @username.
 */
async function releaseDuplicateUsername(
  userRef: DocumentReference,
  uid: string,
  data: UserProfile
) {
  const username = (data.username || '').toLowerCase();
  if (!username) return data;
  try {
    const matches = await getDocs(
      query(collection(db, 'users'), where('username', '==', username))
    );
    if (matches.size < 2) return data;

    const mineCreated = new Date(data.createdAt || 0).getTime();
    const olderExists = matches.docs.some((docSnap) => {
      if (docSnap.id === uid) return false;
      const created = new Date((docSnap.data().createdAt as string) || 0).getTime();
      return created > 0 && created < mineCreated;
    });
    if (!olderExists) return data;

    const next = await uniqueUsername(username, uid);
    await updateDoc(userRef, { username: next });
    return { ...data, username: next };
  } catch {
    return data;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Monitor auth state
  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        
        // Listen to live user profile updates
        unsubscribeProfile = onSnapshot(
          userRef,
          async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserProfile;
              setProfile(data);

              if (!usernameChecked.has(currentUser.uid)) {
                usernameChecked.add(currentUser.uid);
                releaseDuplicateUsername(userRef, currentUser.uid, data).then((fixed) => {
                  if (fixed.username !== data.username) setProfile(fixed);
                });
              }
            } else {
              // Create user profile document if not exists (e.g. initial Google sign in)
              const initialProfile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
                username: await uniqueUsername(
                  currentUser.email?.split('@')[0] || '',
                  currentUser.uid
                ),
                photoURL: currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`,
                bio: 'Hey there! I am using Chatly.',
                isOnline: true,
                lastSeen: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                theme: 'dark',
                soundEnabled: true,
                notificationsEnabled: true,
                readReceipts: true,
              };

              try {
                await setDoc(userRef, initialProfile);
                setProfile(initialProfile);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
              }
            }
            setLoading(false);
          },
          (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
            setLoading(false);
          }
        );

        // Update online status
        try {
          await updateDoc(userRef, {
            isOnline: true,
            lastSeen: new Date().toISOString()
          });
        } catch {
          // Non-fatal if initial update fails
        }
      } else {
        if (unsubscribeProfile) unsubscribeProfile();
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // Presence management for tab close / background
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateDoc(userRef, {
          isOnline: false,
          lastSeen: new Date().toISOString()
        }).catch(() => {});
      } else {
        updateDoc(userRef, {
          isOnline: true,
          lastSeen: new Date().toISOString()
        }).catch(() => {});
      }
    };

    const handleBeforeUnload = () => {
      updateDoc(userRef, {
        isOnline: false,
        lastSeen: new Date().toISOString()
      }).catch(() => {});
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user]);

  const signUp = async (email: string, pass: string, displayName: string, username: string) => {
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      throw new Error('Username must be 3–24 characters using letters, numbers or underscores.');
    }

    // Username uniqueness needs an authenticated read (users are private),
    // so create the auth account first and roll it back if the name is taken.
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    const takenSnap = await getDocs(
      query(collection(db, 'users'), where('username', '==', cleanUsername))
    );
    if (!takenSnap.empty) {
      try {
        await deleteDoc(doc(db, 'users', cred.user.uid));
      } catch {
        // Best effort: removing the orphan profile is not critical
      }
      await deleteUser(cred.user).catch(() => {});
      throw new Error('That username is already taken. Please choose another one.');
    }

    const photoURL = `https://api.dicebear.com/7.x/bottts/svg?seed=${cred.user.uid}`;
    
    await updateFirebaseProfile(cred.user, { displayName, photoURL });

    const newProfile: UserProfile = {
      uid: cred.user.uid,
      email: cred.user.email || email,
      displayName,
      username: cleanUsername,
      photoURL,
      bio: 'Hey there! I am using Chatly.',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      theme: 'dark',
      soundEnabled: true,
      notificationsEnabled: true,
      readReceipts: true,
    };

    try {
      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      setProfile(newProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${cred.user.uid}`);
    }
  };

  const signIn = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user) throw new Error('Not logged in');
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, {
        ...data,
        updatedAt: new Date().toISOString()
      });
      if (data.displayName || data.photoURL) {
        await updateFirebaseProfile(user, {
          displayName: data.displayName ?? user.displayName,
          photoURL: data.photoURL ?? user.photoURL
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const logout = async () => {
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          isOnline: false,
          lastSeen: new Date().toISOString()
        });
      } catch {}
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        sendPasswordReset,
        updateProfileData,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
