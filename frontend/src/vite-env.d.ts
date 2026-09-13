/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_DOMAIN?: string;
  readonly VITE_HOSTING_COUNTRY?: string;
  readonly VITE_HOSTING_PROVIDER?: string;
  readonly VITE_AI_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
