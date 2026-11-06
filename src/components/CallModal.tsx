import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';

export function CallModal() {
  const { user } = useAuth();
  const {
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    callDuration,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, activeCall]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, activeCall]);

  // Remote audio must live on its own <audio> element: mobile browsers block
  // autoplay that starts after the tap gesture, so we retry and offer a manual
  // "tap to enable sound" fallback instead of silently staying muted.
  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.srcObject = remoteStream;
    if (!remoteStream) {
      setAudioBlocked(false);
      return;
    }
    audio
      .play()
      .then(() => setAudioBlocked(false))
      .catch(() => setAudioBlocked(true));
  }, [remoteStream, activeCall]);

  const unlockAudio = () => {
    remoteAudioRef.current
      ?.play()
      .then(() => setAudioBlocked(false))
      .catch(() => setAudioBlocked(true));
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // Incoming call — WhatsApp full-screen style
  if (incomingCall && !activeCall) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between bg-[#0b141a] px-6 py-10 text-white animate-fade-in">
        <div className="w-full max-w-md">
          <p className="text-center text-[13px] uppercase tracking-[0.18em] text-[#8696a0]">
            {incomingCall.callType === 'video' ? 'Incoming video call' : 'Incoming voice call'}
          </p>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="relative mb-7">
            <div className="absolute inset-0 animate-ping rounded-full bg-[#00a884]/20" />
            <img
              src={
                incomingCall.callerPhoto ||
                `https://api.dicebear.com/7.x/bottts/svg?seed=${incomingCall.callerId}`
              }
              alt={incomingCall.callerName}
              className="relative h-[132px] w-[132px] rounded-full object-cover ring-2 ring-white/10"
            />
          </div>
          <h2 className="text-[24px] font-normal text-white">{incomingCall.callerName}</h2>
          <p className="mt-1 text-[14px] text-[#8696a0]">Chatly {incomingCall.callType} call</p>
        </div>

        <div className="flex w-full max-w-xs items-end justify-between">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={rejectCall}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ea0038] text-white shadow-lg shadow-black/40 transition hover:brightness-110"
              aria-label="Decline call"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <span className="text-[13px] text-[#8696a0]">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={acceptCall}
              className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg shadow-black/40 transition hover:brightness-110"
              aria-label="Accept call"
            >
              <Phone className="h-6 w-6" />
            </button>
            <span className="text-[13px] text-[#8696a0]">Accept</span>
          </div>
        </div>
      </div>
    );
  }

  // Active call
  if (activeCall) {
    const isVideo = activeCall.callType === 'video';
    const isOngoing = activeCall.status === 'ongoing';
    // The receiver's copy of the call doc has their own name in receiverName,
    // so show the other person on both sides.
    const iAmReceiver = activeCall.receiverId === user?.uid;
    const peerName = iAmReceiver ? activeCall.callerName : activeCall.receiverName;
    const peerPhoto = iAmReceiver ? activeCall.callerPhoto : activeCall.receiverPhoto;
    const peerId = iAmReceiver ? activeCall.callerId : activeCall.receiverId;

    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-[#0b141a] text-white animate-fade-in"
        onClick={() => {
          if (audioBlocked) unlockAudio();
        }}
      >
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          className="pointer-events-none absolute h-px w-px opacity-0"
        />

        {/* Header */}
        <div className="relative z-20 flex items-center gap-3 px-4 py-4 sm:px-6">
          <img
            src={peerPhoto || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerId}`}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-medium text-white">
              {peerName}
            </h3>
            <p className="flex items-center gap-1.5 text-[12.5px] text-[#8696a0]">
              {isOngoing ? (
                <span className="text-[#06cf9c]">{formatTime(callDuration)}</span>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#06cf9c]" />
                  {isVideo ? 'Video calling…' : 'Calling…'}
                </>
              )}
            </p>
          </div>
          <span className="ml-auto rounded-full border border-white/10 px-3 py-1 text-[11.5px] text-[#8696a0]">
            {isVideo ? 'Video' : 'Voice'}
          </span>
        </div>

        {/* Media area */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          {isVideo ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
              <div className="absolute bottom-5 right-4 h-[150px] w-[110px] overflow-hidden rounded-lg border border-white/15 bg-[#111b21] shadow-xl sm:bottom-8 sm:right-8 sm:h-[200px] sm:w-[150px]">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${isVideoOff ? 'opacity-0' : ''}`}
                />
                {isVideoOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#8696a0]">
                    <VideoOff className="h-5 w-5" />
                    <span className="text-[11px]">Camera off</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center px-6 text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 animate-ping rounded-full bg-[#00a884]/15" />
                <img
                  src={peerPhoto || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerId}`}
                  alt=""
                  className="relative h-[136px] w-[136px] rounded-full object-cover ring-2 ring-white/10"
                />
              </div>
              <h2 className="text-[24px] font-normal text-white">{peerName}</h2>
              <p className="mt-1 text-[14px] text-[#8696a0]">
                {isOngoing ? formatTime(callDuration) : 'Ringing…'}
              </p>

              {audioBlocked && (
                <button
                  onClick={unlockAudio}
                  className="mt-5 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0b141a] shadow-lg"
                >
                  <Volume2 className="h-4 w-4" />
                  Tap to enable sound
                </button>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="z-20 flex items-center justify-center gap-4 border-t border-white/5 bg-black/25 px-4 py-6 backdrop-blur-sm sm:gap-6">
          <button
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              isMuted ? 'bg-white text-[#0b141a]' : 'bg-white/10 text-white hover:bg-white/15'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {isVideo ? (
            <button
              onClick={toggleVideo}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                isVideoOff ? 'bg-white text-[#0b141a]' : 'bg-white/10 text-white hover:bg-white/15'
              }`}
              title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>
          ) : (
            <button
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/40"
              title="Speaker output"
              disabled
            >
              <Volume2 className="h-5 w-5" />
            </button>
          )}

          <button
            onClick={endCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ea0038] text-white shadow-lg shadow-black/40 transition hover:brightness-110"
            title="End call"
          >
            <PhoneOff className="h-6 w-6" />
          </button>

          <button
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/40"
            title="More options"
            disabled
          >
            <VolumeX className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
