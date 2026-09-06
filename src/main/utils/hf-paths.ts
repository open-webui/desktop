import path from 'path'

const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const FILE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/

export function assertSafeRepo(repo: string): string {
  if (typeof repo !== 'string' || !REPO_RE.test(repo)) {
    throw new Error('Invalid Hugging Face repository id')
  }
  return repo
}

export function assertSafeFilename(filename: string): string {
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new Error('Invalid model filename')
  }
  if (path.isAbsolute(filename) || filename.includes('\0')) {
    throw new Error('Invalid model filename')
  }
  const parts = filename.split(/[/\\]/)
  if (
    parts.some(
      (part) => part === '' || part === '.' || part === '..' || !FILE_SEGMENT_RE.test(part)
    )
  ) {
    throw new Error('Invalid model filename')
  }
  if (!filename.toLowerCase().endsWith('.gguf')) {
    throw new Error('Only GGUF files can be downloaded')
  }
  return filename
}

export function repoSlug(repo: string): string {
  return assertSafeRepo(repo).replace(/\//g, '--')
}

export function confinedModelPath(cacheRoot: string, repo: string, filename: string): string {
  const safeRepo = assertSafeRepo(repo)
  const safeFile = assertSafeFilename(filename)
  const resolvedRoot = path.resolve(cacheRoot)
  const dest = path.resolve(resolvedRoot, repoSlug(safeRepo), safeFile)
  if (dest !== resolvedRoot && !dest.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Refusing path outside the models directory')
  }
  return dest
}

export function huggingfaceDownloadUrl(repo: string, filename: string): string {
  const [owner, name] = assertSafeRepo(repo).split('/')
  const filePath = assertSafeFilename(filename)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `https://huggingface.co/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/resolve/main/${filePath}`
}

export function huggingfaceRepoApiUrl(repo: string): string {
  const [owner, name] = assertSafeRepo(repo).split('/')
  // blobs=true is required for siblings[].lfs.sha256 (the GGUF content hash).
  // Without it the Hub only returns rfilename.
  return `https://huggingface.co/api/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}?blobs=true`
}
