import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { PublicUser } from '../types';

export type TeamCallMediaType = 'audio' | 'video';
export interface TeamCallTarget {
  id: string;
  name: string;
  photoUrl?: string;
}
export interface TeamCallHistoryItem {
  id: string;
  caller_id: string;
  callee_id: string;
  media_type: TeamCallMediaType;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
}

interface CallState {
  id: string;
  peerId: string;
  peerName: string;
  mediaType: TeamCallMediaType;
  direction: 'incoming' | 'outgoing';
  status: string;
  startedAt: number | null;
}

interface SignalPayload {
  type: 'accept' | 'reject' | 'offer' | 'answer' | 'ice' | 'hangup' | 'busy';
  callId: string;
  fromId: string;
  toId: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface TeamCallContextValue {
  startCall: (target: TeamCallTarget, mediaType: TeamCallMediaType) => Promise<void>;
  getCallHistory: (peerId: string) => Promise<TeamCallHistoryItem[]>;
  historyVersion: number;
}

const TeamCallContext = createContext<TeamCallContextValue | null>(null);

export function useTeamCalls(): TeamCallContextValue {
  const value = useContext(TeamCallContext);
  if (!value) throw new Error('useTeamCalls must be used inside TeamCallProvider.');
  return value;
}

export function TeamCallProvider({ currentUser, children }: { currentUser: PublicUser; children: ReactNode }) {
  const [incomingCall, setIncomingCall] = useState<(CallState & { callerPhoto?: string }) | null>(null);
  const [call, setCall] = useState<CallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [callError, setCallError] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);

  const incomingRef = useRef<typeof incomingCall>(null);
  const activeRef = useRef<CallState | null>(null);
  const roomRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimerRef = useRef<number | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { incomingRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeRef.current = call; }, [call]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [localStream, remoteStream, call?.mediaType]);

  const updateSession = useCallback(async (
    callId: string,
    values: Partial<Pick<TeamCallHistoryItem, 'status' | 'started_at' | 'ended_at' | 'duration_seconds'>>
  ) => {
    if (!supabase) return;
    const { error } = await supabase.from('team_call_sessions').update(values).eq('id', callId);
    if (error) throw error;
    setHistoryVersion((v) => v + 1);
  }, []);

  const stopMediaAndConnection = useCallback(async () => {
    if (ringTimerRef.current !== null) {
      window.clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOn(true);
    pendingIceRef.current = [];
    if (roomRef.current && supabase) {
      const channel = roomRef.current;
      roomRef.current = null;
      await supabase.removeChannel(channel);
    }
    activeRef.current = null;
    incomingRef.current = null;
    setIncomingCall(null);
    setCall(null);
  }, []);

  const sendSignal = useCallback(async (type: SignalPayload['type'], extra: Partial<SignalPayload> = {}) => {
    const active = activeRef.current;
    const channel = roomRef.current;
    if (!active || !channel) throw new Error('Call connection is not ready.');
    const payload: SignalPayload = {
      type,
      callId: active.id,
      fromId: currentUser.id,
      toId: active.peerId,
      ...extra,
    };
    const result = await channel.send({ type: 'broadcast', event: 'signal', payload });
    if (result !== 'ok') throw new Error('Could not send call signal. Please try again.');
  }, [currentUser.id]);

  const subscribeToRoom = useCallback(async (callId: string) => {
    if (!supabase) throw new Error('Calling is unavailable because the database is not connected.');
    if (roomRef.current) await supabase.removeChannel(roomRef.current);
    const channel = supabase.channel(`call-room:${callId}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    });
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      const signal = payload as SignalPayload;
      if (signal.toId !== currentUser.id || signal.callId !== callId) return;
      void handleSignalRef.current(signal);
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Call signalling connection timed out.')), 12000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(timeout);
          roomRef.current = channel;
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          window.clearTimeout(timeout);
          reject(new Error('Could not connect to the call server. Please refresh and try again.'));
        }
      });
    });
  }, [currentUser.id]);

  const ensureLocalMedia = useCallback(async (mediaType: TeamCallMediaType) => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone or camera access. Please use the website over HTTPS in an updated browser.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mediaType === 'video',
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const createPeerConnection = useCallback(async (mediaType: TeamCallMediaType) => {
    if (pcRef.current) return pcRef.current;
    const stream = await ensureLocalMedia(mediaType);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal('ice', { candidate: event.candidate.toJSON() }).catch((error) => {
          setCallError(error instanceof Error ? error.message : 'Network connection issue.');
        });
      }
    };
    pc.ontrack = (event) => {
      const streamFromPeer = event.streams[0];
      if (streamFromPeer) setRemoteStream(streamFromPeer);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCall((prev) => prev ? { ...prev, status: 'Connected' } : prev);
        setCallError('');
      } else if (pc.connectionState === 'failed') {
        setCallError('Call connection failed. Your network may require a TURN relay service.');
      }
    };
    pcRef.current = pc;
    return pc;
  }, [ensureLocalMedia, sendSignal]);

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) return;
    const pending = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of pending) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const finishCall = useCallback(async (status: 'completed' | 'rejected' | 'missed' | 'cancelled' | 'failed' | 'busy', notifyPeer: boolean) => {
    const active = activeRef.current;
    if (!active) return;
    if (notifyPeer && roomRef.current) {
      try { await sendSignal('hangup'); } catch { /* peer may already be offline */ }
    }
    const endedAt = Date.now();
    const duration = active.startedAt ? Math.max(0, Math.floor((endedAt - active.startedAt) / 1000)) : 0;
    try {
      await updateSession(active.id, {
        status,
        ended_at: new Date(endedAt).toISOString(),
        duration_seconds: duration,
      });
    } catch { /* keep the local call controls responsive if history sync fails */ }
    await stopMediaAndConnection();
  }, [sendSignal, stopMediaAndConnection, updateSession]);

  const handleSignalRef = useRef<(signal: SignalPayload) => Promise<void>>(async () => undefined);
  handleSignalRef.current = async (signal: SignalPayload) => {
    const active = activeRef.current;
    if (!active || signal.callId !== active.id) {
      const pending = incomingRef.current;
      if (pending && signal.callId === pending.id && signal.type === 'hangup') {
        await stopMediaAndConnection();
      }
      return;
    }
    try {
      if (signal.type === 'accept' && active.direction === 'outgoing') {
        const pc = await createPeerConnection(active.mediaType);
        setCall((prev) => prev ? { ...prev, status: 'Connecting', startedAt: Date.now() } : prev);
        activeRef.current = { ...active, status: 'Connecting', startedAt: Date.now() };
        await updateSession(active.id, { status: 'accepted', started_at: new Date().toISOString() });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal('offer', { description: offer });
      } else if (signal.type === 'offer' && active.direction === 'incoming' && signal.description) {
        const pc = await createPeerConnection(active.mediaType);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.description));
        await flushPendingIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', { description: answer });
        setCall((prev) => prev ? { ...prev, status: 'Connecting' } : prev);
      } else if (signal.type === 'answer' && signal.description) {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.description));
        await flushPendingIce(pc);
      } else if (signal.type === 'ice' && signal.candidate) {
        const pc = pcRef.current;
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          pendingIceRef.current.push(signal.candidate);
        }
      } else if (signal.type === 'reject') {
        await finishCall('rejected', false);
      } else if (signal.type === 'busy') {
        await finishCall('busy', false);
      } else if (signal.type === 'hangup') {
        await finishCall('completed', false);
      }
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Unable to establish the call.');
      await finishCall('failed', false);
    }
  };

  const sendInboxInvite = useCallback(async (target: TeamCallTarget, callId: string, mediaType: TeamCallMediaType) => {
    if (!supabase) throw new Error('Calling is unavailable because the database is not connected.');
    const channel = supabase.channel(`call-inbox:${target.id}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Could not reach the recipient.')), 10000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          window.clearTimeout(timeout);
          reject(new Error('Could not reach the recipient. Please try again.'));
        }
      });
    });
    try {
      const result = await channel.send({
        type: 'broadcast',
        event: 'invite',
        payload: {
          callId,
          fromId: currentUser.id,
          fromName: currentUser.name,
          fromPhoto: currentUser.photoUrl,
          toId: target.id,
          mediaType,
        },
      });
      if (result !== 'ok') throw new Error('Call invitation could not be sent.');
    } finally {
      await supabase.removeChannel(channel);
    }
  }, [currentUser.id, currentUser.name, currentUser.photoUrl]);

  const sendRoomSignal = useCallback(async (
    callId: string,
    type: SignalPayload['type'],
    fromId: string,
    toId: string
  ) => {
    if (!supabase) return;
    const channel = supabase.channel(`call-room:${callId}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Call signalling connection timed out.')), 10000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          window.clearTimeout(timeout);
          reject(new Error('Could not connect to the call server.'));
        }
      });
    });
    try {
      await channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type, callId, fromId, toId },
      });
    } finally {
      await supabase.removeChannel(channel);
    }
  }, []);

  const startCall = useCallback(async (target: TeamCallTarget, mediaType: TeamCallMediaType) => {
    if (!supabase) throw new Error('Calling is unavailable because the database is not connected.');
    if (target.id === currentUser.id) throw new Error('You cannot call your own account.');
    if (activeRef.current || incomingRef.current) throw new Error('Please finish the current call first.');
    setCallError('');
    const { data, error } = await supabase.from('team_call_sessions').insert({
      caller_id: currentUser.id,
      callee_id: target.id,
      media_type: mediaType,
      status: 'ringing',
    }).select('id').single();
    if (error || !data) throw new Error(error?.message || 'Could not create the call.');
    const nextCall: CallState = {
      id: data.id,
      peerId: target.id,
      peerName: target.name,
      mediaType,
      direction: 'outgoing',
      status: 'Ringing',
      startedAt: null,
    };
    activeRef.current = nextCall;
    setCall(nextCall);
    try {
      await subscribeToRoom(nextCall.id);
      await sendInboxInvite(target, nextCall.id, mediaType);
      ringTimerRef.current = window.setTimeout(() => {
        if (activeRef.current?.id === nextCall.id && activeRef.current.status === 'Ringing') {
          void finishCall('missed', true);
        }
      }, 45000);
    } catch (error) {
      await updateSession(nextCall.id, { status: 'failed', ended_at: new Date().toISOString() });
      await stopMediaAndConnection();
      throw error;
    }
  }, [currentUser.id, finishCall, sendInboxInvite, stopMediaAndConnection, subscribeToRoom, updateSession]);

  const acceptIncomingCall = useCallback(async () => {
    const pending = incomingRef.current;
    if (!pending || !supabase) return;
    setIncomingCall(null);
    incomingRef.current = null;
    const accepted: CallState = { ...pending, direction: 'incoming', status: 'Connecting', startedAt: Date.now() };
    activeRef.current = accepted;
    setCall(accepted);
    setCallError('');
    try {
      await subscribeToRoom(accepted.id);
      await createPeerConnection(accepted.mediaType);
      await updateSession(accepted.id, { status: 'accepted', started_at: new Date().toISOString() });
      await sendSignal('accept');
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Could not accept the call.');
      await finishCall('failed', false);
    }
  }, [createPeerConnection, finishCall, sendSignal, subscribeToRoom, updateSession]);

  const rejectIncomingCall = useCallback(async () => {
    const pending = incomingRef.current;
    if (!pending) return;
    setIncomingCall(null);
    incomingRef.current = null;
    try {
      await sendRoomSignal(pending.id, 'reject', currentUser.id, pending.peerId);
      await updateSession(pending.id, { status: 'rejected', ended_at: new Date().toISOString(), duration_seconds: 0 });
    } catch { /* the caller will mark the invitation as missed if unreachable */ }
    await stopMediaAndConnection();
    setHistoryVersion((v) => v + 1);
  }, [currentUser.id, sendRoomSignal, stopMediaAndConnection, updateSession]);

  const handleIncomingInvite = useCallback(async (payload: Record<string, unknown>) => {
    const callId = typeof payload.callId === 'string' ? payload.callId : '';
    const fromId = typeof payload.fromId === 'string' ? payload.fromId : '';
    const fromName = typeof payload.fromName === 'string' ? payload.fromName : 'Team member';
    const fromPhoto = typeof payload.fromPhoto === 'string' ? payload.fromPhoto : '';
    const mediaType = payload.mediaType === 'video' ? 'video' : 'audio';
    if (!callId || !fromId || payload.toId !== currentUser.id) return;
    if (activeRef.current || incomingRef.current) {
      void sendRoomSignal(callId, 'busy', currentUser.id, fromId);
      return;
    }
    const pending = {
      id: callId,
      peerId: fromId,
      peerName: fromName,
      mediaType,
      direction: 'incoming' as const,
      status: 'Incoming call',
      startedAt: null,
      callerPhoto: fromPhoto,
    };
    incomingRef.current = pending;
    setIncomingCall(pending);
    void subscribeToRoom(callId).catch(() => {
      setCallError('Unable to connect to the incoming call. Please ask the caller to try again.');
    });
  }, [currentUser.id, sendRoomSignal, subscribeToRoom]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(`call-inbox:${currentUser.id}`, {
      config: { private: true, broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'invite' }, ({ payload }) => {
      void handleIncomingInvite(payload as Record<string, unknown>);
    });
    channel.subscribe();
    return () => {
      void supabase?.removeChannel(channel);
      if (activeRef.current) void finishCall('cancelled', false);
    };
  }, [currentUser.id, finishCall, handleIncomingInvite]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraOn(next);
  };
  const endCall = () => { void finishCall(call?.direction === 'outgoing' && !call.startedAt ? 'cancelled' : 'completed', true); };

  const getCallHistory = useCallback(async (peerId: string): Promise<TeamCallHistoryItem[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('team_call_sessions')
      .select('id,caller_id,callee_id,media_type,status,created_at,started_at,ended_at,duration_seconds')
      .or(`and(caller_id.eq.${currentUser.id},callee_id.eq.${peerId}),and(caller_id.eq.${peerId},callee_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: false })
      .limit(8);
    if (error) throw error;
    return (data || []) as TeamCallHistoryItem[];
  }, [currentUser.id]);

  const contextValue = useMemo(() => ({ startCall, getCallHistory, historyVersion }), [startCall, getCallHistory, historyVersion]);

  return (
    <TeamCallContext.Provider value={contextValue}>
      {children}
      {incomingCall && (
        <div className="fixed inset-0 z-[130] bg-slate-950/65 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label="Incoming team call">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center">
            <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
              {incomingCall.mediaType === 'video' ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Incoming {incomingCall.mediaType} call</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{incomingCall.peerName}</h2>
            <p className="mt-1 text-sm text-slate-500">is calling you</p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={() => void rejectIncomingCall()} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white"><PhoneOff className="h-4 w-4" /> Reject</button>
              <button type="button" onClick={() => void acceptIncomingCall()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"><Phone className="h-4 w-4" /> Accept</button>
            </div>
          </div>
        </div>
      )}
      {call && (
        <div className="fixed inset-0 z-[125] bg-slate-950/95 flex flex-col items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Team call">
          <div className="w-full max-w-4xl flex items-center justify-between gap-3 text-white mb-3">
            <div className="min-w-0"><p className="font-semibold truncate">{call.peerName}</p><p className="text-xs text-slate-300">{call.mediaType === 'video' ? 'Video call' : 'Audio call'} · {call.status}</p></div>
            <button type="button" onClick={endCall} aria-label="End call" className="p-2 rounded-lg bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
          </div>
          <div className="relative w-full max-w-4xl aspect-video rounded-2xl bg-slate-900 overflow-hidden flex items-center justify-center">
            {call.mediaType === 'video' ? (
              <>
                <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute right-3 bottom-3 w-28 sm:w-44 aspect-video rounded-xl border border-white/40 bg-slate-800 object-cover" />
              </>
            ) : (
              <div className="text-center text-white"><div className="mx-auto mb-3 h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center"><Phone className="h-8 w-8" /></div><p className="text-lg font-semibold">{call.peerName}</p><audio ref={remoteAudioRef} autoPlay /></div>
            )}
          </div>
          {callError && <p className="mt-3 max-w-2xl text-center text-sm text-amber-300">{callError}</p>}
          <div className="mt-5 flex items-center justify-center gap-3">
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} className={`h-12 w-12 rounded-full flex items-center justify-center ${muted ? 'bg-amber-500' : 'bg-white/15'} text-white`}>{muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button>
            {call.mediaType === 'video' && <button type="button" onClick={toggleCamera} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} className={`h-12 w-12 rounded-full flex items-center justify-center ${cameraOn ? 'bg-white/15' : 'bg-amber-500'} text-white`}>{cameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}</button>}
            <button type="button" onClick={endCall} aria-label="End call" className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"><PhoneOff className="h-5 w-5" /></button>
          </div>
        </div>
      )}
      {callError && !call && (
        <div className="fixed bottom-4 left-1/2 z-[140] -translate-x-1/2 max-w-[92vw] rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl flex items-center gap-3">
          <span>{callError}</span><button type="button" onClick={() => setCallError('')} aria-label="Dismiss call error"><X className="h-4 w-4" /></button>
        </div>
      )}
    </TeamCallContext.Provider>
  );
}
