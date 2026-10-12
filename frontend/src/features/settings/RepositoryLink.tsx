import { useTranslation } from 'react-i18next';
import { Github } from 'lucide-react';
import { openExternal } from '../../shared/api';
import { Button } from '../../shared/ui/button';
import { Tooltip } from '../../shared/Tooltip';

const repositoryUrl = 'https://github.com/ChaoqiYin/enjoy';

/**
 * The way out to the source: one mark at the end of the 常规 block's heading,
 * and nothing else.
 *
 * It carries no label of its own. The address is the same for everyone and
 * never changes, so it is not a fact this page has to carry in words — and the
 * heading row it stands in is the one place in this section with room in it and
 * nothing put there. The name is still spelled out twice over for a reader who
 * cannot see which mark this is: once as the tooltip a pointer gets, once as
 * `aria-label` for a screen reader. The two are the same words, as they are at
 * every other control in this repository.
 *
 * Where the page opens is `openExternal`'s decision rather than this file's,
 * and it is not a detail: a window is the whole of this application, so the
 * browser the user already has is what shows the repository.
 */
export function RepositoryLink() {
  const { t } = useTranslation();
  const label = t('openRepository');
  return (
    <Tooltip text={label}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={label}
        onClick={() => void openExternal(repositoryUrl)}
      >
        <Github size={14} aria-hidden="true" />
      </Button>
    </Tooltip>
  );
}
