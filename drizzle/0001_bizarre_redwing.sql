CREATE TABLE "application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"jobProfileId" uuid NOT NULL,
	"sourceResumeId" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"applicationArtifact" jsonb,
	"targetArtifact" jsonb,
	"gapPlan" jsonb,
	"integrityStatus" text DEFAULT 'pending' NOT NULL,
	"agentSessionId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_fact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"organization" text,
	"description" text NOT NULL,
	"startDate" text,
	"endDate" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'inferred' NOT NULL,
	"qualityScore" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "career_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"learnedFrom" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"sourceType" text NOT NULL,
	"sourceRef" text,
	"excerpt" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"applicationId" uuid,
	"sessionId" text,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"decision" text NOT NULL,
	"rationale" text,
	"preferencePatch" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"inputType" text DEFAULT 'text' NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"rawText" text NOT NULL,
	"structured" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"applicationId" uuid,
	"capability" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"targetDate" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_jobProfileId_job_profile_id_fk" FOREIGN KEY ("jobProfileId") REFERENCES "public"."job_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_sourceResumeId_resume_id_fk" FOREIGN KEY ("sourceResumeId") REFERENCES "public"."resume"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_fact" ADD CONSTRAINT "career_fact_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_preference" ADD CONSTRAINT "career_preference_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_source" ADD CONSTRAINT "fact_source_factId_career_fact_id_fk" FOREIGN KEY ("factId") REFERENCES "public"."career_fact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_source" ADD CONSTRAINT "fact_source_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_event" ADD CONSTRAINT "feedback_event_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_event" ADD CONSTRAINT "feedback_event_applicationId_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_profile" ADD CONSTRAINT "job_profile_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goal" ADD CONSTRAINT "learning_goal_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_goal" ADD CONSTRAINT "learning_goal_applicationId_application_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_userId_idx" ON "application" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "application_jobProfileId_idx" ON "application" USING btree ("jobProfileId");--> statement-breakpoint
CREATE INDEX "career_fact_userId_idx" ON "career_fact" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "career_fact_userId_state_idx" ON "career_fact" USING btree ("userId","state");--> statement-breakpoint
CREATE INDEX "career_preference_userId_idx" ON "career_preference" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "career_preference_user_category_key" ON "career_preference" USING btree ("userId","category","key");--> statement-breakpoint
CREATE INDEX "fact_source_factId_idx" ON "fact_source" USING btree ("factId");--> statement-breakpoint
CREATE INDEX "fact_source_userId_idx" ON "fact_source" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "feedback_event_userId_idx" ON "feedback_event" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "feedback_event_applicationId_idx" ON "feedback_event" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "job_profile_userId_idx" ON "job_profile" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "learning_goal_userId_idx" ON "learning_goal" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "learning_goal_applicationId_idx" ON "learning_goal" USING btree ("applicationId");