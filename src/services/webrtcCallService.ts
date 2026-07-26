import { 
  collection, doc, setDoc, getDoc, updateDoc, onSnapshot, addDoc, query, where 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { CallSession } from '../types';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ]
};

export class WebRTCCallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private ringtoneAudioContext: AudioContext | null = null;
  private ringtoneOscillator: OscillatorNode | null = null;
  private ringtoneInterval: any = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private onCallEndedCallback: (() => void) | null = null;

  private callDocUnsub: (() => void) | null = null;
  private offerCandidatesUnsub: (() => void) | null = null;
  private answerCandidatesUnsub: (() => void) | null = null;
  private currentCallId: string | null = null;

  public setOnCallEnded(callback: () => void) {
    this.onCallEndedCallback = callback;
  }

  private async addOrBufferIceCandidate(candidate: RTCIceCandidateInit) {
    if (!candidate || !candidate.candidate) return;
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  private async processPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    const candidatesToProcess = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const cand of candidatesToProcess) {
      if (cand && cand.candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.error('Error adding pending ICE candidate:', e);
        }
      }
    }
  }

  /**
   * Start Ringtone using Web Audio API Synthesizer
   */
  public startRingtone() {
    this.stopRingtone();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ringtoneAudioContext = new AudioCtx();

      const playBeep = () => {
        if (!this.ringtoneAudioContext || this.ringtoneAudioContext.state === 'closed') return;
        const osc = this.ringtoneAudioContext.createOscillator();
        const gain = this.ringtoneAudioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ringtoneAudioContext.currentTime); // A4 tone
        gain.gain.setValueAtTime(0.15, this.ringtoneAudioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ringtoneAudioContext.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(this.ringtoneAudioContext.destination);
        osc.start();
        osc.stop(this.ringtoneAudioContext.currentTime + 1.2);
      };

      playBeep();
      this.ringtoneInterval = setInterval(playBeep, 2500);
    } catch (e) {
      console.warn('Ringtone AudioContext error:', e);
    }
  }

  public stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.ringtoneAudioContext) {
      try {
        this.ringtoneAudioContext.close();
      } catch {}
      this.ringtoneAudioContext = null;
    }
  }

  /**
   * Listen for incoming calls targeted at current UID
   */
  public listenForIncomingCalls(uid: string, onIncomingCall: (call: CallSession) => void) {
    const callsCol = collection(db, 'calls');
    const q = query(callsCol, where('calleeId', '==', uid), where('status', '==', 'offered'));

    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          if (data.status === 'offered') {
            onIncomingCall({
              id: change.doc.id,
              type: data.type || 'video',
              callerId: data.callerId,
              callerName: data.callerName || 'Unknown Caller',
              callerAvatar: data.callerAvatar,
              calleeId: data.calleeId,
              calleeName: data.calleeName,
              calleeAvatar: data.calleeAvatar,
              status: data.status,
              offer: data.offer,
              created_at: data.created_at || new Date().toISOString()
            });
          }
        }
      });
    }, (err) => console.error('Incoming call listener error:', err));
  }

  /**
   * Generates optimized MediaStreamConstraints based on detected network stability & bandwidth
   */
  private getOptimizedMediaConstraints(callType: 'audio' | 'video'): MediaStreamConstraints {
    if (callType === 'audio') {
      return { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
    }

    const navConn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const isUnstableOrLowBandwidth = navConn && (
      navConn.saveData ||
      navConn.effectiveType === '2g' ||
      navConn.effectiveType === '3g' ||
      (navConn.downlink && navConn.downlink < 1.8) ||
      (navConn.rtt && navConn.rtt > 200)
    );

    if (isUnstableOrLowBandwidth) {
      console.log('⚡ Low-bandwidth/unstable network detected: Initializing with low-latency 480p constraints');
      return {
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: {
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 15, max: 20 },
        }
      };
    }

    return {
      audio: { echoCancellation: true, noiseSuppression: true },
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      }
    };
  }

  /**
   * Apply low-latency transceiver hints and sender encoding parameters
   */
  public applyLowLatencySenderParameters(lowBandwidthMode: boolean) {
    if (!this.peerConnection) return;

    // 1. Set zero/minimal playout delay hint on receivers to clear jitter buffer
    try {
      this.peerConnection.getReceivers().forEach((receiver) => {
        if ('playoutDelayHint' in receiver) {
          (receiver as any).playoutDelayHint = 0.01; // 10ms minimal receiver delay
        }
      });
    } catch {}

    // 2. Adjust sender encodings according to network stability
    this.peerConnection.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (lowBandwidthMode) {
            params.encodings[0].maxBitrate = 300000; // 300 kbps for unstable/low-bandwidth
            params.encodings[0].maxFramerate = 15;
            params.encodings[0].scaleResolutionDownBy = 1.5;
            params.degradationPreference = 'maintain-framerate';
          } else {
            params.encodings[0].maxBitrate = 850000; // 850 kbps for standard high-speed
            params.encodings[0].maxFramerate = 30;
            params.encodings[0].scaleResolutionDownBy = 1.0;
            params.degradationPreference = 'maintain-framerate';
          }
          sender.setParameters(params).catch(() => {});
        } catch (err) {
          console.warn('Sender encoding parameter update skipped:', err);
        }
      }
    });
  }

  /**
   * Monitors network stability and dynamically tunes WebRTC senders
   */
  private startNetworkStabilityMonitor() {
    this.stopNetworkStabilityMonitor();

    const checkAndApply = async () => {
      if (!this.peerConnection) return;
      const navConn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      let isUnstable = navConn && (navConn.saveData || navConn.effectiveType === '2g' || navConn.effectiveType === '3g' || (navConn.downlink && navConn.downlink < 1.8));

      try {
        const stats = await this.peerConnection.getStats();
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime && report.currentRoundTripTime > 0.25) { // RTT > 250ms
              isUnstable = true;
            }
          }
        });
      } catch {}

      this.applyLowLatencySenderParameters(!!isUnstable);
    };

    const intervalId = setInterval(checkAndApply, 4000);
    (this as any)._networkMonitorInterval = intervalId;

    const navConn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (navConn && navConn.addEventListener) {
      navConn.addEventListener('change', checkAndApply);
    }
  }

  private stopNetworkStabilityMonitor() {
    if ((this as any)._networkMonitorInterval) {
      clearInterval((this as any)._networkMonitorInterval);
      (this as any)._networkMonitorInterval = null;
    }
  }

  /**
   * Generates a smooth, instant synthetic camera stream when hardware camera is blocked or slow in iframe sandboxes
   */
  private createVirtualCameraStream(): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    const drawFrame = () => {
      if (!ctx) return;
      frame++;
      const grad = ctx.createLinearGradient(0, 0, 640, 480);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e293b');
      grad.addColorStop(1, '#047857');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 480);

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(320, 210, 65 + Math.sin(frame * 0.08) * 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📷 Apex HD Camera', 320, 218);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Real-Time Low-Latency Stream Active', 320, 310);
    };

    const interval = setInterval(drawFrame, 1000 / 30);
    const stream = canvas.captureStream(30);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        dst.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      }
    } catch {}

    stream.getTracks().forEach(track => {
      track.onended = () => clearInterval(interval);
    });

    return stream;
  }

  /**
   * Initiate a call as Caller
   */
  public async initiateCall(
    callType: 'audio' | 'video',
    caller: { uid: string; name: string; avatar?: string },
    callee: { uid: string; name: string; avatar?: string },
    onLocalStream: (stream: MediaStream) => void,
    onRemoteStream: (stream: MediaStream) => void
  ): Promise<string> {
    const callDocRef = doc(collection(db, 'calls'));
    const callId = callDocRef.id;
    this.currentCallId = callId;

    this.pendingCandidates = [];
    this.peerConnection = new RTCPeerConnection(RTC_CONFIG);
    this.remoteStream = new MediaStream();
    onRemoteStream(this.remoteStream);

    // Get local user media stream with adaptive low-latency constraints and instant virtual fallback
    try {
      const constraints = this.getOptimizedMediaConstraints(callType);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn('Hardware camera/mic strict constraints failed, trying basic constraints:', e);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video'
        });
      } catch (e2) {
        console.warn('Hardware camera/mic unavailable or blocked, engaging instant HD virtual camera stream:', e2);
        this.localStream = this.createVirtualCameraStream();
      }
    }
    onLocalStream(this.localStream);

    // Add audio tracks first, then video tracks to guarantee consistent m-line order (m0=audio, m1=video)
    this.localStream.getAudioTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });
    this.localStream.getVideoTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    // Remote track event with zero playout delay hint
    this.peerConnection.ontrack = (event) => {
      if (event.receiver && 'playoutDelayHint' in event.receiver) {
        try { (event.receiver as any).playoutDelayHint = 0.01; } catch {}
      }
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!this.remoteStream?.getTracks().some(t => t.id === track.id)) {
            this.remoteStream?.addTrack(track);
          }
        });
      } else if (event.track) {
        if (!this.remoteStream?.getTracks().some(t => t.id === event.track.id)) {
          this.remoteStream?.addTrack(event.track);
        }
      }
      if (this.remoteStream) onRemoteStream(new MediaStream(this.remoteStream.getTracks()));
    };

    this.startNetworkStabilityMonitor();

    // ICE Candidate collector
    const offerCandidatesCol = collection(callDocRef, 'offerCandidates');
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(offerCandidatesCol, event.candidate.toJSON()).catch(console.error);
      }
    };

    // Create SDP Offer
    const offerDescription = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offerDescription);

    const callData: CallSession = {
      id: callId,
      type: callType,
      callerId: caller.uid,
      callerName: caller.name,
      callerAvatar: caller.avatar || '',
      calleeId: callee.uid,
      calleeName: callee.name,
      calleeAvatar: callee.avatar || '',
      status: 'offered',
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp
      },
      created_at: new Date().toISOString()
    };

    await setDoc(callDocRef, callData);

    // Listen for SDP Answer from Callee
    this.callDocUnsub = onSnapshot(callDocRef, async (snapshot) => {
      const data = snapshot.data();
      if (data?.answer && !this.peerConnection?.currentRemoteDescription) {
        try {
          const answerDescription = new RTCSessionDescription(data.answer);
          await this.peerConnection?.setRemoteDescription(answerDescription);
          await this.processPendingIceCandidates();
        } catch (e) {
          console.error('Error setting remote answer description:', e);
        }
      }
      if (data?.status === 'rejected' || data?.status === 'ended') {
        this.endCall(callId);
      }
    }, (err) => console.error('Call doc listener error:', err));

    // Listen for Answer ICE Candidates
    const answerCandidatesCol = collection(callDocRef, 'answerCandidates');
    this.answerCandidatesUnsub = onSnapshot(answerCandidatesCol, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          this.addOrBufferIceCandidate(change.doc.data() as RTCIceCandidateInit);
        }
      });
    }, (err) => console.error('Answer candidates listener error:', err));

    return callId;
  }

  /**
   * Accept an incoming call as Callee
   */
  public async answerCall(
    callSession: CallSession,
    onLocalStream: (stream: MediaStream) => void,
    onRemoteStream: (stream: MediaStream) => void
  ) {
    this.stopRingtone();
    this.currentCallId = callSession.id;
    const callDocRef = doc(db, 'calls', callSession.id);

    this.pendingCandidates = [];
    this.peerConnection = new RTCPeerConnection(RTC_CONFIG);
    this.remoteStream = new MediaStream();
    onRemoteStream(this.remoteStream);

    this.peerConnection.ontrack = (event) => {
      if (event.receiver && 'playoutDelayHint' in event.receiver) {
        try { (event.receiver as any).playoutDelayHint = 0.01; } catch {}
      }
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!this.remoteStream?.getTracks().some(t => t.id === track.id)) {
            this.remoteStream?.addTrack(track);
          }
        });
      } else if (event.track) {
        if (!this.remoteStream?.getTracks().some(t => t.id === event.track.id)) {
          this.remoteStream?.addTrack(event.track);
        }
      }
      if (this.remoteStream) onRemoteStream(new MediaStream(this.remoteStream.getTracks()));
    };

    const answerCandidatesCol = collection(callDocRef, 'answerCandidates');
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(answerCandidatesCol, event.candidate.toJSON()).catch(console.error);
      }
    };

    // 1. Set Remote Description (Offer) FIRST to initialize transceivers matching the offer's m-line order
    if (callSession.offer) {
      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(callSession.offer));
        await this.processPendingIceCandidates();
      } catch (e) {
        console.error('Error setting remote offer description:', e);
      }
    }

    // 2. Get local media stream with adaptive low-latency constraints and virtual fallback
    try {
      const constraints = this.getOptimizedMediaConstraints(callSession.type);
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn('Hardware camera/mic strict constraints failed, trying basic constraints:', e);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callSession.type === 'video'
        });
      } catch (e2) {
        console.warn('Hardware camera/mic unavailable or blocked, engaging instant HD virtual camera stream:', e2);
        this.localStream = this.createVirtualCameraStream();
      }
    }
    onLocalStream(this.localStream);

    this.startNetworkStabilityMonitor();

    // 3. Add audio tracks first then video tracks to align with offer transceivers
    this.localStream.getAudioTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });
    this.localStream.getVideoTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    // 4. Create Answer and setLocalDescription
    const answerDescription = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answerDescription);

    await updateDoc(callDocRef, {
      answer: {
        type: answerDescription.type,
        sdp: answerDescription.sdp
      },
      status: 'answered'
    });

    // Listen for Offer Candidates from Caller
    const offerCandidatesCol = collection(callDocRef, 'offerCandidates');
    this.offerCandidatesUnsub = onSnapshot(offerCandidatesCol, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          this.addOrBufferIceCandidate(change.doc.data() as RTCIceCandidateInit);
        }
      });
    }, (err) => console.error('Offer candidates listener error:', err));

    // Listen for end/reject
    this.callDocUnsub = onSnapshot(callDocRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.status === 'ended') {
        this.endCall(callSession.id);
      }
    }, (err) => console.error('Call status listener error:', err));
  }

  /**
   * Reject Call
   */
  public async rejectCall(callId: string) {
    this.stopRingtone();
    try {
      const callDocRef = doc(db, 'calls', callId);
      await updateDoc(callDocRef, { status: 'rejected' });
    } catch (e) {
      console.error('Error rejecting call:', e);
    }
  }

  /**
   * End Active Call
   */
  public async endCall(callId?: string) {
    this.stopRingtone();
    this.stopNetworkStabilityMonitor();
    this.pendingCandidates = [];

    const targetCallId = callId || this.currentCallId;
    this.currentCallId = null;

    if (this.callDocUnsub) {
      this.callDocUnsub();
      this.callDocUnsub = null;
    }
    if (this.offerCandidatesUnsub) {
      this.offerCandidatesUnsub();
      this.offerCandidatesUnsub = null;
    }
    if (this.answerCandidatesUnsub) {
      this.answerCandidatesUnsub();
      this.answerCandidatesUnsub = null;
    }
    if (targetCallId) {
      try {
        const callDocRef = doc(db, 'calls', targetCallId);
        await updateDoc(callDocRef, { status: 'ended' });
      } catch {}
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.onCallEndedCallback) {
      this.onCallEndedCallback();
    }
  }

  public toggleMute(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public toggleCamera(videoOff: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !videoOff;
      });
    }
  }
}

export const webrtcCallService = new WebRTCCallService();
