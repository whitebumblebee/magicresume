import { describe, expect, it } from "vitest";
import { analyzeJobDescription } from "@/lib/career/tailor";

const runLive = process.env.RUN_LIVE_AI === "1";

describe.skipIf(!runLive)("Gemini 3.7 structured integration", () => {
  it(
    "returns a schema-valid job profile through Genkit and Vertex AI",
    async () => {
      const profile = await analyzeJobDescription(`
        Acme is hiring a Senior Platform Engineer to own a TypeScript service
        processing high-volume events. Must have distributed systems,
        PostgreSQL, observability, and incident response experience. Kubernetes
        and Web3 indexing experience are nice to have. The engineer will design
        idempotent ingestion, improve reliability, mentor teammates, and write
        technical design documents.
      `);
      expect(profile.title).toMatch(/Platform Engineer/i);
      expect(profile.requirements.length).toBeGreaterThan(2);
      expect(profile.requirements.some((item) => item.importance === "must_have"))
        .toBe(true);
    },
    60_000,
  );
});
