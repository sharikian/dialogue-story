import React from "react";
import type { DialogueMessage, CharacterEntry, BackgroundFilter } from "../types/dialogue";

export type DialogueProviderProps = {
  children: React.ReactNode;
  leftCharacters: CharacterEntry[];
  rightCharacters: CharacterEntry[];
  speed?: number; // default ms per type letters
  onFinished?: () => void; // called after full dialogue finishes
  mode?: "arcade" | "comic"; // "arcade" = original circular avatars; "comic" = full-character PNGs with comic-style bubbles
  rtl?: boolean; // when true, message/name alignment and bubble sides are displayed in RTL

  /**
   * Optional provider-wide background image.
   * - string: default background shown for the whole dialogue until a message overrides it
   * - null/undefined: no background (default)
   */
  bgImage?: string | null;

  /**
   * Optional provider-wide background filter (fade + blur).
   * Used for provider bgImage by default, and for messages that do not supply their own `filter`.
   */
  bgFilter?: BackgroundFilter;
};

export type DialogueContextValue = {
  dialogue: (messages: DialogueMessage[]) => Promise<void>;
  isActive: boolean;
};

export const DialogueContext = React.createContext<DialogueContextValue | null>(null);

export const useDialogueContext = () => {
  const ctx = React.useContext(DialogueContext);
  if (!ctx) throw new Error("useDialogueContext must be used within DialogueProvider");
  return ctx;
};
