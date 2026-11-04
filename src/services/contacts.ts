import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Contact } from '../types';

const contactId = (ownerId: string, contactUid: string) => `${ownerId}_${contactUid}`;

export function subscribeContacts(
  ownerId: string,
  onChange: (contacts: Contact[]) => void
): () => void {
  const q = query(collection(db, 'contacts'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Contact[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Contact));
      onChange(list);
    },
    (err) => {
      // Until the contacts security rules are deployed this query is denied;
      // the app stays usable with nicknames simply disabled.
      console.warn('Contacts are unavailable:', err.message);
      onChange([]);
    }
  );
}

export async function saveContact(
  ownerId: string,
  contactUid: string,
  nickname?: string
): Promise<void> {
  const trimmed = (nickname || '').trim();
  const data: Contact = {
    id: contactId(ownerId, contactUid),
    ownerId,
    contactUid,
    createdAt: new Date().toISOString(),
  };
  if (trimmed) data.nickname = trimmed;
  await setDoc(doc(db, 'contacts', data.id), {
    ...data,
    nickname: trimmed || null,
  });
}

export async function removeContact(ownerId: string, contactUid: string): Promise<void> {
  await deleteDoc(doc(db, 'contacts', contactId(ownerId, contactUid)));
}
