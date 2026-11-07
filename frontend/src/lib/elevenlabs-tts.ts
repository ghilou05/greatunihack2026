const API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
const VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID;

export class ElevenLabsPlayer {
  constructor(private readonly onEnded?: () => void) {}

  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private request: AbortController | null = null;
  private generation = 0;

  async speak(text: string): Promise<void> {
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

  async resume(): Promise<void> { await this.audio?.play(); }

  stop(): void {
    this.generation += 1;
    this.request?.abort();
    this.request = null;
    this.audio?.pause();
    this.audio = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
