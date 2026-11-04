export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  photoURL?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen: string; // ISO date string
  createdAt: string;
  theme?: 'dark' | 'light' | 'midnight';
  chatWallpaper?: string;
  notificationsEnabled?: boolean;
  soundEnabled?: boolean;
  readReceipts?: boolean;
  blockedUsers?: string[];
}

export interface Contact {
  id: string; // contact owner's uid + "_" + contact uid
  ownerId: string;
  contactUid: string;
  nickname?: string;
  createdAt: string;
}

export type ConversationType = 'direct' | 'group';

export interface ParticipantDetail {
  displayName: string;
  email: string;
  photoURL?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  participantIds: string[];
  participantDetails?: Record<string, ParticipantDetail>;
  lastMessage?: {
    text: string;
    senderId: string;
    senderName?: string;
    timestamp: string;
    mediaType?: string;
    readBy?: string[];
  };
  unreadCounts?: Record<string, number>;
  groupInfo?: {
    name: string;
    description: string;
    photoURL?: string;
    adminIds: string[];
    createdBy: string;
  };
  pinnedBy?: string[];
  archivedBy?: string[];
  mutedBy?: string[];
  clearedBy?: Record<string, string>; // userId -> timestamp of last cleared
  typingUsers?: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'voice';

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  text: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  fileName?: string;
  fileSize?: number;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  reactions?: Record<string, string[]>; // emoji -> array of userIds
  readBy: string[]; // array of userIds
  deliveredTo: string[]; // array of userIds
  isEdited?: boolean;
  isDeleted?: boolean;
  deletedFor?: string[]; // userIds who deleted for themselves
  pinned?: boolean;
  starredBy?: string[]; // userIds who starred this
  createdAt: string;
  updatedAt?: string;
}

export interface StatusStory {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  type: 'text' | 'image' | 'video';
  content: string; // text string or media URL
  caption?: string;
  backgroundColor?: string;
  viewers: string[]; // array of userIds
  createdAt: string;
  expiresAt: string;
  expiresAtMs?: number; // numeric mirror used by Firestore security rules
  publicId?: string; // Cloudinary public id for media cleanup
  deleteToken?: string; // Cloudinary delete token for media cleanup
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  photoURL?: string;
  ownerId: string;
  ownerName: string;
  subscribers: string[];
  subscriberCount: number;
  createdAt: string;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  title?: string;
  content: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  reactions?: Record<string, string[]>;
  createdAt: string;
}

export type CallType = 'audio' | 'video';
export type CallStatus = 'calling' | 'ringing' | 'ongoing' | 'ended' | 'rejected' | 'missed';

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  receiverId: string;
  receiverName: string;
  receiverPhoto?: string;
  callType: CallType;
  status: CallStatus;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  duration?: number;
  createdAt: string;
  endedAt?: string;
}
