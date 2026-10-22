import { routes, type VercelConfig } from "@vercel/config/v1";

declare const process: {
  env: {
    ASTRA_STAGING_BACKEND_URL?: string;
    VERCEL_ENV?: string;
  };
};

const productionBackend = "https://astra-q5qm.onrender.com";
const isProduction = process.env.VERCEL_ENV === "production";
const configuredPreviewBackend = process.env.ASTRA_STAGING_BACKEND_URL?.trim();

function previewBackendOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "Preview deployments require ASTRA_STAGING_BACKEND_URL to point to the staging backend.",
    );
  }

  let backend: URL;
  try {
    backend = new URL(value);
  } catch {
    throw new Error("ASTRA_STAGING_BACKEND_URL must be an absolute HTTPS URL.");
  }

  if (
    backend.protocol !== "https:" ||
    backend.username ||
    backend.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash
  ) {
    throw new Error(
      "ASTRA_STAGING_BACKEND_URL must be an HTTPS backend origin without credentials, path, query, or fragment.",
    );
  }

  return backend.origin;
}

const backendOrigin = isProduction
  ? productionBackend
  : previewBackendOrigin(configuredPreviewBackend);

if (!isProduction && backendOrigin === productionBackend) {
  throw new Error("Preview deployments must not target the production backend.");
}

export const config: VercelConfig = {
  rewrites: [
    routes.rewrite("/api/(.*)", `${backendOrigin}/$1`),
    routes.rewrite("/(.*)", "/index.html"),
  ],
  headers: [
    {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    },
  ],
};
