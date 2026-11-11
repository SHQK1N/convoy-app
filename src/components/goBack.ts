/**
 * "Back" that always works: goes back if there is a previous screen, otherwise opens `fallback`.
 * Needed because a screen can be opened directly (browser refresh, notification tap) with no
 * history — then router.back() does nothing and logs "GO_BACK was not handled".
 */
import { router, type Href } from 'expo-router';

export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
