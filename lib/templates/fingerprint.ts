import { createHash } from "node:crypto";
import type { ResumeTemplateDesign } from "./schema";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

export function designFingerprint(design: ResumeTemplateDesign): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(design)))
    .digest("hex");
}
