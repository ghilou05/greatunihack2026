import type { DocumentIndex, LessonPlan, QARequest, QAResponse } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error("API unreachable");
  return res.json();
}

export async function getDocument(documentId: string): Promise<{
  document_id: string;
  status: string;
  index: DocumentIndex | null;
}> {
  const res = await fetch(`${API}/documents/${documentId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDocumentIndex(documentId: string): Promise<DocumentIndex> {
  const res = await fetch(`${API}/documents/${documentId}/index`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** URL for react-pdf / pdf.js — use uploaded id or doc_demo with golden PDF on server. */
export function getDocumentFileUrl(documentId: string): string {
  return `${API}/documents/${documentId}/file`;
}

export const DEV_DOCUMENT_PDF = "/documents/golden-demo.pdf";

export async function getLesson(lessonId: string): Promise<LessonPlan> {
  const res = await fetch(`${API}/lessons/${lessonId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postLessonQA(
  lessonId: string,
  body: QARequest
): Promise<QAResponse> {
  const res = await fetch(`${API}/lessons/${lessonId}/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
