import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  MessageCircle,
  Mail,
  Lock,
  User,
  AtSign,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Radio,
  Phone,
  LockKeyhole,
  Loader2,
} from 'lucide-react';

interface AuthModalProps {
  onClose?: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { signIn, signUp, signInWithGoogle, sendPasswordReset } = useAuth();
  const { addToast } = useNotification();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        addToast({ title: 'Welcome back', message: 'You are signed in.', type: 'success' });
        onClose?.();
      } else if (mode === 'signup') {
        if (!displayName.trim() || !username.trim()) {
          setError('Please provide your name and a username.');
          setLoading(false);
          return;
        }
        await signUp(email.trim(), password, displayName.trim(), username.trim());
        addToast({ title: 'Account created', message: 'Welcome to Chatly.', type: 'success' });
        onClose?.();
      } else {
        await sendPasswordReset(email.trim());
        setResetSent(true);
        addToast({
          title: 'Reset link sent',
          message: 'Check your email inbox to reset your password.',
          type: 'info',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      if (
        msg.includes('user-not-found') ||
        msg.includes('wrong-password') ||
        msg.includes('invalid-credential') ||
        msg.includes('invalid-login-credentials')
      ) {
        setError('Invalid email or password. Please try again.');
      } else if (msg.includes('email-already-in-use')) {
        setError('This email is already registered. Please sign in instead.');
      } else if (msg.includes('weak-password')) {
        setError('Password should be at least 6 characters.');
      } else if (msg.includes('invalid-email')) {
        setError('Please enter a valid email address.');
      } else if (msg.includes('too-many-requests')) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else if (msg.includes('operation-not-allowed')) {
        setError('Email sign-in is not enabled for this project.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      addToast({ title: 'Welcome', message: 'Signed in with Google.', type: 'success' });
      onClose?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      if (msg.includes('unauthorized-domain')) {
        setError('Google sign-in is not enabled for this domain yet. Use email sign-in.');
      } else if (msg.includes('popup-closed-by-user')) {
        setError('Google sign-in was cancelled.');
      } else if (msg.includes('operation-not-allowed')) {
        setError('Google sign-in is not enabled for this project. Use email sign-in.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: 'signin' | 'signup' | 'forgot') => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const inputBase =
    'w-full rounded-lg border border-[#e9edef] bg-white px-4 py-3 text-[14px] text-[#111b21] outline-none transition placeholder:text-[#8696a0] focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/15';

  return (
    <div className="min-h-screen w-screen overflow-y-auto bg-[#f0f2f5]">
      {/* Green band */}
      <div className="h-[140px] w-full bg-[#00a884] md:h-[220px]" />

      <div className="mx-auto -mt-[100px] flex w-full max-w-5xl flex-col overflow-hidden rounded-none bg-white shadow-[0_17px_50px_rgba(11,20,26,0.18)] md:-mt-[150px] md:flex-row md:rounded-sm">
        {/* Intro panel */}
        <div className="hidden w-[46%] flex-col justify-between bg-[#f7f9fa] p-10 md:flex">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-[22px] font-light leading-none text-[#111b21]">Chatly</h1>
                <p className="mt-1 text-[12px] text-[#667781]">Connect. Chat. Share.</p>
              </div>
            </div>

            <h2 className="text-[26px] font-light leading-snug text-[#111b21]">
              Simple, reliable, private messaging for everyone.
            </h2>

            <div className="mt-8 space-y-5">
              {[
                { icon: MessageCircle, title: 'Real-time chats', text: 'Instant messages, groups, replies, reactions and receipts.' },
                { icon: CircleDashed, title: 'Status updates', text: 'Share photos and text updates that disappear after 24 hours.' },
                { icon: Radio, title: 'Channels', text: 'Follow channels and broadcast updates to your audience.' },
                { icon: Phone, title: 'Voice & video calls', text: 'Peer-to-peer WebRTC calling right inside the browser.' },
              ].map((feature) => (
                <div key={feature.title} className="flex gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7fce3] text-[#008069]">
                    <feature.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold text-[#111b21]">{feature.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-[#667781]">{feature.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 flex items-center gap-2 text-[11.5px] text-[#8696a0]">
            <LockKeyhole className="h-3.5 w-3.5" />
            Your personal messages are end-to-end encrypted
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 md:px-14">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[20px] font-light leading-none text-[#111b21]">Chatly</h1>
              <p className="mt-1 text-[11.5px] text-[#667781]">Connect. Chat. Share.</p>
            </div>
          </div>

          <h2 className="text-[24px] font-normal text-[#111b21]">
            {mode === 'signin' && 'Sign in to Chatly'}
            {mode === 'signup' && 'Create your account'}
            {mode === 'forgot' && 'Reset your password'}
          </h2>
          <p className="mt-1 text-[13px] text-[#667781]">
            {mode === 'signin' && 'Enter your email and password to continue.'}
            {mode === 'signup' && 'It only takes a minute to get started.'}
            {mode === 'forgot' && 'We will email you a secure reset link.'}
          </p>

          {error && (
            <div className="mt-5 rounded-lg border border-[#f5c2c7] bg-[#fdf2f2] px-4 py-3 text-[12.5px] text-[#b02a37]">
              {error}
            </div>
          )}

          {mode === 'forgot' && resetSent ? (
            <div className="mt-8 rounded-xl border border-[#d9fdd3] bg-[#f3fdf0] p-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-[#00a884]" />
              <h3 className="text-[16px] font-semibold text-[#111b21]">Check your inbox</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#667781]">
                A reset link was sent to <span className="font-medium text-[#008069]">{email}</span>.
              </p>
              <button
                onClick={() => switchMode('signin')}
                className="mt-5 text-[12.5px] font-semibold text-[#00a884] hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              {/* Tabs */}
              {mode !== 'forgot' && (
                <div className="mt-6 flex rounded-lg bg-[#f0f2f5] p-1">
                  <button
                    onClick={() => switchMode('signin')}
                    className={`flex-1 rounded-md py-2 text-[13px] font-semibold transition ${
                      mode === 'signin' ? 'bg-white text-[#008069] shadow-sm' : 'text-[#667781]'
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => switchMode('signup')}
                    className={`flex-1 rounded-md py-2 text-[13px] font-semibold transition ${
                      mode === 'signup' ? 'bg-white text-[#008069] shadow-sm' : 'text-[#667781]'
                    }`}
                  >
                    Sign up
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
                {mode === 'signup' && (
                  <>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Full name"
                        className={`${inputBase} pl-10`}
                      />
                    </div>
                    <div className="relative">
                      <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) =>
                          setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                        }
                        placeholder="Username"
                        className={`${inputBase} pl-10`}
                      />
                    </div>
                  </>
                )}

                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className={`${inputBase} pl-10`}
                  />
                </div>

                {mode !== 'forgot' && (
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className={`${inputBase} pl-10 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[#8696a0] hover:text-[#54656f]"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}

                {mode === 'signin' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-[12px] font-medium text-[#00a884] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00a884] py-3 text-[14px] font-medium text-white transition hover:bg-[#008069] disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span>
                        {mode === 'signin' && 'Sign in'}
                        {mode === 'signup' && 'Create account'}
                        {mode === 'forgot' && 'Send reset link'}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              {mode !== 'forgot' && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#e9edef]" />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[#8696a0]">or</span>
                    <div className="h-px flex-1 bg-[#e9edef]" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#e9edef] bg-white py-2.5 text-[13.5px] font-medium text-[#3b4a54] transition hover:bg-[#f7f9fa] disabled:opacity-60"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    Continue with Google
                  </button>
                </>
              )}

              <p className="mt-6 text-center text-[12px] text-[#8696a0]">
                {mode === 'signin' ? (
                  <>
                    New to Chatly?{' '}
                    <button
                      onClick={() => switchMode('signup')}
                      className="font-semibold text-[#00a884] hover:underline"
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      onClick={() => switchMode('signin')}
                      className="font-semibold text-[#00a884] hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-5xl items-center justify-center gap-4 px-6 pb-8 text-[11px] text-[#8696a0]">
        <span className="flex items-center gap-1">
          <LockKeyhole className="h-3 w-3" /> End-to-end encrypted
        </span>
        <span>·</span>
        <span>Powered by Firebase</span>
      </div>
    </div>
  );
}
