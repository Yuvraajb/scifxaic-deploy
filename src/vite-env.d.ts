/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_BENZINGA_TOKEN?: string;
  readonly VITE_ENABLE_CAPITAL_IQ?: string;
  readonly VITE_POLL_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
