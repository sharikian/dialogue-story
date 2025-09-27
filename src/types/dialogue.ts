export type CharacterEntry = {
  name: string;
  mode?: string; // e.g. "happy", "angry" or omitted for default
  src: string;
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
};
