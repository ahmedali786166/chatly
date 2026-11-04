import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { deleteCloudinaryMedia } from './storage';

/**
 * Removes everything tied to a user: their statuses, owned channels (with
 * posts), every conversation they participate in (with its messages), and
 * their profile document. Firestore rules only let a user delete their own
 * messages, so deletes of other people's messages inside shared conversations
 * are attempted best-effort — once the conversation document is gone they are
 * unreachable either way.
 */
export async function deleteUserData(uid: string): Promise<void> {
  const safely = async (step: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      // A blocked cleanup step must never prevent the auth account deletion.
      console.warn('Account cleanup step failed:', error);
    }
  };

  await safely(async () => {
    const contactsSnap = await getDocs(
      query(collection(db, 'contacts'), where('ownerId', '==', uid))
    );
    for (const contact of contactsSnap.docs) {
      await deleteDoc(contact.ref).catch(() => {});
    }
  });

  await safely(async () => {
    const statusesSnap = await getDocs(
      query(collection(db, 'statuses'), where('userId', '==', uid))
    );
    for (const status of statusesSnap.docs) {
      const deleteToken = (status.data() as { deleteToken?: string }).deleteToken;
      if (deleteToken) await deleteCloudinaryMedia(deleteToken);
      await deleteDoc(status.ref).catch(() => {});
    }
  });

  await safely(async () => {
    const channelsSnap = await getDocs(
      query(collection(db, 'channels'), where('ownerId', '==', uid))
    );
    for (const channel of channelsSnap.docs) {
      const postsSnap = await getDocs(collection(db, 'channels', channel.id, 'posts'));
      for (const post of postsSnap.docs) {
        await deleteDoc(post.ref).catch(() => {});
      }
      await deleteDoc(channel.ref).catch(() => {});
    }
  });

  await safely(async () => {
    const conversationsSnap = await getDocs(
      query(collection(db, 'conversations'), where('participantIds', 'array-contains', uid))
    );
    for (const conversation of conversationsSnap.docs) {
      const messagesSnap = await getDocs(
        collection(db, 'conversations', conversation.id, 'messages')
      );
      for (const message of messagesSnap.docs) {
        await deleteDoc(message.ref).catch(() => {});
      }
      await deleteDoc(conversation.ref).catch(() => {});
    }
  });

  await safely(async () => {
    await deleteDoc(doc(db, 'users', uid));
  });
}

export function usesPasswordSignIn(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password');
}

/**
 * Firebase requires a recent sign-in before it will delete an account.
 * Password users confirm with their password, Google users with a popup.
 */
export async function reauthenticateUser(user: User, password?: string): Promise<void> {
  if (usesPasswordSignIn(user)) {
    if (!user.email) throw new Error('This account has no email address.');
    if (!password) throw new Error('Enter your password to continue.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return;
  }
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
}

export async function deleteUserAccount(user: User, password?: string): Promise<void> {
  await reauthenticateUser(user, password);
  await deleteUserData(user.uid);
  await deleteUser(user);
}
