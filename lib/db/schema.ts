import {
  AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Auth.js tables (Drizzle adapter canonical schema) + app tables.
 */

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  plan: text("plan").notNull().default("free"), // free | pro (M7)
  // Profile captured on first sign-in. First + last name is the identity used to
  // decide whether an imported resume may become this account's career memory,
  // and it is also the name printed on generated resumes and cover letters.
  // `name` is retained because the Auth.js adapter writes it; it is kept in sync.
  // Birth year stays optional: it is never needed for identity matching and is
  // sensitive in a hiring context.
  username: text("username").unique(),
  firstName: text("firstName"),
  lastName: text("lastName"),
  profession: text("profession"),
  phone: text("phone"),
  location: text("location"),
  // [{ label, url }] — validated against the safe-link allowlist before write.
  links: jsonb("links").notNull().default([]),
  birthYear: integer("birthYear"),
  profileCompletedAt: timestamp("profileCompletedAt", { mode: "date" }),
  // The user's source-of-truth resume. Supplies the design and contact block for
  // every generated resume. Held on the user so exactly one can be master; the
  // reference is cleared automatically if that resume is deleted.
  masterResumeId: uuid("masterResumeId"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<string>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    // Auth.js provides OAuth expiry as Unix seconds, not a JavaScript Date.
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: uniqueIndex("account_provider_providerAccountId_key").on(
      account.provider,
      account.providerAccountId,
    ),
  }),
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: uniqueIndex("verificationToken_identifier_token_key").on(
      vt.identifier,
      vt.token,
    ),
  }),
);

export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: text("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: text("credentialBackedUp").notNull(),
    transports: text("transports"),
  },
  (authenticator) => ({
    compoundKey: uniqueIndex("authenticator_userId_credentialID_key").on(
      authenticator.userId,
      authenticator.credentialID,
    ),
  }),
);

export const resumes = pgTable(
  "resume",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled resume"),
    doc: jsonb("doc").notNull(), // ResumeDoc
    // Whose resume this is. "self" feeds career memory and JD tailoring;
    // "third_party" is fully editable/exportable but never personal history.
    subjectKind: text("subjectKind").notNull().default("self"),
    subjectName: text("subjectName"),
    // Set when this resume was generated for a specific job application, so the
    // one-resume-per-JD trail is queryable after the fact. AnyPgColumn breaks
    // the circular type with applications.sourceResumeId.
    applicationId: uuid("applicationId").references(
      (): AnyPgColumn => applications.id,
      { onDelete: "set null" },
    ),
    shareSlug: text("shareSlug").unique(),
    isPublic: boolean("isPublic").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (resume) => ({
    userIdx: index("resume_userId_idx").on(resume.userId),
    applicationIdx: index("resume_applicationId_idx").on(resume.applicationId),
  }),
);

export const resumeTemplates = pgTable(
  "resume_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceResumeId: uuid("sourceResumeId").references(() => resumes.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default("Imported design"),
    schemaVersion: integer("schemaVersion").notNull().default(1),
    design: jsonb("design").notNull(),
    designFingerprint: text("designFingerprint").notNull(),
    visibility: text("visibility").notNull().default("private"),
    previewMetadata: jsonb("previewMetadata").notNull().default({}),
    publishedAt: timestamp("publishedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (template) => ({
    userIdx: index("resume_template_userId_idx").on(template.userId),
    publicIdx: index("resume_template_visibility_idx").on(template.visibility),
    ownerFingerprint: uniqueIndex("resume_template_user_fingerprint_key").on(
      template.userId,
      template.designFingerprint,
    ),
  }),
);

/**
 * Canonical career memory. Agent sessions live in Firestore; these tables hold
 * durable, user-approved product truth and generated artifacts.
 */
export const careerFacts = pgTable(
  "career_fact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    organization: text("organization"),
    description: text("description").notNull(),
    startDate: text("startDate"),
    endDate: text("endDate"),
    skills: jsonb("skills").notNull().default([]),
    metrics: jsonb("metrics").notNull().default([]),
    state: text("state").notNull().default("inferred"),
    qualityScore: integer("qualityScore").notNull().default(0),
    // A free-text instruction from the user about this item, which the agent
    // reads when composing applications ("say I led this, not assisted").
    userNote: text("userNote"),
    // Set when the user rewrites the wording themselves, so a generated claim can
    // be honest that the phrasing is the user's rather than the source document's.
    editedAt: timestamp("editedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (fact) => ({
    userIdx: index("career_fact_userId_idx").on(fact.userId),
    stateIdx: index("career_fact_userId_state_idx").on(fact.userId, fact.state),
  }),
);

export const factSources = pgTable(
  "fact_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    factId: uuid("factId")
      .notNull()
      .references(() => careerFacts.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("sourceType").notNull(),
    sourceRef: text("sourceRef"),
    sourceKey: text("sourceKey"),
    excerpt: text("excerpt").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (source) => ({
    factIdx: index("fact_source_factId_idx").on(source.factId),
    userIdx: index("fact_source_userId_idx").on(source.userId),
    uniqueSourceKey: uniqueIndex("fact_source_user_ref_key").on(
      source.userId,
      source.sourceRef,
      source.sourceKey,
    ),
  }),
);

export const careerPreferences = pgTable(
  "career_preference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    learnedFrom: text("learnedFrom").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (preference) => ({
    userIdx: index("career_preference_userId_idx").on(preference.userId),
    uniqueKey: uniqueIndex("career_preference_user_category_key").on(
      preference.userId,
      preference.category,
      preference.key,
    ),
  }),
);

export const jobProfiles = pgTable(
  "job_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inputType: text("inputType").notNull().default("text"),
    title: text("title").notNull(),
    company: text("company"),
    rawText: text("rawText").notNull(),
    structured: jsonb("structured").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (job) => ({
    userIdx: index("job_profile_userId_idx").on(job.userId),
  }),
);

export const applications = pgTable(
  "application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobProfileId: uuid("jobProfileId")
      .notNull()
      .references(() => jobProfiles.id, { onDelete: "cascade" }),
    sourceResumeId: uuid("sourceResumeId").references(() => resumes.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    // Six-block cover letter generated alongside the resume, plus the company
    // understanding it was built from so the user can check it before sending.
    coverLetter: jsonb("coverLetter"),
    applicationArtifact: jsonb("applicationArtifact"),
    targetArtifact: jsonb("targetArtifact"),
    gapPlan: jsonb("gapPlan"),
    integrityStatus: text("integrityStatus").notNull().default("pending"),
    agentSessionId: text("agentSessionId"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (application) => ({
    userIdx: index("application_userId_idx").on(application.userId),
    jobIdx: index("application_jobProfileId_idx").on(application.jobProfileId),
  }),
);

export const learningGoals = pgTable(
  "learning_goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("applicationId").references(() => applications.id, {
      onDelete: "set null",
    }),
    capability: text("capability").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("planned"),
    tasks: jsonb("tasks").notNull().default([]),
    evidence: jsonb("evidence").notNull().default([]),
    targetDate: text("targetDate"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (goal) => ({
    userIdx: index("learning_goal_userId_idx").on(goal.userId),
    applicationIdx: index("learning_goal_applicationId_idx").on(
      goal.applicationId,
    ),
  }),
);

export const feedbackEvents = pgTable(
  "feedback_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("applicationId").references(() => applications.id, {
      onDelete: "set null",
    }),
    sessionId: text("sessionId"),
    type: text("type").notNull(),
    subject: text("subject").notNull(),
    decision: text("decision").notNull(),
    rationale: text("rationale"),
    preferencePatch: jsonb("preferencePatch"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (feedback) => ({
    userIdx: index("feedback_event_userId_idx").on(feedback.userId),
    applicationIdx: index("feedback_event_applicationId_idx").on(
      feedback.applicationId,
    ),
  }),
);

export type ResumeRow = typeof resumes.$inferSelect;
export type NewResumeRow = typeof resumes.$inferInsert;
export type ResumeTemplateRow = typeof resumeTemplates.$inferSelect;
export type CareerFactRow = typeof careerFacts.$inferSelect;
export type NewCareerFactRow = typeof careerFacts.$inferInsert;
export type ApplicationRow = typeof applications.$inferSelect;
export type LearningGoalRow = typeof learningGoals.$inferSelect;
