import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from './AuthContext';
import { CallSession, CallType } from '../types';
import { sounds } from '../services/sound';
import { notifyRecipients } from '../services/push';

interface CallContextType {
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  startCall: (receiverId: string, receiverName: string, receiverPhoto: string | undefined, type: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const unsubscribeCallRef = useRef<(() => void) | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<CallSession | null>(null);
  const outgoingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Listen for incoming calls (equality only — no composite index needed)
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) {
      setIncomingCall(null);
      return;
    }

    const callsQuery = query(
      collection(db, 'calls'),
      where('receiverId', '==', uid),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      callsQuery,
      (snapshot) => {
        const live =
          snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }) as CallSession)
            .filter((c) => c.status === 'calling' || c.status === 'ringing')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ||
          null;

        setIncomingCall((prev) => {
          if (!live) {
            if (prev) sounds.stopRingtone();
            return null;
          }
          if (activeCallRef.current) return prev;
          if (!prev || prev.id !== live.id) sounds.startRingtone();
          return live;
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'calls');
      }
    );

    return () => {
      unsubscribe();
      sounds.stopRingtone();
    };
  }, [uid]);

  // Fallback: if the caller's tab died, stop ringing after 60s and log a miss.
  useEffect(() => {
    if (!incomingCall) return;
    if (incomingCall.status !== 'calling' && incomingCall.status !== 'ringing') return;
    const callId = incomingCall.id;
    const timer = window.setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'calls', callId));
        const data = snap.data();
        if (data && (data.status === 'calling' || data.status === 'ringing')) {
          await updateDoc(doc(db, 'calls', callId), {
            status: 'missed',
            endedAt: new Date().toISOString(),
          });
        }
      } catch {
        // The caller may have ended it already.
      }
    }, 60000);
    return () => window.clearTimeout(timer);
  }, [incomingCall?.id, incomingCall?.status]);

  // Duration timer when call is ongoing
  useEffect(() => {
    if (activeCall?.status === 'ongoing') {
      sounds.stopDialTone();
      sounds.stopRingtone();
      if (!durationTimerRef.current) {
        durationTimerRef.current = window.setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (!activeCall) {
        setCallDuration(0);
      }
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [activeCall?.status]);

  // Clean up streams & peer connection
  const cleanupStreams = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    sounds.stopDialTone();
    sounds.stopRingtone();
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    if (unsubscribeCallRef.current) {
      unsubscribeCallRef.current();
      unsubscribeCallRef.current = null;
    }
  };

  // Start outgoing call
  const startCall = async (
    receiverId: string,
    receiverName: string,
    receiverPhoto: string | undefined,
    type: CallType
  ) => {
    if (!user || !profile) return;
    cleanupStreams();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote tracks
      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remote.addTrack(track);
        });
      };

      // Create Call document in Firestore
      const callDocRef = doc(collection(db, 'calls'));
      const callData: CallSession = {
        id: callDocRef.id,
        callerId: user.uid,
        callerName: profile.displayName,
        callerPhoto: profile.photoURL,
        receiverId,
        receiverName,
        receiverPhoto,
        callType: type,
        status: 'calling',
        createdAt: new Date().toISOString(),
      };

      await setDoc(callDocRef, callData);
      setActiveCall(callData);
      sounds.startDialTone();

      // Nobody picked up: close the call so both sides log it as missed.
      outgoingTimeoutRef.current = window.setTimeout(() => {
        outgoingTimeoutRef.current = null;
        const current = activeCallRef.current;
        if (!current || current.id !== callData.id || current.status === 'ongoing') return;
        updateDoc(callDocRef, {
          status: 'missed',
          endedAt: new Date().toISOString(),
        }).catch(() => {});
      }, 45000);

      // Alert the receiver's device even when their app is closed.
      user
        .getIdToken()
        .then((idToken) => notifyRecipients({ callId: callData.id }, idToken))
        .catch(() => {});

      // Collect ICE candidates
      const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(callerCandidatesCol, event.candidate.toJSON()).catch(() => {});
        }
      };

      // Create Offer
      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      await updateDoc(callDocRef, {
        offer: {
          type: offerDescription.type,
          sdp: offerDescription.sdp,
        },
      });

      // Listen for Answer and Receiver Candidates
      const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
        const data = snapshot.data() as CallSession | undefined;
        if (!data) return;

        if (data.status === 'rejected' || data.status === 'ended' || data.status === 'missed') {
          sounds.playEndCall();
          cleanupStreams();
          setActiveCall(null);
          return;
        }

        if (data.status === 'ongoing' && !pc.currentRemoteDescription && data.answer) {
          const answerDesc = new RTCSessionDescription(data.answer);
          await pc.setRemoteDescription(answerDesc);
          setActiveCall((prev) => (prev ? { ...prev, status: 'ongoing' } : null));
        }
      });
      unsubscribeCallRef.current = unsubscribe;

      // Listen for remote ICE candidates from receiver
      const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');
      onSnapshot(receiverCandidatesCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            try {
              await pc.addIceCandidate(candidate);
            } catch (err) {
              console.warn('ICE add error', err);
            }
          }
        });
      });
    } catch (err) {
      console.error('Call failed to initiate:', err);
      cleanupStreams();
      sounds.playEndCall();
      alert('Unable to access camera or microphone. Please check browser permissions.');
    }
  };

  // Accept incoming call
  const acceptCall = async () => {
    if (!incomingCall || !user) return;
    const callData = incomingCall;
    setIncomingCall(null);
    sounds.stopRingtone();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callData.callType === 'video',
      });
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          remote.addTrack(track);
        });
      };

      const callDocRef = doc(db, 'calls', callData.id);
      const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(receiverCandidatesCol, event.candidate.toJSON()).catch(() => {});
        }
      };

      const callSnapshot = await getDoc(callDocRef);
      const callDocData = callSnapshot.data();

      if (!callDocData?.offer) {
        throw new Error('Call offer not found');
      }

      await pc.setRemoteDescription(new RTCSessionDescription(callDocData.offer));

      const answerDesc = await pc.createAnswer();
      await pc.setLocalDescription(answerDesc);

      await updateDoc(callDocRef, {
        answer: {
          type: answerDesc.type,
          sdp: answerDesc.sdp,
        },
        status: 'ongoing',
      });

      setActiveCall({ ...callData, status: 'ongoing' });

      // Listen for caller ICE candidates
      const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
      onSnapshot(callerCandidatesCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.warn('ICE add error', e);
            }
          }
        });
      });

      // Listen for call termination
      const unsubscribe = onSnapshot(callDocRef, (snap) => {
        const d = snap.data();
        if (d?.status === 'ended' || d?.status === 'rejected' || d?.status === 'missed') {
          sounds.playEndCall();
          cleanupStreams();
          setActiveCall(null);
        }
      });
      unsubscribeCallRef.current = unsubscribe;
    } catch (err) {
      console.error('Failed to answer call:', err);
      rejectCall();
      alert('Camera/Microphone access required to answer the call.');
    }
  };

  // Reject incoming call
  const rejectCall = async () => {
    if (!incomingCall) return;
    sounds.stopRingtone();
    const callDocRef = doc(db, 'calls', incomingCall.id);
    setIncomingCall(null);
    try {
      await updateDoc(callDocRef, {
        status: 'rejected',
        endedAt: new Date().toISOString(),
      });
    } catch {}
  };

  // End active call
  const endCall = async () => {
    if (activeCall) {
      const callDocRef = doc(db, 'calls', activeCall.id);
      try {
        await updateDoc(callDocRef, {
          status: 'ended',
          duration: callDuration,
          endedAt: new Date().toISOString(),
        });
      } catch {}
    }
    sounds.playEndCall();
    cleanupStreams();
    setActiveCall(null);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  return (
    <CallContext.Provider
      value={{
        activeCall,
        incomingCall,
        localStream,
        remoteStream,
        isMuted,
        isVideoOff,
        callDuration,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
}
