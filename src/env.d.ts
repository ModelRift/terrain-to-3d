/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
  readonly VITE_GIT_TAG: string
  readonly VITE_GIT_SHA: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
