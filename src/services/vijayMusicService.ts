export interface VijayMusicTrack {
  id: string;
  title: string;
  artist: string;
  movie: string;
  views: string;
  category: 'Vijay Mass Hits' | 'GOAT & Leo Hits' | 'Vijay Kuthu Dance' | 'Vijay Classics';
  url: string;
}

export const VIJAY_MUSIC_CATALOG: VijayMusicTrack[] = [
  { id: 'none', title: 'No Music', artist: 'Silent', movie: 'None', views: '0', category: 'Vijay Mass Hits', url: '' },

  // GOAT & Leo Hits
  { id: 'naa-ready', title: 'Naa Ready', movie: 'Leo', artist: 'Thalapathy Vijay, Anirudh Ravichander', views: '520M+ Views', category: 'GOAT & Leo Hits', url: 'https://cdn.freesound.org/previews/518/518882_11306352-lq.mp3' },
  { id: 'spark', title: 'Spark', movie: 'The GOAT', artist: 'Thalapathy Vijay, Yuvan Shankar Raja', views: '180M+ Views', category: 'GOAT & Leo Hits', url: 'https://cdn.freesound.org/previews/568/568341_12530182-lq.mp3' },
  { id: 'whistle-podu', title: 'Whistle Podu', movie: 'The GOAT', artist: 'Thalapathy Vijay, Yuvan Shankar Raja', views: '210M+ Views', category: 'GOAT & Leo Hits', url: 'https://cdn.freesound.org/previews/612/612253_11861866-lq.mp3' },
  { id: 'badass', title: 'Badass', movie: 'Leo', artist: 'Anirudh Ravichander', views: '320M+ Views', category: 'GOAT & Leo Hits', url: 'https://cdn.freesound.org/previews/573/573523_11861866-lq.mp3' },
  { id: 'matta', title: 'Matta', movie: 'The GOAT', artist: 'Shenbagaraj, Yuvan Shankar Raja', views: '140M+ Views', category: 'GOAT & Leo Hits', url: 'https://cdn.freesound.org/previews/518/518882_11306352-lq.mp3' },

  // Vijay Mass Hits
  { id: 'vaathi-coming', title: 'Vaathi Coming', movie: 'Master', artist: 'Anirudh, Gana Balachandar', views: '480M+ Views', category: 'Vijay Mass Hits', url: 'https://cdn.freesound.org/previews/573/573523_11861866-lq.mp3' },
  { id: 'arabic-kuthu', title: 'Arabic Kuthu - Halamithi Habibo', movie: 'Beast', artist: 'Anirudh, Jonita Gandhi', views: '650M+ Views', category: 'Vijay Mass Hits', url: 'https://cdn.freesound.org/previews/612/612253_11861866-lq.mp3' },
  { id: 'jolly-o-gymkhana', title: 'Jolly O Gymkhana', movie: 'Beast', artist: 'Thalapathy Vijay', views: '290M+ Views', category: 'Vijay Mass Hits', url: 'https://cdn.freesound.org/previews/568/568341_12530182-lq.mp3' },
  { id: 'ranjithame', title: 'Ranjithame', movie: 'Varisu', artist: 'Thalapathy Vijay, M.M. Manasi', views: '410M+ Views', category: 'Vijay Mass Hits', url: 'https://cdn.freesound.org/previews/518/518882_11306352-lq.mp3' },
  { id: 'thee-thalapathy', title: 'Thee Thalapathy', movie: 'Varisu', artist: 'Silambarasan TR, Thaman S', views: '230M+ Views', category: 'Vijay Mass Hits', url: 'https://cdn.freesound.org/previews/573/573523_11861866-lq.mp3' },

  // Vijay Kuthu Dance
  { id: 'verithanam', title: 'Verithanam', movie: 'Bigil', artist: 'Thalapathy Vijay, A.R. Rahman', views: '380M+ Views', category: 'Vijay Kuthu Dance', url: 'https://cdn.freesound.org/previews/612/612253_11861866-lq.mp3' },
  { id: 'selfie-pulla', title: 'Selfie Pulla', movie: 'Kaththi', artist: 'Thalapathy Vijay, Sunidhi Chauhan', views: '350M+ Views', category: 'Vijay Kuthu Dance', url: 'https://cdn.freesound.org/previews/568/568341_12530182-lq.mp3' },
  { id: 'google-google', title: 'Google Google', movie: 'Thuppakki', artist: 'Thalapathy Vijay, Andrea Jeremiah', views: '310M+ Views', category: 'Vijay Kuthu Dance', url: 'https://cdn.freesound.org/previews/518/518882_11306352-lq.mp3' },
  { id: 'appadi-podu', title: 'Appadi Podu', movie: 'Ghilli', artist: 'Kay Kay, Anuradha Sriram', views: '500M+ Views', category: 'Vijay Kuthu Dance', url: 'https://cdn.freesound.org/previews/573/573523_11861866-lq.mp3' },

  // Vijay Classics
  { id: 'singappenney', title: 'Singappenney', movie: 'Bigil', artist: 'A.R. Rahman', views: '340M+ Views', category: 'Vijay Classics', url: 'https://cdn.freesound.org/previews/612/612253_11861866-lq.mp3' },
  { id: 'aalaporaan-thamizhan', title: 'Aalaporaan Thamizhan', movie: 'Mersal', artist: 'A.R. Rahman, Kailash Kher', views: '450M+ Views', category: 'Vijay Classics', url: 'https://cdn.freesound.org/previews/568/568341_12530182-lq.mp3' },
  { id: 'jimikki-ponnu', title: 'Jimikki Ponnu', movie: 'Varisu', artist: 'Anirudh, Jonita Gandhi', views: '190M+ Views', category: 'Vijay Classics', url: 'https://cdn.freesound.org/previews/518/518882_11306352-lq.mp3' }
];

class VijayMusicSynthesizer {
  private audioCtx: AudioContext | null = null;
  private isPlaying = false;
  private timerId: any = null;
  public activeTrackId: string | null = null;

  private initContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public playTrack(trackId: string) {
    this.stop();
    if (trackId === 'none' || !trackId) return;

    this.initContext();
    if (!this.audioCtx) return;

    this.isPlaying = true;
    this.activeTrackId = trackId;

    let step = 0;
    const tempoMs = 125; // Energetic ~120 BPM kuthu rhythm

    // Pentatonic & South Indian Raga musical pitch scale (frequencies in Hz)
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];

    // Signature lead riff note indices per Vijay song
    const trackRiffs: Record<string, number[]> = {
      'naa-ready': [4, 4, 5, 4, 2, 0, 2, 4, 5, 5, 4, 2, 0, 2, 4, 7],
      'spark': [0, 2, 4, 7, 5, 4, 2, 0, 4, 5, 7, 5, 4, 2, 0, 2],
      'whistle-podu': [5, 5, 4, 5, 7, 5, 4, 2, 0, 2, 4, 5, 4, 2, 0, 0],
      'vaathi-coming': [0, 0, 2, 2, 4, 4, 2, 0, 5, 5, 4, 4, 2, 2, 0, 0],
      'arabic-kuthu': [7, 6, 5, 4, 5, 6, 7, 5, 4, 3, 4, 5, 6, 5, 4, 2],
      'jolly-o-gymkhana': [2, 4, 5, 4, 2, 0, 2, 4, 5, 7, 5, 4, 2, 0, 2, 4],
      'ranjithame': [4, 5, 7, 7, 5, 4, 2, 4, 5, 7, 5, 4, 2, 0, 2, 4],
      'verithanam': [0, 4, 2, 4, 5, 4, 2, 0, 7, 5, 4, 2, 0, 2, 4, 0],
      'appadi-podu': [7, 7, 5, 5, 4, 4, 2, 2, 0, 2, 4, 5, 7, 5, 4, 2],
      'badass': [7, 7, 8, 7, 5, 4, 2, 4, 7, 7, 8, 7, 5, 4, 2, 0],
      'selfie-pulla': [2, 2, 4, 5, 4, 2, 0, 2, 4, 5, 7, 5, 4, 2, 0, 2]
    };

    const notes = trackRiffs[trackId] || [0, 2, 4, 5, 7, 5, 4, 2, 0, 2, 4, 5, 7, 5, 4, 2];

    this.timerId = setInterval(() => {
      if (!this.isPlaying || !this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      // 1. Kuthu Bass Kick Drum (on beats 0, 4, 8, 12)
      if (step % 4 === 0) {
        const kickOsc = this.audioCtx.createOscillator();
        const kickGain = this.audioCtx.createGain();
        kickOsc.frequency.setValueAtTime(160, now);
        kickOsc.frequency.exponentialRampToValueAtTime(0.01, now + 0.16);
        kickGain.gain.setValueAtTime(0.5, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        kickOsc.connect(kickGain);
        kickGain.connect(this.audioCtx.destination);
        kickOsc.start(now);
        kickOsc.stop(now + 0.16);
      }

      // 2. Kuthu Percussion Snare/Tap (on beats 2, 6, 10, 14)
      if (step % 4 === 2) {
        const snareOsc = this.audioCtx.createOscillator();
        const snareGain = this.audioCtx.createGain();
        snareOsc.type = 'triangle';
        snareOsc.frequency.setValueAtTime(240, now);
        snareOsc.frequency.exponentialRampToValueAtTime(70, now + 0.12);
        snareGain.gain.setValueAtTime(0.3, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        snareOsc.connect(snareGain);
        snareGain.connect(this.audioCtx.destination);
        snareOsc.start(now);
        snareOsc.stop(now + 0.12);
      }

      // 3. Lead Vijay Synth Line
      const noteIdx = notes[step % notes.length];
      const freq = scale[noteIdx % scale.length];

      const leadOsc = this.audioCtx.createOscillator();
      const leadGain = this.audioCtx.createGain();
      leadOsc.type = 'sawtooth';
      leadOsc.frequency.setValueAtTime(freq, now);

      leadGain.gain.setValueAtTime(0.18, now);
      leadGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      leadOsc.connect(leadGain);
      leadGain.connect(this.audioCtx.destination);
      leadOsc.start(now);
      leadOsc.stop(now + 0.12);

      step = (step + 1) % 16;
    }, tempoMs);
  }

  public stop() {
    this.isPlaying = false;
    this.activeTrackId = null;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}

export const vijaySynthEngine = new VijayMusicSynthesizer();
