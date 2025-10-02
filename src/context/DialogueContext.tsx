import React from "react";
import type { DialogueMessage, CharacterEntry, BackgroundFilter } from "../types/dialogue";

export type DialogueProviderProps = {
  children: React.ReactNode;

  /**
   * Either supply explicit left/right character arrays OR supply a single
   * `charectersPath` (note: intentionally spelled like this to match your API).
   *
   * If `charectersPath` is given, the provider will try to load
   * `${charectersPath}/index.json` which should have the manifest of folders/files.
   */
  leftCharacters?: CharacterEntry[];
  rightCharacters?: CharacterEntry[];

  /**
   * If provided the provider will attempt to load `${charectersPath}/index.json`
   * and auto-create CharacterEntry objects from the files under each character
   * folder. This is mutually exclusive with passing leftCharacters/rightCharacters.
   */
  charectersPath?: string;

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

  /**
   * When true, clicking the left half of the page/viewport moves the dialogue
   * backwards (previous message) and clicking the right half moves it forwards.
   * When false (default) clicks behave as original: advance forward, finish typing.
   */
  activeRedo?: boolean;
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
