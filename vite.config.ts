import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import wasm from "vite-plugin-wasm"
import { defineConfig } from "vite"

function readPackageVersion(): string {
  try {
    const packageJsonPath = path.resolve(__dirname, "package.json")
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string }
    return pkg.version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

function readGitValue(command: string): string | undefined {
  try {
    return execSync(command, {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim()
  } catch {
    return undefined
  }
}

const packageVersion = readPackageVersion()
const ciTag =
  process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME
    : process.env.CI_COMMIT_TAG
const gitTag = process.env.VITE_GIT_TAG || ciTag || readGitValue("git describe --tags --exact-match")
const gitSha = process.env.VITE_GIT_SHA || process.env.GITHUB_SHA?.slice(0, 7) || readGitValue("git rev-parse --short HEAD")
const appVersion = process.env.VITE_APP_VERSION || gitTag || packageVersion

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    "import.meta.env.VITE_GIT_TAG": JSON.stringify(gitTag ?? ""),
    "import.meta.env.VITE_GIT_SHA": JSON.stringify(gitSha ?? ""),
  },
  server: {
    port: 5175,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    plugins: () => [wasm()],
  },
  optimizeDeps: {
    exclude: ["openscad-wasm"],
  },
  build: {
    target: "esnext",
  },
})
