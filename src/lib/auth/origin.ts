export function configuredOrigin(env: Readonly<Record<string, string | undefined>> = process.env) {
  const previewHost = [env.VERCEL_BRANCH_URL, env.VERCEL_URL]
    .find((host) => host && /^[a-z0-9-]+\.vercel\.app$/.test(host));
  const configured = env.AUTH_ORIGIN || (env.VERCEL_ENV === "preview" && previewHost ? "https://" + previewHost : "");
  try {
    const url = new URL(configured);
    const secure = env.NODE_ENV === "production" || env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production";
    return url.origin === configured && (url.protocol === "https:" || (!secure && url.protocol === "http:")) ? configured : null;
  } catch {
    return null;
  }
}
