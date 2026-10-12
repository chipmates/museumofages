// The source word of a visit that begins on a page: one word from a closed list, shared by every visitor of
// that kind. Worked out at the edge from the page request alone (its path and the Referer header the browser
// sends with it), so no script on the page reads the referrer. The referrer itself is never kept or passed on.

export const SOURCES = Object.freeze([
  'direct', 'search', 'ad_grant', 'ad_paid', 'ad_forum', 'forum', 'code', 'edu', 'wiki', 'news', 'mail', 'award',
  'assistant', 'social', 'referral',
])

// The addresses of links we place ourselves: a prefix in front of the real path.
const PREFIXES = Object.freeze({ g: 'ad_grant', p: 'ad_paid', f: 'ad_forum', o: 'forum' })

export const OWN_HOSTS = Object.freeze(['museumofages.org', 'www.museumofages.org'])

// Tested in this order: every specific list runs before the search engines, because mail.google.com,
// news.google.com and gemini.google.com would otherwise read as search.
export const HOST_LISTS = Object.freeze({
  assistant: [
    'chatgpt.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'anthropic.com', 'copilot.microsoft.com',
    'gemini.google.com', 'bard.google.com', 'you.com', 'phind.com', 'kagi.com', 'mistral.ai', 'x.ai', 'grok.com',
    'meta.ai', 'deepseek.com',
  ],
  edu: [
    'instructure.com', 'schoology.com', 'blackboard.com', 'brightspace.com', 'd2l.com', 'moodlecloud.com',
    'classroom.google.com', 'edmodo.com', 'seesaw.me', 'clever.com', 'itslearning.com', 'padlet.com', 'mebis.bycs.de',
    'lernraum-berlin.de', 'schul.cloud', 'iserv.de',
  ],
  mail: [
    'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'mail.yahoo.com',
    'mail.proton.me', 'navigator.gmx.net', 'navigator.web.de', 'mail.zoho.com', 'substack.com', 'beehiiv.com',
    'mailchi.mp', 'buttondown.email', 'buttondown.com', 'com.google.android.gm',
  ],
  code: ['github.com', 'gitlab.com', 'codeberg.org', 'bitbucket.org', 'sr.ht', 'gitea.com'],
  forum: [
    'reddit.com', 'redd.it', 'news.ycombinator.com', 'lobste.rs', 'tildes.net', 'slashdot.org', 'discord.com',
    'discordapp.com', 'lemmy.world', 'lemmy.ml', 'quora.com', 'stackexchange.com', 'stackoverflow.com',
  ],
  news: [
    'news.google.com', 'apple.news', 'flipboard.com', 'feedly.com', 'inoreader.com', 'msn.com', 'smartnews.com',
    'getpocket.com', 'newsnow.co.uk',
  ],
  wiki: ['wikipedia.org', 'wikimedia.org', 'wikiquote.org', 'wikisource.org', 'wikidata.org', 'wikiversity.org'],
  award: [
    'awwwards.com', 'cssdesignawards.com', 'thefwa.com', 'webbyawards.com', 'csswinner.com', 'siteinspire.com',
    'onepagelove.com', 'godly.website', 'lapa.ninja', 'httpster.net', 'minimal.gallery',
  ],
  social: [
    'x.com', 'twitter.com', 't.co', 'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'lnkd.in',
    'mastodon.social', 'bsky.app', 'threads.net', 'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com',
    'web.whatsapp.com', 'web.telegram.org', 't.me', 'teams.microsoft.com', 'teams.live.com', 'app.slack.com',
    'slack.com', 'signal.me', 'matrix.to',
  ],
  search: [
    'bing.com', 'duckduckgo.com', 'ecosia.org', 'yahoo.com', 'startpage.com', 'qwant.com', 'brave.com', 'baidu.com',
    'naver.com', 'seznam.cz', 'mojeek.com', 'com.google.android.googlequicksearchbox',
  ],
})

// Google and Yandex run a domain per country. Schools and universities share a naming shape, anchored at the
// end so a lookalike cannot borrow it.
const MULTI_TLD_SEARCH = /(^|\.)(google|yandex)\.[a-z]{2,}(\.[a-z]{2,})?$/
const EDU_NAME = /(\.edu|\.(?:edu|ac|sch)\.[a-z]{2}|\.k12\.[a-z]{2}\.us|\.schule)$/

const onList = (host, hosts) => hosts.some((h) => host === h || host.endsWith('.' + h))

/** The word of a path we place ourselves (`/a/g/...`), or ''. */
export function prefixWord(pathname) {
  const m = /^\/a\/([a-z])\//.exec(typeof pathname === 'string' ? pathname : '')
  return m && Object.hasOwn(PREFIXES, m[1]) ? PREFIXES[m[1]] : ''
}

/** The kind of the place a referrer's host belongs to. */
export function hostWord(host) {
  for (const word of ['assistant', 'edu', 'mail', 'code', 'forum', 'news', 'wiki', 'award', 'social']) {
    if (onList(host, HOST_LISTS[word])) return word
  }
  if (onList(host, HOST_LISTS.search) || MULTI_TLD_SEARCH.test(host)) return 'search'
  if (EDU_NAME.test(host)) return 'edu'
  return 'referral'
}

function hostOf(text) {
  try {
    return new URL(text).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * The source word of a page request: '' when the referrer is this site itself (the visit did not begin here),
 * otherwise the path's prefix word, else the referrer's kind, else 'direct'.
 */
export function sourceWord(url, referer) {
  const here = url.hostname.toLowerCase()
  const from = referer ? hostOf(referer) : ''
  if (from && (from === here || OWN_HOSTS.includes(from))) return ''
  return prefixWord(url.pathname) || (from ? hostWord(from) : 'direct')
}
