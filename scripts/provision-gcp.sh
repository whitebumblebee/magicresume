#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${DATABASE_URL:?Set DATABASE_URL to the MR Neon connection string}"
: "${AUTH_SECRET:?Set AUTH_SECRET}"
: "${AUTH_GOOGLE_ID:?Set AUTH_GOOGLE_ID}"
: "${AUTH_GOOGLE_SECRET:?Set AUTH_GOOGLE_SECRET}"

REGION="${REGION:-us-central1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-nam5}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-mr-career-partner}"
AR_REPOSITORY="${AR_REPOSITORY:-mr}"

gcloud services enable \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  --project="${PROJECT_ID}"

gcloud artifacts repositories describe "${AR_REPOSITORY}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "${AR_REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT_ID}"

gcloud iam service-accounts describe \
  "${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "${SERVICE_ACCOUNT}" \
    --display-name="MR Career Partner runtime" \
    --project="${PROJECT_ID}"

for role in \
  roles/aiplatform.user \
  roles/datastore.user \
  roles/logging.logWriter \
  roles/monitoring.metricWriter \
  roles/secretmanager.secretAccessor \
  roles/cloudtrace.agent; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="${role}" \
    --condition=None >/dev/null
done

CLOUDBUILD_SA="$(gcloud builds get-default-service-account \
  --project="${PROJECT_ID}" \
  --format='value(serviceAccountEmail)')"
for role in \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/run.admin \
  roles/secretmanager.viewer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CLOUDBUILD_SA}" \
    --role="${role}" \
    --condition=None >/dev/null
done

gcloud firestore databases describe \
  --database="(default)" \
  --project="${PROJECT_ID}" >/dev/null 2>&1 \
  || gcloud firestore databases create \
    --database="(default)" \
    --location="${FIRESTORE_LOCATION}" \
    --type=firestore-native \
    --project="${PROJECT_ID}"

put_secret() {
  local name="$1"
  local value="$2"
  gcloud secrets describe "${name}" --project="${PROJECT_ID}" >/dev/null 2>&1 \
    || gcloud secrets create "${name}" \
      --replication-policy=automatic \
      --project="${PROJECT_ID}"
  printf '%s' "${value}" | gcloud secrets versions add "${name}" \
    --data-file=- \
    --project="${PROJECT_ID}" >/dev/null
}

put_secret mr-database-url "${DATABASE_URL}"
put_secret mr-auth-secret "${AUTH_SECRET}"
put_secret mr-google-client-id "${AUTH_GOOGLE_ID}"
put_secret mr-google-client-secret "${AUTH_GOOGLE_SECRET}"

echo "Google Cloud foundation is ready for ${PROJECT_ID}."
echo "Run: gcloud builds submit --project ${PROJECT_ID} --config cloudbuild.yaml"
