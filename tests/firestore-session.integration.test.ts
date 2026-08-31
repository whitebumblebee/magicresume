import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Firestore } from "@google-cloud/firestore";
import { FirestoreSessionStore } from "@genkit-ai/google-cloud/beta";
import { createAgentContext } from "@/lib/agent/context";
import {
  firestoreSessionPrefix,
} from "@/lib/ai/genkit";
import type { CareerAgentState } from "@/lib/agent/state";

const runWithEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!runWithEmulator)("Firestore agent sessions", () => {
  it("resumes for the owning user and hides the same session id from another", async () => {
    const db = new Firestore({ projectId: "mr-test" });
    const store = new FirestoreSessionStore<CareerAgentState>({
      db,
      collection: `mr-agent-test-${randomUUID()}`,
      snapshotPathPrefix: firestoreSessionPrefix,
    });
    const sessionId = randomUUID();
    const owner = createAgentContext({ userId: "owner" });
    const otherUser = createAgentContext({ userId: "other-user" });
    const now = new Date().toISOString();

    const snapshotId = await store.saveSnapshot(
      undefined,
      () => ({
        sessionId,
        createdAt: now,
        updatedAt: now,
        status: "completed",
        finishReason: "stop",
        state: {
          sessionId,
          messages: [],
          artifacts: [],
          custom: {
            phase: "memory",
            pendingFactIds: [],
            activity: [],
          },
        },
      }),
      { context: owner },
    );

    expect(snapshotId).toBeTruthy();
    const resumed = await store.getSnapshot({ sessionId, context: owner });
    expect(resumed?.state?.custom?.phase).toBe("memory");
    const crossUser = await store.getSnapshot({
      sessionId,
      context: otherUser,
    });
    expect(crossUser).toBeUndefined();
  });
});
