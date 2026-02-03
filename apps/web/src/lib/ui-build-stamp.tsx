import { env } from "../env";

export function BuildStamp() {
  const version = env.NEXT_PUBLIC_APP_VERSION;
  if (!version) {
    return null;
  }

  const shortVersion = version.length > 12 ? version.slice(0, 12) : version;

  return (
    <div className="build-stamp" title={`Build ${version}`}>
      build {shortVersion}
    </div>
  );
}
