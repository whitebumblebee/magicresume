import { Firestore } from "@google-cloud/firestore";
import { FirestoreSessionStore } from "@genkit-ai/google-cloud/beta";
import { vertexAI } from "@genkit-ai/google-genai";
import {
  InMemorySessionStore,
  genkit,
  type SessionStore,
} from "genkit/beta";
import { requireAgentUserId } from "@/lib/agent/context";

export const GEMINI_MODEL = "gemini-3.7-flash";
export const VERTEX_LOCATION = "global";

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
  process.env.GCLOUD_PROJECT?.trim() ||
  undefined;
const expressApiKey = process.env.VERTEX_API_KEY?.trim() || undefined;

export const vertexPlugin = vertexAI({
  projectId,
  location: VERTEX_LOCATION,
  apiKey: expressApiKey,
});

export const ai = genkit({
  plugins: [vertexPlugin],
  model: vertexAI.model(GEMINI_MODEL),
});

export const careerModel = vertexAI.model(GEMINI_MODEL);

export function vertexConfigured(): boolean {
  return Boolean(
    projectId ||
      expressApiKey ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE,
  );
}

export function firestoreSessionPrefix(options?: {
  context?: unknown;
}): string {
  return requireAgentUserId(options?.context);
}

export function createCareerSessionStore<State>(): SessionStore<State> {
  const useFirestore = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
      projectId ||
      process.env.K_SERVICE,
  );
  if (!useFirestore || process.env.NODE_ENV === "test") {
    return new InMemorySessionStore<State>();
  }

  const db = new Firestore(projectId ? { projectId } : undefined);
  return new FirestoreSessionStore<State>({
    db,
    collection: "mr-agent-sessions",
    checkpointInterval: 10,
    snapshotPathPrefix: firestoreSessionPrefix,
  });
}
