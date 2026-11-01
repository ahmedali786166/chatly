/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { CallProvider } from './context/CallContext';
import { LeftSidebar } from './components/LeftSidebar';
import { ChatPanel } from './components/ChatPanel';
import { RightSidebar } from './components/RightSidebar';
import { AuthModal } from './components/AuthModal';
import { NewChatModal } from './components/NewChatModal';
import { NewGroupModal } from './components/NewGroupModal';
import { StatusModal } from './components/StatusModal';
import { ChannelsModal } from './components/ChannelsModal';
import { SettingsModal } from './components/SettingsModal';
import { CallModal } from './components/CallModal';
import { Conversation, Message, UserProfile } from './types';
import { doc, getDoc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase/config';
import { sendStatusReply } from './services/chat';
import {
  MessageCircle,
  CircleDashed,
  Radio,
  Settings,
  Moon,
  Sun,
  Lock,
  Plus,
  Users,
  Phone,
  ArrowRight,
} from 'lucide-react';

function NavRail({
  active,
  onChats,
  onStatus,
  onChannels,
  onSettings,
  onToggleTheme,
  dark,
  profile,
}: {
  active: string;
  onChats: () => void;
  onStatus: () => void;
  onChannels: () => void;
  onSettings: () => void;
  onToggleTheme: () => void;
  dark: boolean;
  profile: UserProfile | null;
}) {
  const itemClass = (key: string) =>
    `relative flex h-11 w-11 items-center justify-center rounded-full transition ${
      active === key
        ? 'bg-[#d9fdd3] text-[#008069] dark:bg-[#103529] dark:text-[#06cf9c]'
        : 'text-[#54656f] hover:bg-black/5 dark:text-[#aebac1] dark:hover:bg-white/5'
    }`;

  return (
    <nav className="hidden md:flex w-[64px] shrink-0 flex-col items-center justify-between border-r border-[var(--wa-border)] bg-[var(--wa-header)] py-4">
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onChats}
          className={itemClass('chats')}
          title="Chats"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="absolute -bottom-0.5 h-1 w-6 rounded-full bg-[#00a884]" style={{ opacity: active === 'chats' ? 1 : 0 }} />
        </button>

        <button onClick={onStatus} className={itemClass('status')} title="Status">
          <CircleDashed className="w-6 h-6" />
        </button>

        <button onClick={onChannels} className={itemClass('channels')} title="Channels">
          <Radio className="w-6 h-6" />
        </button>

        <button onClick={onToggleTheme} className={itemClass('theme')} title={dark ? 'Light mode' : 'Dark mode'}>
          {dark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button onClick={onSettings} className={itemClass('settings')} title="Settings">
          <Settings className="w-6 h-6" />
        </button>

        <button onClick={onSettings} className="relative rounded-full ring-2 ring-transparent hover:ring-[#00a884]/40 transition" title="Profile">
          <img
            src={profile?.photoURL}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--wa-header)] bg-[#25d366]" />
        </button>
      </div>
    </nav>
  );
}

function MainApp() {
  const { user, profile, updateProfileData, loading } = useAuth();
  const { addToast } = useNotification();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showChannelsModal, setShowChannelsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Apply the saved theme globally
  useEffect(() => {
    if (!profile) return;
    const isDark = profile.theme !== 'light';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, [profile?.theme]);

  // Active conversation document
  useEffect(() => {
    if (!activeConversationId) {
      setActiveConversation(null);
      return;
    }

    const convRef = doc(db, 'conversations', activeConversationId);
    const unsubscribe = onSnapshot(
      convRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setActiveConversation({ id: snapshot.id, ...snapshot.data() } as Conversation);
        } else {
          setActiveConversation(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `conversations/${activeConversationId}`);
      }
    );

    return () => unsubscribe();
  }, [activeConversationId]);

  // Shared media / starred messages for the info drawer
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const messagesCol = collection(db, 'conversations', activeConversationId, 'messages');
    const q = query(messagesCol, orderBy('createdAt', 'desc'), limit(150));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Message[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Message);
        });
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `conversations/${activeConversationId}/messages`);
      }
    );

    return () => unsubscribe();
  }, [activeConversationId]);

  const handleToggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', !dark);
    setDark(!dark);
    if (profile) {
      updateProfileData({ theme: next }).catch(() => {});
    }
  };

  const handleReplyToStatus = async (targetUserId: string, replyText: string) => {
    if (!profile) return;
    try {
      const targetSnap = await getDoc(doc(db, 'users', targetUserId));
      const target = targetSnap.exists() ? (targetSnap.data() as UserProfile) : null;
      const conversationId = await sendStatusReply(
        profile,
        {
          uid: targetUserId,
          displayName: target?.displayName || 'Contact',
          photoURL: target?.photoURL,
          email: target?.email || '',
          isOnline: target?.isOnline ?? false,
          lastSeen: target?.lastSeen || '',
        },
        replyText
      );
      setActiveConversationId(conversationId);
      addToast({ title: 'Reply sent', message: 'Your status reply was delivered.', type: 'success' });
    } catch (err) {
      console.error(err);
      addToast({ title: 'Could not send reply', message: 'Please try again.', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#00a884] text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <MessageCircle className="h-9 w-9" />
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-white/90">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          <span>Starting Chatly...</span>
        </div>
      </div>
    );
  }

  // Signed-out landing + authentication
  if (!user) {
    return <AuthModal />;
  }

  const railActive = showStatusModal
    ? 'status'
    : showChannelsModal
    ? 'channels'
    : showSettingsModal
    ? 'settings'
    : 'chats';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--wa-bg)] text-[var(--wa-text)]">
      <NavRail
        active={railActive}
        onChats={() => {
          setShowStatusModal(false);
          setShowChannelsModal(false);
          setShowSettingsModal(false);
        }}
        onStatus={() => setShowStatusModal(true)}
        onChannels={() => setShowChannelsModal(true)}
        onSettings={() => setShowSettingsModal(true)}
        onToggleTheme={handleToggleTheme}
        dark={dark}
        profile={profile}
      />

      {/* Chat list column */}
      <div
        className={`${
          activeConversationId ? 'hidden md:flex' : 'flex'
        } h-full w-full shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] md:w-[400px] lg:w-[420px]`}
      >
        <LeftSidebar
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => setActiveConversationId(id)}
          onOpenNewChat={() => setShowNewChatModal(true)}
          onOpenNewGroup={() => setShowNewGroupModal(true)}
          onOpenStatus={() => setShowStatusModal(true)}
          onOpenChannels={() => setShowChannelsModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
        />
      </div>

      {/* Chat column */}
      <div
        className={`${
          activeConversationId ? 'flex' : 'hidden md:flex'
        } h-full min-w-0 flex-1 flex-col`}
      >
        {activeConversation ? (
          <ChatPanel
            conversation={activeConversation}
            onToggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            isRightSidebarOpen={isRightSidebarOpen}
            onBackMobile={() => setActiveConversationId(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-[var(--wa-panel-2)] px-6 text-center">
            <div className="mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-[var(--wa-panel)] shadow-sm">
              <MessageCircle className="h-16 w-16 text-[#00a884]" />
            </div>
            <h1 className="text-[32px] font-light text-[var(--wa-text)]">Chatly Web</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--wa-text-2)]">
              Send and receive messages without keeping your phone online. Use Chatly on up to
              4 linked devices and 1 phone at the same time.
            </p>

            <div className="mt-6 flex items-center gap-2 text-xs text-[var(--wa-text-3)]">
              <Lock className="h-3.5 w-3.5" />
              <span>Your personal messages are end-to-end encrypted</span>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setShowNewChatModal(true)}
                className="flex items-center gap-2 rounded-full bg-[#00a884] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#008069]"
              >
                <Plus className="h-4 w-4" />
                Start new chat
              </button>
              <button
                onClick={() => setShowNewGroupModal(true)}
                className="flex items-center gap-2 rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] px-5 py-2.5 text-sm font-medium text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
              >
                <Users className="h-4 w-4" />
                New group
              </button>
            </div>

            <div className="mt-14 grid w-full max-w-lg grid-cols-3 gap-3 text-left">
              {[
                { icon: MessageCircle, title: 'Chats', text: 'Real-time messages with receipts' },
                { icon: Phone, title: 'Calls', text: 'Voice & video over WebRTC' },
                { icon: Radio, title: 'Channels', text: 'Broadcast to your followers' },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-[var(--wa-border)] bg-[var(--wa-panel)] p-3.5"
                >
                  <feature.icon className="mb-2 h-4 w-4 text-[#00a884]" />
                  <div className="text-xs font-semibold text-[var(--wa-text)]">{feature.title}</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--wa-text-2)]">
                    {feature.text}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowStatusModal(true)}
              className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-[#00a884] hover:underline"
            >
              Share a status update
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Contact / group info drawer */}
      {isRightSidebarOpen && activeConversation && (
        <RightSidebar
          conversation={activeConversation}
          messages={messages}
          onClose={() => setIsRightSidebarOpen(false)}
        />
      )}

      {showNewChatModal && (
        <NewChatModal
          onClose={() => setShowNewChatModal(false)}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            setShowNewChatModal(false);
          }}
        />
      )}

      {showNewGroupModal && (
        <NewGroupModal
          onClose={() => setShowNewGroupModal(false)}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            setShowNewGroupModal(false);
          }}
        />
      )}

      {showStatusModal && (
        <StatusModal
          onClose={() => setShowStatusModal(false)}
          onReplyToStatus={handleReplyToStatus}
        />
      )}

      {showChannelsModal && <ChannelsModal onClose={() => setShowChannelsModal(false)} />}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          currentTheme={dark ? 'dark' : 'light'}
          setTheme={(theme) => {
            const isDark = theme === 'dark';
            setDark(isDark);
            document.documentElement.classList.toggle('dark', isDark);
            if (profile) updateProfileData({ theme }).catch(() => {});
          }}
        />
      )}

      <CallModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <CallProvider>
          <MainApp />
        </CallProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
