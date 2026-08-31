ALTER TABLE "fact_source" ADD COLUMN "sourceKey" text;--> statement-breakpoint
CREATE UNIQUE INDEX "fact_source_user_ref_key" ON "fact_source" USING btree ("userId","sourceRef","sourceKey");