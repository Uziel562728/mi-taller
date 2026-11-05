// Keep email callbacks at the deployed app root, without tracking or auth tokens.
export function applicationUrl(location = globalThis.window?.location, basePath) {
  if (!location) return undefined
  const url = new URL(basePath || './', location.href)
  url.search = ''
  url.hash = ''
  return url.href
}
