import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * The two languages the first version ships. Only the keys these two pages
 * actually read are migrated; the old interface's full catalogue carries pages
 * this build does not have yet.
 */
const en = {
  appName: 'Enjoy',
  library: 'Library',
  favorites: 'Favorites',
  settings: 'Settings',
  plugins: 'Plugins',
  viewMode: 'View',
  viewGrid: 'Grid view',
  viewList: 'Compact list',
  viewTable: 'Table view',
  sort: 'Sort',
  newest: 'Newest',
  played: 'Recently played',
  name: 'Name',
  size: 'Size',
  filter: 'Filter',
  filterAll: 'All',
  filterFavorites: 'Favorites',
  filterPlayed: 'Played',
  videoCount: 'Videos in this library: {{countText}}',
  loading: 'Loading your library…',
  empty: 'No videos yet',
  welcome: 'Add a local folder to start your video library',
  emptyFavorites: 'No favorites yet',
  favoritesHelp: 'Choose Favorites in a video menu to save it here',
  emptyPlayed: 'No played videos yet',
  emptyPlayedHelp: 'Open a video and it will appear here',
  emptyFiltered: 'No matching videos',
  emptyFilteredHelp: 'Try another filter, or show all videos',
  clear: 'Show all',
  play: 'Play',
  favorite: 'Add to favorites',
  unfavorite: 'Remove from favorites',
  playFailed: 'Could not open this video',
  playUnsupported: 'Open this video in the desktop app',
  copyPath: 'Copy path',
  copied: 'Copied',
  close: 'Close',
  retry: 'Retry',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  pageIndicator: '{{page}} / {{pages}}',
  duration: 'Duration',
  fileSize: 'Size',
  actions: 'Actions',
  settingsPlaceholder: 'The settings page arrives in a later task',
  pluginsEmpty: 'No plugins',
  pluginsEmptyHint: 'The first version ships without application plugins',
  notFound: 'Page not found',
  errorUnexpected: 'Something went wrong, please retry',
}

const zhCN: typeof en = {
  appName: 'Enjoy',
  library: '视频库',
  favorites: '收藏',
  settings: '设置',
  plugins: '插件',
  viewMode: '视图',
  viewGrid: '网格视图',
  viewList: '紧凑列表',
  viewTable: '表格视图',
  sort: '排序',
  newest: '最新',
  played: '最近播放',
  name: '名称',
  size: '大小',
  filter: '筛选',
  filterAll: '全部',
  filterFavorites: '收藏',
  filterPlayed: '已播放',
  videoCount: '本库共 {{countText}} 个视频',
  loading: '正在读取视频库…',
  empty: '这里还没有视频',
  welcome: '添加本地目录，开始建立你的媒体库',
  emptyFavorites: '还没有收藏',
  favoritesHelp: '在视频操作菜单中选择收藏，将视频保存到这里',
  emptyPlayed: '还没有播放过的视频',
  emptyPlayedHelp: '打开一个视频后，它会出现在这里',
  emptyFiltered: '没有匹配的视频',
  emptyFilteredHelp: '换个筛选条件，或显示全部视频',
  clear: '显示全部',
  play: '播放',
  favorite: '收藏',
  unfavorite: '取消收藏',
  playFailed: '无法打开这个视频',
  playUnsupported: '请用桌面应用打开',
  copyPath: '复制路径',
  copied: '已复制',
  close: '关闭',
  retry: '重试',
  previousPage: '上一页',
  nextPage: '下一页',
  pageIndicator: '{{page}} / {{pages}}',
  duration: '时长',
  fileSize: '大小',
  actions: '操作',
  settingsPlaceholder: '设置页将在后续任务中实现',
  pluginsEmpty: '暂无插件',
  pluginsEmptyHint: '第一版没有应用插件',
  notFound: '找不到页面',
  errorUnexpected: '操作失败，请重试',
}

const LANGUAGE_KEY = 'enjoy/language'

function initialLanguage(): string {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (saved === 'en' || saved === 'zh-CN') return saved
  } catch {
    // Private windows may refuse storage; fall back to the shipped default.
  }
  return 'zh-CN'
}

void i18n.use(initReactI18next).init({
  lng: initialLanguage(),
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  defaultNS: 'translation',
  keySeparator: false,
  interpolation: { escapeValue: false },
  // Static resources: initialise synchronously so the first render already has
  // its words instead of flashing keys.
  initImmediate: false,
})

export function setLanguage(language: 'en' | 'zh-CN'): Promise<unknown> {
  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch {
    // Ignore storage failures; the in-memory language still changes.
  }
  document.documentElement.lang = language
  return i18n.changeLanguage(language)
}

export default i18n
