"use client";

/**
 * P3: ElevenLabs TTS/STT, segment state machine, interrupt + resume.
 */
import { getLesson, postLessonQA } from "@/lib/api";
import { ElevenLabsPlayer } from "@/lib/elevenlabs-tts";
import { useLessonSession } from "@/hooks/useLessonSession";
import { MicrophoneButton } from "@/components/voice/MicrophoneButton";
import { onEnterToCommands } from "@/lib/viewer-commands";
import {
  captureInterrupt,
  resumeAfterQA,
  startSegment,
} from "@/lib/lesson-orchestrator";
import type { LessonSegment, QAResponse, ViewerCommand } from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import type { LessonPlan } from "@/lib/types";

type Props = {
  lessonId: string;
  onViewerCommands?: (commands: ViewerCommand[], fallbackPage: number) => void;
};

export function LessonPlayer({ lessonId, onViewerCommands }: Props) {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const { state, setState, playbackStatus, setPlaybackStatus, question, handleQuestion } = useLessonSession(lessonId);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<QAResponse | null>(null);
  const [qaStatus, setQAStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [qaError, setQAError] = useState<string | null>(null);
  const [answerAudioStatus, setAnswerAudioStatus] = useState<"idle" | "loading" | "playing" | "complete" | "error">("idle");
  const [answerAudioError, setAnswerAudioError] = useState<string | null>(null);
  const voicePlayer = useRef<ElevenLabsPlayer | null>(null);
  const answerPlayer = useRef<ElevenLabsPlayer | null>(null);
  const qaAttempt = useRef(0);
  const voiceAttempt = useRef(0);
  const activeSegment = useRef(0);
  const planRef = useRef<LessonPlan | null>(null);
  const viewerCommandsRef = useRef(onViewerCommands);
  viewerCommandsRef.current = onViewerCommands;
  const cueRef = useRef<{ segment: LessonSegment; cues: LessonSegment["cues"]; next: number } | null>(null);
  const cuesSuspended = useRef(true);
  const interruptionRef = useRef<{ lessonId: string; segmentId: string; segmentIndex: number; offsetMs: number } | null>(null);

  const emitDueCues = (positionMs: number) => {
    const tracking = cueRef.current;
    if (!tracking || cuesSuspended.current) return;
    while (tracking.next < tracking.cues.length && tracking.cues[tracking.next].at_ms <= positionMs) {
      viewerCommandsRef.current?.(tracking.cues[tracking.next].commands, tracking.segment.page);
      tracking.next += 1;
    }
  };

  const restoreCueState = (positionMs: number) => {
    const tracking = cueRef.current;
    if (!tracking) return;
    viewerCommandsRef.current?.(onEnterToCommands(tracking.segment.on_enter), tracking.segment.page);
    tracking.next = 0;
    while (tracking.next < tracking.cues.length && tracking.cues[tracking.next].at_ms <= positionMs) {
      viewerCommandsRef.current?.(tracking.cues[tracking.next].commands, tracking.segment.page);
      tracking.next += 1;
    }
  };

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  useEffect(() => () => {
    qaAttempt.current += 1;
    interruptionRef.current = null;
    cueRef.current = null;
    cuesSuspended.current = true;
    answerPlayer.current?.stop();
    voiceAttempt.current += 1;
    activeSegment.current = -1;
    voicePlayer.current?.stop();
  }, [lessonId]);

  useEffect(() => {
    setAnswer(null);
    setQAStatus("idle");
    setQAError(null);
    setAnswerAudioStatus("idle");
    setAnswerAudioError(null);
  }, [lessonId]);

  const player = () => {
    voicePlayer.current ??= new ElevenLabsPlayer(() => {
      emitDueCues(voicePlayer.current?.currentTimeMs ?? 0);
      const currentPlan = planRef.current;
      const next = activeSegment.current + 1;
      if (currentPlan && activeSegment.current >= 0 && next < currentPlan.segments.length) {
        void playSegment(next);
      } else if (activeSegment.current >= 0) {
        setPlaybackStatus("complete");
        setState((previous) => ({ ...previous, status: "complete" }));
      } else {
        setPlaybackStatus("idle");
      }
    }, emitDueCues, (positionMs) => { if (!cuesSuspended.current) restoreCueState(positionMs); });
    return voicePlayer.current;
  };

  const testVoice = async () => {
    const attempt = ++voiceAttempt.current;
    cueRef.current = null;
    cuesSuspended.current = true;
    activeSegment.current = -1;
    setVoiceError(null);
    setPlaybackStatus("loading");
    try {
      await player().speak("Welcome to your lesson on Newton's laws.");
      if (attempt === voiceAttempt.current && voicePlayer.current?.hasAudio) setPlaybackStatus("playing");
    } catch (error) {
      if (attempt !== voiceAttempt.current) return;
      setVoiceError(error instanceof Error ? error.message : "Could not play speech.");
      setPlaybackStatus("idle");
    }
  };

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    planRef.current = null;
    getLesson(lessonId)
      .then((loaded) => { if (!cancelled) setPlan(loaded); })
      .catch(async () => {
        const res = await fetch("/fixtures/sample-lesson-plan.json");
        const fallback = await res.json();
        if (!cancelled) setPlan(fallback);
      });
    return () => { cancelled = true; };
  }, [lessonId]);

  const handlersForPage = (page: number) => ({
    onViewerCommands: (commands: ViewerCommand[]) => {
      viewerCommandsRef.current?.(commands, page);
      console.info("[P3] viewer commands → P1", commands);
    },
    onTranscript: setTranscript,
  });

  const playSegment = async (index: number) => {
    const currentPlan = planRef.current;
    if (!currentPlan || !currentPlan.segments[index]) return;
    const attempt = ++voiceAttempt.current;
    voicePlayer.current?.stop();
    interruptionRef.current = null;
    activeSegment.current = index;
    const { state: next, segment } = startSegment(currentPlan, index, handlersForPage(currentPlan.segments[index].page));
    cueRef.current = { segment, cues: [...segment.cues].sort((a, b) => a.at_ms - b.at_ms), next: 0 };
    cuesSuspended.current = true;
    setState(next);
    setVoiceError(null);
    setPlaybackStatus("loading");
    try {
      await player().speak(segment.narration);
      if (attempt === voiceAttempt.current && voicePlayer.current?.hasAudio) {
        cuesSuspended.current = false;
        emitDueCues(voicePlayer.current.currentTimeMs);
        setPlaybackStatus("playing");
      }
    } catch (error) {
      if (attempt !== voiceAttempt.current) return;
      setVoiceError(error instanceof Error ? error.message : "Could not play narration.");
      setPlaybackStatus("idle");
      setState((previous) => ({ ...previous, status: "paused" }));
    }
  };

  const interruptDemo = async () => {
    if (!plan || state.segment_id == null) return;
    const seg = plan.segments[state.segment_index];
    const delivered = seg.narration.slice(0, Math.min(60, seg.narration.length));
    const offsetMs = 8000;
    const interruptedState = captureInterrupt(state, offsetMs, delivered);
    setState(interruptedState);
    try {
      const qa = await postLessonQA(lessonId, {
        lesson_id: lessonId,
        segment_id: state.segment_id,
        question: "Why does water move?",
        playback_ms: offsetMs,
        narration_delivered: delivered,
        qa_turns: [],
      });
      setTranscript(`${qa.answer}\n\n${qa.bridge ?? ""}`);
      handlersForPage(seg.page).onViewerCommands(qa.viewer_commands);
      setState(resumeAfterQA(plan, interruptedState, handlersForPage(seg.page)));
    } catch {
      const res = await fetch("/fixtures/sample-qa-response.json");
      const qa = await res.json();
      setTranscript(qa.answer);
      handlersForPage(seg.page).onViewerCommands(qa.viewer_commands);
      setState(resumeAfterQA(plan, interruptedState, handlersForPage(seg.page)));
    }
  };

  const pauseForQuestion = () => {
    emitDueCues(voicePlayer.current?.currentTimeMs ?? 0);
    cuesSuspended.current = true;
    qaAttempt.current += 1;
    answerPlayer.current?.stop();
    setQAStatus("idle");
    setAnswerAudioStatus("idle");
    const offsetMs = voicePlayer.current?.currentTimeMs ?? 0;
    interruptionRef.current = state.segment_id ? { lessonId, segmentId: state.segment_id, segmentIndex: state.segment_index, offsetMs } : null;
    if (playbackStatus === "loading") {
      voiceAttempt.current += 1;
      voicePlayer.current?.stop();
      setPlaybackStatus("idle");
    } else if (playbackStatus === "playing") {
      voicePlayer.current?.pause();
      setPlaybackStatus("paused");
    }
    setState((previous) => previous.segment_id ? captureInterrupt(previous, offsetMs, previous.interrupt?.narration_delivered ?? "") : previous);
  };

  const resumeLesson = async (attempt: number) => {
    const saved = interruptionRef.current;
    const currentPlan = planRef.current;
    const segment = saved && currentPlan?.segments[saved.segmentIndex];
    if (attempt !== qaAttempt.current || !saved || saved.lessonId !== lessonId || !segment || segment.id !== saved.segmentId) return;
    cuesSuspended.current = true;
    setVoiceError(null);
    try {
      if (voicePlayer.current?.hasAudio && activeSegment.current === saved.segmentIndex) {
        await voicePlayer.current.resume();
      } else {
        const voiceId = ++voiceAttempt.current;
        voicePlayer.current?.stop();
        activeSegment.current = saved.segmentIndex;
        setPlaybackStatus("loading");
        await player().speak(segment.narration, saved.offsetMs);
        if (voiceId !== voiceAttempt.current) return;
      }
      if (attempt !== qaAttempt.current || !voicePlayer.current?.hasAudio) return;
      restoreCueState(voicePlayer.current.currentTimeMs);
      cuesSuspended.current = false;
      emitDueCues(voicePlayer.current.currentTimeMs);
      setPlaybackStatus("playing");
      setState((previous) => ({ ...previous, status: "teaching" }));
    } catch (error) {
      if (attempt !== qaAttempt.current) return;
      setVoiceError(error instanceof Error ? error.message : "Could not resume narration.");
      setPlaybackStatus("paused");
      setState((previous) => ({ ...previous, status: "paused" }));
    }
  };

  const manualResume = async () => {
    if (interruptionRef.current) {
      await resumeLesson(qaAttempt.current);
      return;
    }
    try {
      await voicePlayer.current?.resume();
      cuesSuspended.current = false;
      emitDueCues(voicePlayer.current?.currentTimeMs ?? 0);
      setPlaybackStatus("playing");
      setState((previous) => previous.segment_id ? { ...previous, status: "teaching" } : previous);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Could not resume speech.");
    }
  };

  const askQuestion = async (capturedQuestion: string) => {
    handleQuestion(capturedQuestion);
    const questionText = capturedQuestion.trim();
    const segment = planRef.current?.segments[state.segment_index];
    const attempt = ++qaAttempt.current;
    answerPlayer.current?.stop();
    setAnswer(null);
    setAnswerAudioStatus("idle");
    setAnswerAudioError(null);
    setQAError(null);
    if (!questionText || !state.segment_id || !segment) {
      setQAStatus("error");
      setQAError("Start a lesson before asking a question.");
      return;
    }
    setQAStatus("loading");
    setState((previous) => ({ ...previous, status: "answering" }));
    try {
      const response = await postLessonQA(lessonId, {
        lesson_id: lessonId,
        segment_id: state.segment_id,
        question: questionText,
        playback_ms: interruptionRef.current?.offsetMs ?? state.interrupt?.narration_offset_ms,
        qa_turns: [],
      });
      if (attempt !== qaAttempt.current) return;
      setAnswer(response);
      setQAStatus("ready");
      setState((previous) => ({ ...previous, status: "paused" }));
      handlersForPage(segment.page).onViewerCommands(response.viewer_commands);
      setAnswerAudioStatus("loading");
      answerPlayer.current = new ElevenLabsPlayer(() => {
        if (attempt !== qaAttempt.current) return;
        setAnswerAudioStatus("complete");
        void resumeLesson(attempt);
      });
      try {
        await answerPlayer.current.speak(response.answer);
        if (attempt === qaAttempt.current && answerPlayer.current.hasAudio) setAnswerAudioStatus("playing");
      } catch (error) {
        if (attempt !== qaAttempt.current) return;
        setAnswerAudioError(error instanceof Error ? error.message : "Could not speak the answer.");
        setAnswerAudioStatus("error");
      }
    } catch (error) {
      if (attempt !== qaAttempt.current) return;
      setQAStatus("error");
      setQAError(error instanceof Error ? error.message : "Could not get an answer.");
      setState((previous) => ({ ...previous, status: "paused" }));
    }
  };

  const answerBusy = qaStatus === "loading" || answerAudioStatus === "loading" || answerAudioStatus === "playing";

  return (
    <section
      style={{
        background: "var(--panel)",
        borderRadius: 12,
        padding: "1rem",
      }}
    >
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Voice (P3)</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        Status: {state.status} · segment {state.segment_index}
        {state.interrupt
          ? ` · resume @ ${state.interrupt.narration_offset_ms}ms`
          : ""}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={testVoice} disabled={listening || answerBusy}>Test voice</button>
        <button type="button" onClick={() => { emitDueCues(voicePlayer.current?.currentTimeMs ?? 0); cuesSuspended.current = true; voicePlayer.current?.pause(); setPlaybackStatus("paused"); setState((previous) => previous.segment_id ? { ...previous, status: "paused" } : previous); }} disabled={playbackStatus !== "playing" || answerBusy}>Pause</button>
        <button type="button" onClick={() => void manualResume()} disabled={(!interruptionRef.current && playbackStatus !== "paused") || listening || answerBusy || playbackStatus === "playing" || playbackStatus === "loading"}>Resume</button>
        <button type="button" onClick={() => { voiceAttempt.current += 1; cuesSuspended.current = true; cueRef.current = null; interruptionRef.current = null; voicePlayer.current?.stop(); setPlaybackStatus("idle"); setState((previous) => ({ ...previous, status: "idle" })); }} disabled={playbackStatus === "idle" || listening || answerBusy}>Stop</button>
        <button type="button" onClick={() => void playSegment(0)} disabled={!plan || listening || answerBusy}>Play lesson</button>
        <button type="button" onClick={() => void playSegment(state.segment_index + 1)} disabled={!plan || listening || answerBusy || !state.segment_id || state.segment_index >= plan.segments.length - 1}>Next</button>
        <button type="button" onClick={interruptDemo} disabled={listening || answerBusy}>
          Ask (demo)
        </button>
      </div>
      <MicrophoneButton key={lessonId} onBeforeStart={pauseForQuestion} onQuestion={(text) => void askQuestion(text)} onListeningChange={setListening} />
      {question && <p><strong>Student question:</strong> {question}</p>}
      {qaStatus === "loading" && <p role="status">Getting an answer…</p>}
      {qaError && <p role="alert">{qaError}</p>}
      {answer && <div><p><strong>Answer:</strong> {answer.answer}</p>{answer.cite_span_ids.length > 0 && <p>Sources: {answer.cite_span_ids.join(", ")}</p>}{answer.bridge && <p>{answer.bridge}</p>}</div>}
      {answerAudioStatus === "loading" && <p role="status">Preparing spoken answer…</p>}
      {answerAudioStatus === "playing" && <p role="status">Speaking answer…</p>}
      {answerAudioError && <p role="alert">{answerAudioError}</p>}
      {(answerAudioStatus === "loading" || answerAudioStatus === "playing") && <button type="button" onClick={() => { qaAttempt.current += 1; answerPlayer.current?.stop(); setAnswerAudioStatus("complete"); }}>Stop answer</button>}
      {voiceError && <p role="alert">{voiceError}</p>}
      <p>Playback: {playbackStatus}</p>
      <p
        style={{
          marginTop: "1rem",
          fontSize: "0.9rem",
          lineHeight: 1.45,
          minHeight: "4rem",
        }}
      >
        {transcript || "Transcript will appear here."}
      </p>
    </section>
  );
}
