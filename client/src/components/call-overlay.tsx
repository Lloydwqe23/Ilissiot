import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCall } from '@/hooks/use-call';
import { useAuth } from '@/hooks/use-auth';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Toast-like notification shown after a call ends */
function CallEndToast({ reason, onDone }: { reason: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const messages: Record<string, string> = {
    rejected: 'Call declined',
    busy: 'User is busy',
    hangup: 'Call ended',
    error: 'Connection lost',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] bg-card border border-border shadow-xl rounded-xl px-6 py-3 text-sm font-medium text-foreground"
    >
      {messages[reason] || 'Call ended'}
    </motion.div>
  );
}

export function CallOverlay() {
  const call = useCall();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);

  // ── Computed display values ──────────────────────────────────────
  const isVideo = call.type === 'video';
  // Re-evaluate whenever the remote stream reference or its tracks change
  const activeRemoteVideoTracks = call.remoteStream?.getVideoTracks().filter(t => t.readyState === 'live' && !t.muted) ?? [];
  const hasRemoteVideo = activeRemoteVideoTracks.length > 0;
  const hasLocalVideo = !!call.localStream?.getVideoTracks().length;
  const showRemoteVideo = hasRemoteVideo;
  const showLocalVideo = hasLocalVideo;
  const participantName = call.participant?.name || 'Unknown';

  // ── Timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (call.state !== 'connected' || !call.startTime) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - call.startTime!);
    }, 1000);
    return () => clearInterval(interval);
  }, [call.state, call.startTime]);

  // ── Attach local video ───────────────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && call.localStream) {
      localVideoRef.current.srcObject = call.localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [call.localStream, call.state, showLocalVideo, showRemoteVideo]);

  // ── Attach remote video ──────────────────────────────────────────
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl) return;
    if (call.remoteStream && showRemoteVideo) {
      videoEl.srcObject = call.remoteStream;
      videoEl.play().catch(() => {});
    } else {
      // Clear the video element so the last frame doesn't linger
      videoEl.srcObject = null;
    }
  }, [call.remoteStream, call.state, showRemoteVideo]);

  // ── Attach remote audio (always, even for video calls) ──────────
  // This hidden <audio> element ensures remote audio is always played
  useEffect(() => {
    if (remoteAudioRef.current && call.remoteStream) {
      remoteAudioRef.current.srcObject = call.remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [call.remoteStream, call.state]);

  // ── Reset ────────────────────────────────────────────────────────
  useEffect(() => {
    if (call.state === 'idle') setElapsed(0);
  }, [call.state]);

  // ── Audio level meters ───────────────────────────────────────────
  useEffect(() => {
    if (call.state !== 'connected') return;
    const streams = [
      { stream: call.localStream, setter: setLocalAudioLevel },
      { stream: call.remoteStream, setter: setRemoteAudioLevel },
    ];
    const cleanups: (() => void)[] = [];

    for (const { stream, setter } of streams) {
      if (!stream || stream.getAudioTracks().length === 0) continue;
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setter(Math.min(100, Math.round((avg / 128) * 100)));
        };
        const interval = setInterval(tick, 100);
        cleanups.push(() => { clearInterval(interval); ctx.close(); });
      } catch { /* Web Audio API not available */ }
    }

    return () => cleanups.forEach(fn => fn());
  }, [call.state, call.localStream, call.remoteStream]);

  // ── Send call history message when call ends ─────────────────────
  useEffect(() => {
    if (call.endReason && call.lastChatId && call.lastIsInitiator) {
      const body = {
        attachments: [{
          name: 'call',
          type: `call/${call.lastCallType}`,
          url: JSON.stringify({
            callType: call.lastCallType,
            endReason: call.endReason,
            duration: call.lastCallDuration,
          }),
        }],
      };
      fetch(`/api/chats/${call.lastChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      }).then(() => {
        // Refresh messages so the sender sees the call history entry
        queryClient.invalidateQueries({ queryKey: ['/api/chats/:chatId/messages', call.lastChatId!.toString()] });
        queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      }).catch(() => {});
    }
  }, [call.endReason]);

  return (
    <>
      {/* ── End-of-call toast ──────────────────────────────────────── */}
      <AnimatePresence>
        {call.state === 'idle' && call.endReason && (
          <CallEndToast reason={call.endReason} onDone={call.clearEndReason} />
        )}
      </AnimatePresence>

      {/* ── Hidden audio element – guarantees remote audio playback ─ */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* ── Main overlay ───────────────────────────────────────────── */}
      <AnimatePresence>
        {call.state !== 'idle' && (
          <motion.div
            key="call-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/85 backdrop-blur-lg" />

            {/* Video area (show whenever we have any remote video track) */}
            {showRemoteVideo && call.state === 'connected' && (
              <>
                {/* Remote video (full screen) */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
                {/* Local video / screen share preview (picture-in-picture) */}
                {showLocalVideo && (
                  <div className="absolute top-6 right-6 w-40 h-28 md:w-52 md:h-36 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl z-10 bg-black">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: call.isSharingScreen ? '' : 'scaleX(-1)' }}
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Center content (avatar, name, status) ── */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-white px-6">
              {((!isVideo && !hasRemoteVideo) || call.state !== 'connected') && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className={`relative ${call.state === 'outgoing' || call.state === 'incoming' ? 'animate-pulse' : ''}`}>
                    <Avatar className="w-28 h-28 border-4 border-white/20">
                      <AvatarImage src={call.participant?.avatarUrl || ''} />
                      <AvatarFallback className="text-3xl bg-primary/30 text-white">
                        {participantName[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    {(call.state === 'outgoing' || call.state === 'incoming') && (
                      <div className="absolute -inset-2 rounded-full border-2 border-white/20 animate-ping" />
                    )}
                  </div>
                  <div className="text-center">
                    <h2 className="text-2xl font-semibold">{participantName}</h2>
                    <p className="text-white/60 text-sm mt-1">
                      {call.state === 'incoming' && `Incoming ${isVideo ? 'video' : ''} call...`}
                      {call.state === 'outgoing' && 'Calling...'}
                      {call.state === 'connected' && formatDuration(elapsed)}
                    </p>
                  </div>

                  {/* Audio level indicators */}
                  {call.state === 'connected' && (
                    <div className="flex flex-col gap-2 w-full max-w-[200px] mt-2">
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <span className="w-10 shrink-0">You</span>
                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-400 rounded-full transition-all duration-100"
                            style={{ width: `${localAudioLevel}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <span className="w-10 shrink-0">Them</span>
                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full transition-all duration-100"
                            style={{ width: `${remoteAudioLevel}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* ── Bottom controls bar ── */}
            <div className="relative z-10 pb-10 pt-4 flex flex-col items-center gap-3">
              {/* Timer for video calls */}
              {(isVideo || hasRemoteVideo) && call.state === 'connected' && (
                <div className="bg-black/40 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-mono text-white">
                  {formatDuration(elapsed)}
                </div>
              )}

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-4"
              >
                {/* ── Incoming call: Accept / Reject ── */}
                {call.state === 'incoming' && (
                  <>
                    <Button
                      onClick={call.rejectCall}
                      size="lg"
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                    >
                      <PhoneOff className="w-7 h-7" />
                    </Button>
                    <Button
                      onClick={call.acceptCall}
                      size="lg"
                      className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30 animate-bounce"
                    >
                      <Phone className="w-7 h-7" />
                    </Button>
                  </>
                )}

                {/* ── Outgoing call: Cancel ── */}
                {call.state === 'outgoing' && (
                  <Button
                    onClick={call.hangup}
                    size="lg"
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </Button>
                )}

                {/* ── Connected: Mute / Video / Hangup ── */}
                {call.state === 'connected' && (
                  <>
                    <Button
                      onClick={call.toggleMute}
                      size="lg"
                      className={`w-14 h-14 rounded-full transition-colors ${
                        call.isMuted
                          ? 'bg-white/30 text-white'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      {call.isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </Button>

                    {isVideo && (
                      <Button
                        onClick={call.toggleVideo}
                        size="lg"
                        className={`w-14 h-14 rounded-full transition-colors ${
                          call.isVideoOff
                            ? 'bg-white/30 text-white'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {call.isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                      </Button>
                    )}

                    {/* screen share button */}
                    {call.state === 'connected' && (
                      <Button
                        onClick={call.isSharingScreen ? call.stopScreenShare : call.startScreenShare}
                        size="lg"
                        title={call.isSharingScreen ? 'Stop sharing screen' : 'Share screen'}
                        className={`w-14 h-14 rounded-full transition-colors ${
                          call.isSharingScreen ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {call.isSharingScreen ? <MonitorOff className="w-6 h-6" /> : <MonitorUp className="w-6 h-6" />}
                      </Button>
                    )}

                    <Button
                      onClick={call.hangup}
                      size="lg"
                      className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
                    >
                      <PhoneOff className="w-7 h-7" />
                    </Button>
                  </>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
