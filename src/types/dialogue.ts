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
};
