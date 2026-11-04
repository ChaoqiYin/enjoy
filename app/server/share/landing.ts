/**
 * Browser landing page shown at the share root.
 *
 * WebDAV clients never read it; it exists so a person who opens the address in
 * a browser sees whether the service is alive instead of raw XML.
 */

export type WebdavLanguage = 'zh-CN' | 'en'

const COPY: Record<WebdavLanguage, { title: string; heading: string; body: string }> = {
  'zh-CN': {
    title: 'Enjoy 分享',
    heading: 'Enjoy 正在分享视频',
    body: '这是一个只读 WebDAV 服务。请在播放器或文件管理器中用页面给出的地址、用户名和密码连接。',
  },
  en: {
    title: 'Enjoy share',
    heading: 'Enjoy is sharing videos',
    body: 'This is a read-only WebDAV service. Connect from a player or file manager with the address, username and password shown in the app.',
  },
}

/** Pick the first supported language the browser asks for, by quality value. */
export function selectLanguage(
  acceptLanguage: string | undefined,
  fallback: WebdavLanguage,
): WebdavLanguage {
  if (!acceptLanguage) return fallback

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [rawTag, ...parameters] = part.trim().split(';')
      const tag = rawTag?.trim().toLowerCase() ?? ''
      let quality = 1
      for (const parameter of parameters) {
        const [key, value] = parameter.trim().split('=')
        if (key?.toLowerCase() === 'q') {
          const parsed = Number(value)
          quality = Number.isFinite(parsed) ? parsed : 0
        }
      }
      return { tag, quality }
    })
    .filter((entry) => entry.tag !== '' && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality)

  for (const { tag } of ranked) {
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-CN'
    if (tag === 'en' || tag.startsWith('en-')) return 'en'
  }
  return fallback
}

export function landingPage(language: WebdavLanguage): string {
  const copy = COPY[language]
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${copy.title}</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111; color: #eee; font-family: system-ui, sans-serif; }
main { max-width: 36rem; padding: 2rem; text-align: center; line-height: 1.6; }
h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
p { margin: 0; color: #bbb; }
</style>
</head>
<body>
<main>
<h1>${copy.heading}</h1>
<p>${copy.body}</p>
</main>
</body>
</html>
`
}
