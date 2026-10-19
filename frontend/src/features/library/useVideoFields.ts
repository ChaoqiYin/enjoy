import { useQuery } from '@tanstack/react-query';
import { libraryApi } from '../../shared/api';
import type { Video, VideoField } from '../../shared/api';
import { useSpace } from '../space/SpaceProvider';

/**
 * What the plugins have written about the video the drawer has open.
 *
 * The question is asked when a video is *opened* rather than when the panel is
 * mounted, and the two are not the same event: the drawer shell is mounted for
 * as long as the page is — it is closed, not removed — so a question tied to the
 * mount would be asked once and then never again, and the panel would show the
 * record as the plugins left it the first time anyone looked. A plugin-written
 * value is the one thing that cannot be read from a cache: the command is what
 * asks the plugins, so asking is what makes the answer current.
 *
 * `null` is the closed drawer, and it is the caller's job to say so. It is not
 * derived from `video` being falsy, because a panel that is open onto no video
 * is a state the caller has and this hook does not.
 *
 * The answer is the fields and nothing else. A question that has not come back
 * yet, or one that never will, draws the same panel as a video no plugin has
 * written anything about: the panel is a list of terms, and there is nothing to
 * put in it either way. What a failure here means is either a record that has
 * left the library — which the drawer reads off the list and acts on itself —
 * or a library that is not answering, which is reported by the notice every
 * other failing query goes to. Neither is the panel's to say.
 */
export function useVideoFields(video: Video | null): VideoField[] {
  const { id: spaceId } = useSpace();
  const fields = useQuery({
    // Keyed by the space as well as the record, like every other library query:
    // the same id in another space is another video, and its fields are its own.
    queryKey: ['fields', spaceId, video?.id ?? null],
    queryFn: () => libraryApi.fields(spaceId, video!.path),
    enabled: video !== null,
    retry: false,
  });
  return fields.data ?? [];
}
