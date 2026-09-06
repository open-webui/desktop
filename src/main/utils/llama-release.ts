export interface GithubReleaseAsset {
  name: string
  browser_download_url: string
  digest?: string
}

export interface GithubRelease {
  tag_name: string
  draft?: boolean
  assets?: GithubReleaseAsset[]
}

export function releaseHasLlamaBinaries(release: GithubRelease): boolean {
  if (release.draft) return false
  return (release.assets ?? []).some(
    (asset) =>
      typeof asset.name === 'string' &&
      asset.name.includes('-bin-') &&
      typeof asset.digest === 'string' &&
      asset.digest.startsWith('sha256:')
  )
}

/**
 * GitHub `latest` for ggml-org/llama.cpp is sometimes a stable tag with no
 * binaries (e.g. v0.4.0). Binary builds live on `b*` releases, often marked
 * prerelease. Pick the newest listed release that actually has hashed bins.
 */
export function pickLatestLlamaCppRelease(releases: GithubRelease[]): GithubRelease {
  const picked = releases.find(releaseHasLlamaBinaries)
  if (!picked) {
    throw new Error('No llama.cpp GitHub release with binary assets found')
  }
  return picked
}
