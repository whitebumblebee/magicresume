CREATE TABLE "resume_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"sourceResumeId" uuid,
	"title" text DEFAULT 'Imported design' NOT NULL,
	"schemaVersion" integer DEFAULT 1 NOT NULL,
	"design" jsonb NOT NULL,
	"designFingerprint" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"previewMetadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_template" ADD CONSTRAINT "resume_template_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_template" ADD CONSTRAINT "resume_template_sourceResumeId_resume_id_fk" FOREIGN KEY ("sourceResumeId") REFERENCES "public"."resume"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_template_userId_idx" ON "resume_template" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "resume_template_visibility_idx" ON "resume_template" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_template_user_fingerprint_key" ON "resume_template" USING btree ("userId","designFingerprint");