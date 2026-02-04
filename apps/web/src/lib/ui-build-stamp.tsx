import { env } from "../env";

const environmentLabel = env.NEXT_PUBLIC_ENVIRONMENT_LABEL;
const showNonProdSafetyBanner =
  env.NEXT_PUBLIC_NON_PROD_SAFETY_BANNER_ENABLED && env.NEXT_PUBLIC_ENVIRONMENT_LABEL !== "PROD";

const formatVersion = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "v0.0.0";
  }
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
};

export function ReleaseIdentityFooter() {
  const version = formatVersion(env.NEXT_PUBLIC_APP_VERSION);
  const currentYear = new Date().getFullYear();
  return (
    <div className="release-footer" aria-label={`Release ${version} ${environmentLabel}`}>
      <span>{`LedgerLite © ${currentYear}`}</span>
      <span aria-hidden="true">•</span>
      <span>{version}</span>
      <span className={`environment-chip ${environmentLabel.toLowerCase()}`}>{environmentLabel}</span>
    </div>
  );
}

export function NonProductionSafetyBanner() {
  if (!showNonProdSafetyBanner) {
    return null;
  }
  return (
    <div className={`environment-banner ${environmentLabel.toLowerCase()}`} role="status" aria-live="polite">
      {environmentLabel} environment: this workspace is for testing and validation.
    </div>
  );
}
