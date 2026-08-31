export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    (process.env.K_SERVICE || process.env.GENKIT_TELEMETRY_FORCE === "1")
  ) {
    const { enableGoogleCloudTelemetry } = await import(
      "@genkit-ai/google-cloud"
    );
    await enableGoogleCloudTelemetry({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      autoInstrumentation: true,
      disableLoggingInputAndOutput: true,
      forceDevExport: process.env.GENKIT_TELEMETRY_FORCE === "1",
    });
  }
}
