// src/types/dialogue.ts

export type CharacterEntry = {
  name: string;
  mode?: string; // e.g. "happy", "angry" or omitted for default
  src: string;
};

/**
 * Background filter settings used by provider and messages.
 * - fade: transparency level (0..1). 0 => fully opaque (opacity = 1). 1 => fully transparent (opacity = 0).
 * - blur: blur amount in pixels (CSS blur radius). 0 => no blur.
 */
export type BackgroundFilter = {
  fade?: number; // 0..1, default 0 (means opacity = 1)
  blur?: number; // px, default 0
};

export type DialogueMessage = {
  text: string;
  charecter: string; // note spelling matches your request
  mode?: string;
  typeSpeed?: number; // ms per type letter
  textColor?: string;
  bgColor?: string;
  showTimes?: boolean; // new: if true, keep this speaker's dialogue visible when advancing
  /**
   * Optional background image for this message.
   * - string: change background to this image URL (remains until next change)
   * - null: explicitly clear background image (show nothing)
   * - undefined: no change
   */
  bgImage?: string | null;

  /**
   * Optional background image filter for this message.
   * Applies only when bgImage is set (or when provider bgImage is active).
   * If omitted the provider's bgFilter (or defaults) are used.
   */
  filter?: BackgroundFilter;
};
