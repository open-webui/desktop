declare global {
  interface Window {
    electron: { process: { versions: NodeJS.ProcessVersions } }
    api: unknown
  }
}

export {}
