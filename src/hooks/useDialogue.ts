import { useContext } from "react";
import { DialogueContext } from "../context/DialogueContext";

export const useDialogue = () => {
  const ctx = useContext(DialogueContext);
  if (!ctx) throw new Error("useDialogue must be used within DialogueProvider");
  return ctx;
};
