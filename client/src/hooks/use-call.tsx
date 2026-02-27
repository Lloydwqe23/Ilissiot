import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────
export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected';
export type CallType = 'audio' | 'video';

export interface CallParticipant {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

// Reason the call ended (used for notifications & history)
export type CallEndReason = 'hangup' | 'rejected' | 'busy' | 'missed' | 'error' | null;

interface CallContextValue {
  state: CallState;
  type: CallType;
  participant: CallParticipant | null;
  chatId: number | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startTime: number | null;
  isMuted: boolean;
  isVideoOff: boolean;
  endReason: CallEndReason;
  /** Duration of the last finished call in ms (for call history) */
  lastCallDuration: number | null;
  /** chatId of the last finished call (survives reset) */
  lastChatId: number | null;
  /** type of the last finished call (survives reset) */
  lastCallType: CallType;
  /** Whether current user initiated the last call (only initiator posts history) */
  lastIsInitiator: boolean;

  setWsSend: (fn: (msg: any) => void) => void;
  startCall: (participant: CallParticipant, chatId: number, type: CallType, callerName?: string, callerAvatar?: string | null) => Promise<void>;
  handleIncomingOffer: (payload: any) => void;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  handleAnswer: (payload: any) => void;
  handleIceCandidate: (payload: any) => void;
  handleRemoteHangup: () => void;
  handleRemoteReject: () => void;
  handleRemoteBusy: () => void;
  /** Clear the endReason after it's been consumed */
  clearEndReason: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

// Google STUN servers (free, always available)
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function CallProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CallState>('idle');
  const [type, setType] = useState<CallType>('audio');
  const [participant, setParticipant] = useState<CallParticipant | null>(null);
  const [chatId, setChatId] = useState<number | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [endReason, setEndReason] = useState<CallEndReason>(null);
  const [lastCallDuration, setLastCallDuration] = useState<number | null>(null);
  const [lastChatId, setLastChatId] = useState<number | null>(null);
  const [lastCallType, setLastCallType] = useState<CallType>('audio');
  const [lastIsInitiator, setLastIsInitiator] = useState(false);
  const isInitiatorRef = useRef(false);
  // Counter to force re-render when remote tracks change
  const [remoteTrackVersion, setRemoteTrackVersion] = useState(0);

  const wsSendRef = useRef<((msg: any) => void) | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingOfferRef = useRef<any>(null);
  // Persistent remote stream ref – keep ONE MediaStream instance
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    remoteStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    remoteStreamRef.current = null;
    localStreamRef.current = null;
  }, []);

  const resetState = useCallback((reason: CallEndReason = null) => {
    // Capture call metadata before reset (for call history message)
    if (startTimeRef.current) {
      setLastCallDuration(Date.now() - startTimeRef.current);
    }
    // Preserve chatId, type & initiator so the overlay can send the history message
    setChatId(prev => { setLastChatId(prev); return null; });
    setType(prev => { setLastCallType(prev); return prev; });
    setLastIsInitiator(isInitiatorRef.current);
    isInitiatorRef.current = false;
    setEndReason(reason);
    setState('idle');
    setParticipant(null);
    setLocalStream(null);
    setRemoteStream(null);
    setStartTime(null);
    startTimeRef.current = null;
    setIsMuted(false);
    setIsVideoOff(false);
    pendingOfferRef.current = null;
  }, []);

  const clearEndReason = useCallback(() => {
    setEndReason(null);
    setLastCallDuration(null);
    setLastChatId(null);
    setLastIsInitiator(false);
  }, []);

  const setWsSend = useCallback((fn: (msg: any) => void) => {
    wsSendRef.current = fn;
  }, []);

  /** Set up a peer connection with common handlers */
  const createPC = useCallback((targetUserId: string): { pc: RTCPeerConnection; remote: MediaStream } => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Create ONE persistent remote MediaStream
    const remote = new MediaStream();
    remoteStreamRef.current = remote;

    pc.ontrack = (event) => {
      // Add every incoming track to our single MediaStream instance
      const track = event.track;
      if (!remote.getTrackById(track.id)) {
        remote.addTrack(track);
      }
      // Bump version to force re-render & re-wire audio/video elements
      setRemoteTrackVersion(v => v + 1);
      // Also set the state so new consumers pick it up
      setRemoteStream(remote);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsSendRef.current) {
        wsSendRef.current({
          type: 'call:ice-candidate',
          payload: { targetUserId, candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        wsSendRef.current?.({
          type: 'call:hangup',
          payload: { targetUserId },
        });
        cleanupMedia();
        resetState('error');
      }
    };

    return { pc, remote };
  }, [cleanupMedia, resetState]);

  // ── Initiate an outgoing call ────────────────────────────────────
  const startCall = useCallback(async (p: CallParticipant, cId: number, callType: CallType, callerName?: string, callerAvatar?: string | null) => {
    if (!wsSendRef.current || state !== 'idle') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      localStreamRef.current = stream;

      const { pc, remote } = createPC(p.userId);

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsSendRef.current({
        type: 'call:offer',
        payload: { targetUserId: p.userId, chatId: cId, callType, sdp: offer, callerName, callerAvatar },
      });

      pcRef.current = pc;
      isInitiatorRef.current = true;
      setState('outgoing');
      setType(callType);
      setParticipant(p);
      setChatId(cId);
      setLocalStream(stream);
      setRemoteStream(remote);
      setIsMuted(false);
      setIsVideoOff(false);
      setEndReason(null);
    } catch (err) {
      console.error('[Call] Failed to start:', err);
    }
  }, [state, createPC]);

  // ── Handle incoming call offer ───────────────────────────────────
  const handleIncomingOffer = useCallback((payload: any) => {
    if (state !== 'idle') {
      wsSendRef.current?.({
        type: 'call:busy',
        payload: { targetUserId: payload.fromUserId },
      });
      return;
    }

    pendingOfferRef.current = payload.sdp;
    setState('incoming');
    setType(payload.callType || 'audio');
    setChatId(payload.chatId);
    setParticipant({
      userId: payload.fromUserId,
      name: payload.callerName || 'Unknown',
      avatarUrl: payload.callerAvatar || null,
    });
    setEndReason(null);
  }, [state]);

  // ── Accept the incoming call ─────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!wsSendRef.current || !participant) return;
    const offerSdp = pendingOfferRef.current;
    pendingOfferRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      localStreamRef.current = stream;

      const { pc, remote } = createPC(participant.userId);

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsSendRef.current({
        type: 'call:answer',
        payload: { targetUserId: participant.userId, sdp: answer },
      });

      pcRef.current = pc;
      setState('connected');
      setLocalStream(stream);
      setRemoteStream(remote);
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
      setIsMuted(false);
      setIsVideoOff(false);
    } catch (err) {
      console.error('[Call] Failed to accept:', err);
      rejectCall();
    }
  }, [participant, type, createPC]);

  // ── Reject the incoming call ─────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (wsSendRef.current && participant) {
      wsSendRef.current({
        type: 'call:reject',
        payload: { targetUserId: participant.userId },
      });
    }
    cleanupMedia();
    resetState();
  }, [participant, cleanupMedia, resetState]);

  // ── Hang up ──────────────────────────────────────────────────────
  const hangup = useCallback(() => {
    if (wsSendRef.current && participant) {
      wsSendRef.current({
        type: 'call:hangup',
        payload: { targetUserId: participant.userId },
      });
    }
    cleanupMedia();
    resetState('hangup');
  }, [participant, cleanupMedia, resetState]);

  // ── Handle answer from remote ────────────────────────────────────
  const handleAnswer = useCallback(async (payload: any) => {
    if (!pcRef.current) return;
    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      setState('connected');
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
    } catch (err) {
      console.error('[Call] Failed to set remote description:', err);
    }
  }, []);

  // ── Handle ICE candidate ─────────────────────────────────────────
  const handleIceCandidate = useCallback(async (payload: any) => {
    if (!pcRef.current) return;
    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch (err) {
      console.error('[Call] Failed to add ICE candidate:', err);
    }
  }, []);

  // ── Remote party hung up ─────────────────────────────────────────
  const handleRemoteHangup = useCallback(() => {
    cleanupMedia();
    resetState('hangup');
  }, [cleanupMedia, resetState]);

  // ── Remote party rejected ────────────────────────────────────────
  const handleRemoteReject = useCallback(() => {
    cleanupMedia();
    resetState('rejected');
  }, [cleanupMedia, resetState]);

  // ── Remote party is busy ─────────────────────────────────────────
  const handleRemoteBusy = useCallback(() => {
    cleanupMedia();
    resetState('busy');
  }, [cleanupMedia, resetState]);

  // ── Toggle mute ──────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      const newMuted = !isMuted;
      stream.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  // ── Toggle video ─────────────────────────────────────────────────
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      const newOff = !isVideoOff;
      stream.getVideoTracks().forEach(t => { t.enabled = !newOff; });
      setIsVideoOff(newOff);
    }
  }, [isVideoOff]);

  const value: CallContextValue = {
    state, type, participant, chatId,
    localStream, remoteStream, startTime,
    isMuted, isVideoOff, endReason, lastCallDuration, lastChatId, lastCallType, lastIsInitiator,
    setWsSend, startCall, handleIncomingOffer,
    acceptCall, rejectCall, hangup,
    toggleMute, toggleVideo,
    handleAnswer, handleIceCandidate,
    handleRemoteHangup, handleRemoteReject, handleRemoteBusy,
    clearEndReason,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
