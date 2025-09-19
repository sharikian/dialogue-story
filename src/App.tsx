import React from "react";
import { DialogueProvider } from "./components/DialogueProvider";
import { useDialogue } from "./hooks/useDialogue";
import type { DialogueMessage } from "./types/dialogue";

const AppInner: React.FC = () => {
  const { dialogue } = useDialogue();

  const start = async () => {
    const messages: DialogueMessage[] = [
      { text: "Hey! Welcome to the camp.", charecter: "Eddy", mode: "happy", typeSpeed: 30, textColor: "#fff", bgColor: "#1f6feb", showTimes: true },
      { text: "We need you to defend the village.", charecter: "Ali", typeSpeed: 28, textColor: "#000", bgColor: "#ffd27f" },
      { text: "On it — I'll get the catapult ready.", charecter: "Eddy", mode: "angry", typeSpeed: 32, textColor: "#fff", bgColor: "#d9534f" },
      { text: "Good. I'll watch the flank.", charecter: "Ali", typeSpeed: 28 },
      // consecutive Eddy messages to trigger "change" animation:
      { text: "Loading ammunition...", charecter: "Eddy", typeSpeed: 18 },
      { text: "Almost done!", charecter: "Eddy", typeSpeed: 10 },
    ];

    await dialogue(messages); // optional await; provider will call onFinished prop too
    console.log("dialog finished");
  };

  return (
    <div style={{ padding: 30 }}>
      <h1>Game UI</h1>
      <button onClick={start}>Start Dialogue</button>
      <p>Click anywhere during dialogue to advance (or Space/Enter).</p>
    </div>
  );
};

export default function App() {
  // Provide character assets and modes here
  const left = [
    { name: "Eddy", src: "/avatars/left.png" },
    { name: "Eddy", mode: "angry", src: "/avatars/left.png" }
  ];
  const right = [
    { name: "Ali", src: "/avatars/right.png" },
  ];

  const handleFinished = () => {
    console.log("Dialogue finished (onFinished prop)");
  };

  return (
    <DialogueProvider leftCharacters={left} rightCharacters={right} mode="comic" speed={40} onFinished={handleFinished}>
      <AppInner />
    </DialogueProvider>
  );
}
