// Embedded pages get these capabilities only, never the desktop process/config API.
interface GuestAPI {
  getVersion(): Promise<unknown>
  getAppInfo(): Promise<unknown>
  openInBrowser(url: string): Promise<unknown>
  notification(title: string, body: string): Promise<unknown>
}
export async function handleGuestRequest(
  api: GuestAPI,
  request: { type?: string; url?: unknown; title?: unknown; body?: unknown }
): Promise<unknown> {
  switch (request.type) {
    case 'getVersion':
      return api.getVersion()
    case 'app:info':
    case 'getAppInfo':
      return api.getAppInfo()
    case 'app:data':
      return {}
    case 'openInBrowser': {
      if (
        typeof request.url !== 'string' ||
        !['http:', 'https:'].includes(new URL(request.url).protocol)
      )
        throw new Error('Invalid URL')
      return api.openInBrowser(request.url)
    }
    case 'notification':
      if (
        typeof request.title !== 'string' ||
        typeof request.body !== 'string' ||
        request.title.length > 256 ||
        request.body.length > 4096
      )
        throw new Error('Invalid notification')
      return api.notification(request.title, request.body)
    default:
      throw new Error('Unsupported desktop request')
  }
}
