"use client";

import { useEffect, useRef, useState } from "react";

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
  onBeforeStart: () => void;
  onQuestion: (question: string) => void;
  onListeningChange?: (listening: boolean) => void;
};

export function MicrophoneButton({ onBeforeStart, onQuestion, onListeningChange }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"idle" | "requesting" | "listening">("idle");
  const [error, setError] = useState<string | null>(null);
  const [showTyping, setShowTyping] = useState(false);
  const [typedQuestion, setTypedQuestion] = useState("");
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
      setShowTyping(true);
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
          ? "Microphone permission was denied. Type your question below."
          : `Speech recognition failed (${event.error}). Type your question below.`
      );
      setShowTyping(true);
      cancel();
    };
    current.onend = () => {
      if (id !== session.current) return;
      setError("No speech was recognised. Try again or type your question below.");
      setShowTyping(true);
      cancel();
    };
    setStatus("requesting");
    onListeningChange?.(true);
    try {
      current.start();
    } catch {
      setError("Could not start speech recognition. Type your question below.");
      setShowTyping(true);
      cancel();
    }
  };

  return (
    <div>
      {supported !== false && (
        <button type="button" onClick={status === "idle" ? start : cancel}>
          {status === "idle" ? "Ask with microphone" : "Cancel microphone"}
        </button>
      )}
      {status !== "idle" && <span role="status"> {status === "requesting" ? "Waiting for microphone permission…" : "Listening…"}</span>}
      {supported === false && <p role="status">Speech recognition is unavailable in this browser. Type your question below.</p>}
      {error && <p role="alert">{error}</p>}
      {(supported === false || showTyping) ? (
        <form onSubmit={(event) => {
          event.preventDefault();
          const question = typedQuestion.trim();
          if (!question) return;
          cancel();
          onBeforeStart();
          onQuestion(question);
          setTypedQuestion("");
        }}>
          <label htmlFor="typed-lesson-question">Your question</label>{" "}
          <input id="typed-lesson-question" value={typedQuestion} onChange={(event) => setTypedQuestion(event.target.value)} />{" "}
          <button type="submit" disabled={!typedQuestion.trim()}>Save question</button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowTyping(true)}>Type a question instead</button>
      )}
    </div>
  );
}
