import type { SyntheticEvent } from 'react';

export function dicebearAvatar(seed?: string | null, style: 'bottts' | 'identicon' = 'bottts') {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed || 'chatly'}`;
}

/** Swaps a broken profile photo URL for a generated avatar, once. */
export function onAvatarError(
  event: SyntheticEvent<HTMLImageElement>,
  seed?: string | null,
  style: 'bottts' | 'identicon' = 'bottts'
) {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = dicebearAvatar(seed, style);
}
