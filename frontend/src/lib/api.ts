import type {
  DocumentIndex,
  LessonPlan,
  QARequest,
  QAResponse,
} from "@/lib/types";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export const DEV_DOCUMENT_PDF = "/documents/golden-demo.pdf";

const FIXTURE_DOCUMENT_ID = "doc_demo";
const FIXTURE_READ_DELAY_MS = 700;
const FIXTURE_GENERATE_DELAY_MS = 1500;

let useFixtures = process.env.NEXT_PUBLIC_USE_FIXTURES === "true";

/** Forces fixture mode at runtime, for dev pages that must work without the backend. */
export function enableFixtureMode(): void {
  useFixtures = true;
}

export type DocumentStatus = {
  document_id: string;
  status: "pending" | "ready" | "failed";
  index: DocumentIndex | null;
  error?: string | null;
};

export type ReadyDocument = DocumentStatus & {
  status: "ready";
  index: DocumentIndex;
};

export type PollOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** FastAPI puts its message in `detail`: a string, or a list of validation errors. */
async function readErrorMessage(res: Response): Promise<string> {
  const fallback = `Request failed (HTTP ${res.status})`;
  try {
    const { detail } = await res.json();
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
      return detail[0].msg;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new Error(
      `Couldn't reach the server at ${API_URL}. Is the backend running?`
    );
  }
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return res.json();
}

async function loadFixture<T>(
  path: string,
  delayMs: number,
  signal?: AbortSignal
): Promise<T> {
  await sleep(delayMs, signal);
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`Couldn't load fixture ${path}`);
  return res.json();
}

export async function uploadDocument(
  file: File,
  signal?: AbortSignal
): Promise<{ document_id: string }> {
  if (useFixtures) {
    await sleep(FIXTURE_READ_DELAY_MS, signal);
    return { document_id: FIXTURE_DOCUMENT_ID };
  }
  const body = new FormData();
  body.append("file", file);
  const { document_id } = await requestJson<{ document_id: string }>(
    `${API_URL}/documents`,
    { method: "POST", body, signal }
  );
  return { document_id };
}

export async function getDocument(
  documentId: string,
  signal?: AbortSignal
): Promise<DocumentStatus> {
  if (useFixtures) {
    const index = await loadFixture<DocumentIndex>(
      "/fixtures/sample-document-index.json",
      FIXTURE_READ_DELAY_MS,
      signal
    );
    return { document_id: index.document_id, status: "ready", index };
  }
  return requestJson<DocumentStatus>(
    `${API_URL}/documents/${encodeURIComponent(documentId)}`,
    { signal }
  );
}

/** Polls every `intervalMs` until the index is ready. Rejects on failure or timeout. */
export async function pollDocumentUntilReady(
  documentId: string,
  { intervalMs = 1000, timeoutMs = 60_000, signal }: PollOptions = {}
): Promise<ReadyDocument> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    for (;;) {
      const doc = await getDocument(documentId, combined);
      if (doc.status === "failed") {
        throw new Error(doc.error || "We couldn't read this document.");
      }
      if (doc.status === "ready" && doc.index) return doc as ReadyDocument;
      await sleep(intervalMs, combined);
    }
  } catch (err) {
    if (deadline.aborted && !signal?.aborted) {
      throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for your document to be read.`
      );
    }
    throw err;
  }
}

/** URL for react-pdf / pdf.js. */
export function getDocumentFileUrl(documentId: string): string {
  if (useFixtures) return DEV_DOCUMENT_PDF;
  return `${API_URL}/documents/${encodeURIComponent(documentId)}/file`;
}

/** Synchronous on the backend, so this can take around 60s to resolve. */
export async function generateLesson(
  documentId: string,
  signal?: AbortSignal
): Promise<LessonPlan> {
  if (useFixtures) {
    return loadFixture<LessonPlan>(
      "/fixtures/sample-lesson-plan.json",
      FIXTURE_GENERATE_DELAY_MS,
      signal
    );
  }
  return requestJson<LessonPlan>(
    `${API_URL}/documents/${encodeURIComponent(documentId)}/lessons`,
    { method: "POST", signal }
  );
}

export async function getLesson(
  lessonId: string,
  signal?: AbortSignal
): Promise<LessonPlan> {
  if (useFixtures) {
    return loadFixture<LessonPlan>(
      "/fixtures/sample-lesson-plan.json",
      FIXTURE_READ_DELAY_MS,
      signal
    );
  }
  return requestJson<LessonPlan>(
    `${API_URL}/lessons/${encodeURIComponent(lessonId)}`,
    { signal }
  );
}

/** Used by Person 3's LessonPlayer. */
export async function postLessonQA(
  lessonId: string,
  body: QARequest
): Promise<QAResponse> {
  if (useFixtures) {
    return loadFixture<QAResponse>(
      "/fixtures/sample-qa-response.json",
      FIXTURE_READ_DELAY_MS
    );
  }
  return requestJson<QAResponse>(
    `${API_URL}/lessons/${encodeURIComponent(lessonId)}/qa`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}
