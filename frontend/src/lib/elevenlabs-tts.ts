const API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
const VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID;

export class ElevenLabsPlayer {
  constructor(
    private readonly onEnded?: () => void,
    private readonly onTimeUpdate?: (positionMs: number) => void,
    private readonly onSeeked?: (positionMs: number) => void,
  ) {}

  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private request: AbortController | null = null;
  private generation = 0;

  async speak(text: string, startMs = 0): Promise<void> {
    if (!text.trim()) throw new Error("Enter text to speak.");
    if (!API_KEY || !VOICE_ID) {
      throw new Error("Set NEXT_PUBLIC_ELEVENLABS_API_KEY and NEXT_PUBLIC_ELEVENLABS_VOICE_ID in frontend/.env.local.");
    }

    this.stop();
    const generation = this.generation;
    const request = new AbortController();
    this.request = request;

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": API_KEY },
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`ElevenLabs speech request failed (${response.status}).`);
      const blob = await response.blob();
      if (generation !== this.generation) return;
      if (!blob.size) throw new Error("ElevenLabs returned empty audio.");

      this.objectUrl = URL.createObjectURL(blob);
      this.audio = new Audio(this.objectUrl);
      this.audio.onended = () => this.onEnded?.();
      this.audio.ontimeupdate = () => this.onTimeUpdate?.(this.currentTimeMs);
      this.audio.onseeked = () => this.onSeeked?.(this.currentTimeMs);
      if (startMs > 0) {
        const audio = this.audio;
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            audio.removeEventListener("loadedmetadata", seek);
            audio.removeEventListener("error", fail);
            request.signal.removeEventListener("abort", abort);
          };
          const seek = () => {
            cleanup();
            try {
              const seconds = startMs / 1000;
              audio.currentTime = Number.isFinite(audio.duration) ? Math.min(seconds, Math.max(0, audio.duration - 0.05)) : seconds;
              resolve();
            } catch (error) { reject(error); }
          };
          const fail = () => { cleanup(); reject(new Error("Could not load narration audio.")); };
          const abort = () => { cleanup(); reject(new DOMException("Playback stopped.", "AbortError")); };
          audio.addEventListener("loadedmetadata", seek);
          audio.addEventListener("error", fail);
          request.signal.addEventListener("abort", abort);
          if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
        });
        if (generation !== this.generation) return;
      }
      await this.audio.play();
    } catch (error) {
      const wasAborted = request.signal.aborted;
      if (generation === this.generation) this.stop();
      if (wasAborted) return;
      throw error;
    } finally {
      if (this.request === request) this.request = null;
    }
  }

  pause(): void { this.audio?.pause(); }

  get hasAudio(): boolean { return this.audio !== null; }
  get currentTimeMs(): number { return Math.round((this.audio?.currentTime ?? 0) * 1000); }

  async resume(): Promise<void> { await this.audio?.play(); }

  stop(): void {
    this.generation += 1;
    this.request?.abort();
    this.request = null;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.ontimeupdate = null;
      this.audio.onseeked = null;
      this.audio.pause();
    }
    this.audio = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
