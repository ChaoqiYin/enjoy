import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { BrandLogo } from '../shared/BrandLogo';
import { SpaceSwitcher } from '../features/space/SpaceSwitcher';
import { useShareContext } from '../features/share/ShareProvider';
export function AppNavigation() {
  const { t } = useTranslation();
  const share = useShareContext();
  const sharing = share.port !== null;
  // A lamp on the entry, and the words that go with it, in the two places words
  // are read from a lamp: under the pointer, and by a reader that has none. The
  // colour is the glance; the words are the answer, and a lamp that had only
  // the colour would be one a user has to have been told about to know.
  const indicator = t('sharingIndicator');
  return (
    <header className="shrink-0 z-20 bg-base-100 border-b border-base-300 p-4 flex flex-wrap items-center gap-4">
      <BrandLogo />
      <SpaceSwitcher />
      <nav className="tabs tabs-border" aria-label={t('nav')}>
        {[
          ['/', t('library')],
          ['/favorites', t('favorites')],
          ['/history', t('history')],
          ['/share', t('sharing')],
          ['/settings', t('settings')],
        ].map(([path, label]) => (
          <NavLink
            key={path}
            to={path}
            end
            className={({ isActive }) =>
              `tab font-semibold ${isActive ? 'tab-active text-primary' : ''}`
            }
          >
            {/* The lamp hangs on the label's own box rather than sitting beside
                it in the row: a dot in the row is one the tab has to make room
                for, and it lands at the vertical middle of the text, which is
                where a full stop goes rather than where a lamp hangs. The label
                is given a box of its own to hang it from, and the lamp is taken
                out of the flow at that box's top-right corner. */}
            <span className="relative inline-block">
              {label}
              {path === '/share' && sharing && (
                <span
                  // 描边是量出来的，不是画着好看：`--color-success` 在两个主题
                  // 下是同一个薄荷绿，白底上只有 1.96:1，而灯的全部作用就是被一眼
                  // 看到。描边取同一对颜色里的深绿——亮色下由它撑起对比度
                  // （10.4:1），暗色下由填充撑（8.08:1），两件颜色都出自
                  // daisyUI 自己的那一对，没有另造一个绿。
                  // `border` 而不是 `ring-1`：这个项目生成的样式表里没有
                  // `ring-*` 的规则（量过），写了等于没写，灯还是看不出来。
                  className="absolute top-0 -right-1 block size-2 rounded-full bg-success border border-success-content"
                  title={indicator}
                  aria-hidden="true"
                />
              )}
            </span>
            {path === '/share' && sharing && (
              <span className="sr-only">{indicator}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
