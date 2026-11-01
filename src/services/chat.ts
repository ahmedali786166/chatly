import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Conversation, UserProfile } from '../types';

type Sender = Pick<UserProfile, 'uid' | 'displayName' | 'photoURL' | 'email'>;
type OtherUser = Pick<
  UserProfile,
  'uid' | 'displayName' | 'photoURL' | 'email' | 'isOnline' | 'lastSeen'
>;

export async function findExistingDirectConversation(
  myUid: string,
  otherUid: string
): Promise<string | null> {
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', myUid)
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const conv = d.data() as Conversation;
    if (conv.type === 'direct' && conv.participantIds.includes(otherUid)) {
      return d.id;
    }
  }
  return null;
}

export async function ensureDirectConversation(me: Sender, other: OtherUser): Promise<string> {
  const existing = await findExistingDirectConversation(me.uid, other.uid);
  if (existing) return existing;

  const id = [me.uid, other.uid].sort().join('__');
  const ref = doc(db, 'conversations', id);
  const snap = await getDoc(ref);
  if (snap.exists()) return ref.id;

  const now = new Date().toISOString();
  const conversation: Conversation = {
    id,
    type: 'direct',
    participantIds: [me.uid, other.uid],
    participantDetails: {
      [me.uid]: {
        displayName: me.displayName,
        email: me.email,
        photoURL: me.photoURL,
        isOnline: true,
        lastSeen: now,
      },
      [other.uid]: {
        displayName: other.displayName,
        email: other.email,
        photoURL: other.photoURL,
        isOnline: other.isOnline,
        lastSeen: other.lastSeen,
      },
    },
    createdAt: now,
    updatedAt: now,
    unreadCounts: {},
  };

  await setDoc(ref, conversation);
  return id;
}

export async function sendTextMessage(
  conversation: Conversation,
  me: Sender,
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const now = new Date().toISOString();
  await addDoc(collection(db, 'conversations', conversation.id, 'messages'), {
    conversationId: conversation.id,
    senderId: me.uid,
    senderName: me.displayName,
    senderPhoto: me.photoURL,
    text: trimmed,
    readBy: [me.uid],
    deliveredTo: [me.uid],
    createdAt: now,
  });

  const unread: Record<string, unknown> = {};
  conversation.participantIds
    .filter((id) => id !== me.uid)
    .forEach((id) => {
      unread[`unreadCounts.${id}`] = increment(1);
    });

  await updateDoc(doc(db, 'conversations', conversation.id), {
    lastMessage: {
      text: trimmed,
      senderId: me.uid,
      senderName: me.displayName,
      timestamp: now,
      readBy: [me.uid],
    },
    updatedAt: now,
    ...unread,
  });
}

export async function sendStatusReply(
  me: Sender,
  target: OtherUser,
  text: string
): Promise<string> {
  const conversationId = await ensureDirectConversation(me, target);
  await sendTextMessage(
    {
      id: conversationId,
      type: 'direct',
      participantIds: [me.uid, target.uid],
      createdAt: '',
      updatedAt: '',
    },
    me,
    text
  );
  return conversationId;
}
