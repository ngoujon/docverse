/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_DOMAIN?: string;
  readonly VITE_HOSTING_COUNTRY?: string;
  readonly VITE_HOSTING_PROVIDER?: string;
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_CREDIT_NAME?: string;
  readonly VITE_CREDIT_URL?: string;
  readonly VITE_LEGAL_PUBLISHER?: string;
  readonly VITE_LEGAL_DIRECTOR?: string;
  readonly VITE_ANALYTICS_ENDPOINT?: string;
  readonly VITE_ANALYTICS_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
