import React from "react";
import type { DialogueMessage, CharacterEntry } from "../types/dialogue";

export type DialogueProviderProps = {
  children: React.ReactNode;
  leftCharacters: CharacterEntry[];
  rightCharacters: CharacterEntry[];
  speed?: number; // default ms per type letters
  onFinished?: () => void; // called after full dialogue finishes
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
