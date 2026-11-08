"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LessonPlayer.module.css";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechError = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  const browser = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

type Props = {
  disabled?: boolean;
  onBeforeStart: () => void;
  onQuestion: (question: string) => void;
  onListeningChange?: (listening: boolean) => void;
};

export function MicrophoneButton({ disabled, onBeforeStart, onQuestion, onListeningChange }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"idle" | "requesting" | "listening">("idle");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const session = useRef(0);

  useEffect(() => {
    setSupported(Boolean(recognitionConstructor()));
    return () => {
      session.current += 1;
      const current = recognition.current;
      recognition.current = null;
      current?.stop();
    };
  }, []);

  const cancel = () => {
    session.current += 1;
    const current = recognition.current;
    recognition.current = null;
    current?.stop();
    setStatus("idle");
    onListeningChange?.(false);
  };

  const start = () => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setSupported(false);
      return;
    }
    cancel();
    setError(null);
    onBeforeStart();
    const id = ++session.current;
    const current = new Constructor();
    recognition.current = current;
    current.continuous = false;
    current.interimResults = false;
    current.lang = navigator.language || "en-US";
    current.onstart = () => {
      if (id !== session.current) return;
      setStatus("listening");
    };
    current.onresult = (event) => {
      if (id !== session.current) return;
      const question = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript.trim())
        .join(" ")
        .trim();
      if (!question) return;
      onQuestion(question);
      cancel();
    };
    current.onerror = (event) => {
      if (id !== session.current) return;
      if (event.error === "aborted") return;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied. Check microphone access and try again."
          : `Speech recognition failed (${event.error}). Check microphone access and try again.`
      );
      cancel();
    };
    current.onend = () => {
      if (id !== session.current) return;
      setError("No speech was recognised. Push to talk to try again.");
      cancel();
    };
    setStatus("requesting");
    onListeningChange?.(true);
    try {
      current.start();
    } catch {
      setError("Could not start speech recognition. Check microphone access and try again.");
      cancel();
    }
  };

  return (
    <div className={styles.microphone}>
      <button className={styles.button} type="button"
        disabled={disabled || supported === false}
        aria-pressed={status !== "idle"}
        onClick={() => status === "idle" ? start() : recognition.current?.stop()}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        </svg>
        {status === "idle" ? "Push to talk" : "Finish talking"}
      </button>
      {status !== "idle" && <p className={styles.hint} role="status">{status === "requesting" ? "Allow microphone access to speak." : "Listening… click to finish."}</p>}
      {supported === false && <p className={styles.hint}>Speech recognition is unavailable in this browser. Try Chrome or Edge.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
