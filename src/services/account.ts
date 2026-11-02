import { deleteUser, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Removes everything tied to a user: their statuses, owned channels (with
 * posts), every conversation they participate in (with its messages), and
 * their profile document. Firestore rules only let a user delete their own
 * messages, so deletes of other people's messages inside shared conversations
 * are attempted best-effort — once the conversation document is gone they are
 * unreachable either way.
 */
export async function deleteUserData(uid: string): Promise<void> {
  const statusesSnap = await getDocs(query(collection(db, 'statuses'), where('userId', '==', uid)));
  for (const status of statusesSnap.docs) {
    await deleteDoc(status.ref).catch(() => {});
  }

  const channelsSnap = await getDocs(query(collection(db, 'channels'), where('ownerId', '==', uid)));
  for (const channel of channelsSnap.docs) {
    const postsSnap = await getDocs(collection(db, 'channels', channel.id, 'posts'));
    for (const post of postsSnap.docs) {
      await deleteDoc(post.ref).catch(() => {});
    }
    await deleteDoc(channel.ref).catch(() => {});
  }

  const conversationsSnap = await getDocs(
    query(collection(db, 'conversations'), where('participantIds', 'array-contains', uid))
  );
  for (const conversation of conversationsSnap.docs) {
    const messagesSnap = await getDocs(collection(db, 'conversations', conversation.id, 'messages'));
    for (const message of messagesSnap.docs) {
      await deleteDoc(message.ref).catch(() => {});
    }
    await deleteDoc(conversation.ref).catch(() => {});
  }

  await deleteDoc(doc(db, 'users', uid)).catch(() => {});
}

export async function deleteUserAccount(user: User): Promise<void> {
  await deleteUserData(user.uid);
  await deleteUser(user);
}
