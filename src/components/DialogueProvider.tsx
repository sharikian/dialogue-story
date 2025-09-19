import { useCallback, useEffect, useRef, useState } from "react";
import { DialogueContext } from "../context/DialogueContext";
import type { DialogueProviderProps } from "../context/DialogueContext";
import type { DialogueMessage, CharacterEntry } from "../types/dialogue";
import "./Dialogue.css";

type InternalMessage = DialogueMessage & {
  resolvedTypeSpeed: number;
  resolvedTextColor: string;
  resolvedBgColor: string;
};

export function DialogueProvider({
  children,
  leftCharacters,
  rightCharacters,
  speed = 35,
  onFinished,
}: DialogueProviderProps) {
  const [activeMessages, setActiveMessages] = useState<
    InternalMessage[] | null
  >(null);
  const [index, setIndex] = useState(0);
  const [display, setDisplay] = useState(""); // current typed text
  const [typing, setTyping] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<InternalMessage | null>(
    null
  );
  const [prevMessage, setPrevMessage] = useState<InternalMessage | null>(null);
  const typingTimer = useRef<number | null>(null);
  const resolvePromise = useRef<(() => void) | null>(null);

  // flatten char lists for lookup
  const allCharacters = [...leftCharacters, ...rightCharacters];

  const findCharacterEntry = (
    name: string,
    mode?: string
  ): { entry?: CharacterEntry; side: "left" | "right" | "unknown" } => {
    // try exact match (name + mode) first
    if (mode) {
      const found = allCharacters.find(
        (c) => c.name === name && c.mode === mode
      );
      if (found) {
        const side = leftCharacters.includes(found)
          ? "left"
          : rightCharacters.includes(found)
          ? "right"
          : "unknown";
        return { entry: found, side };
      }
    }
    // fallback to name + default mode (entry with same name and no mode) or first matching name
    let found = allCharacters.find(
      (c) => c.name === name && (!c.mode || c.mode === "default")
    );
    if (!found) {
      found = allCharacters.find((c) => c.name === name);
    }
    if (found) {
      const side = leftCharacters.includes(found)
        ? "left"
        : rightCharacters.includes(found)
        ? "right"
        : "unknown";
      return { entry: found, side };
    }
    return { entry: undefined, side: "unknown" };
  };

  const prepareMessages = (messages: DialogueMessage[]): InternalMessage[] => {
    return messages.map((m) => {
      return {
        ...m,
        resolvedTypeSpeed: m.typeSpeed ?? speed,
        resolvedTextColor: m.textColor ?? "#000000",
        resolvedBgColor: m.bgColor ?? "#ffffff",
      };
    });
  };

  const clearTypingTimer = () => {
    if (typingTimer.current) {
      window.clearInterval(typingTimer.current);
      typingTimer.current = null;
    }
  };

  // core: step to given index
  const startTypingMessage = useCallback(
    (msgs: InternalMessage[], idx: number) => {
      clearTypingTimer();
      const msg = msgs[idx];
      setCurrentMessage(msg);
      setPrevMessage(idx > 0 ? msgs[idx - 1] : null);
      setDisplay("");
      setTyping(true);
      setIsActive(true);

      const full = msg.text;
      let pos = 0;
      const interval = Math.max(1, msg.resolvedTypeSpeed);

      // typing function adds letters one by one
      typingTimer.current = window.setInterval(() => {
        pos += 1;
        setDisplay(full.slice(0, pos));
        if (pos >= full.length) {
          clearTypingTimer();
          setTyping(false);
        }
      }, interval);
    },
    []
  );

  // click/keyboard to advance
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!isActive || !activeMessages) return;
      e.preventDefault();
      // if currently typing -> finish instantly
      if (typing && currentMessage) {
        clearTypingTimer();
        setDisplay(currentMessage.text);
        setTyping(false);
        return;
      }
      // else move to next message or end
      const nextIndex = index + 1;
      if (nextIndex < activeMessages.length) {
        setIndex(nextIndex);
        startTypingMessage(activeMessages, nextIndex);
        return;
      }
      // finished
      setActiveMessages(null);
      setIndex(0);
      setCurrentMessage(null);
      setPrevMessage(null);
      setDisplay("");
      setTyping(false);
      setIsActive(false);
      if (onFinished) onFinished();
      if (resolvePromise.current) {
        resolvePromise.current();
        resolvePromise.current = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        if (!isActive || !activeMessages) return;
        e.preventDefault();

        // if currently typing -> finish instantly
        if (typing && currentMessage) {
          clearTypingTimer();
          setDisplay(currentMessage.text);
          setTyping(false);
          return;
        }

        // else move to next message or end
        const nextIndex = index + 1;
        if (nextIndex < activeMessages.length) {
          setIndex(nextIndex);
          startTypingMessage(activeMessages, nextIndex);
          return;
        }

        // finished
        setActiveMessages(null);
        setIndex(0);
        setCurrentMessage(null);
        setPrevMessage(null);
        setDisplay("");
        setTyping(false);
        setIsActive(false);
        if (onFinished) onFinished();
        if (resolvePromise.current) {
          resolvePromise.current();
          resolvePromise.current = null;
        }
      }
    };

    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("keydown", onKey);
    };
  }, [
    isActive,
    typing,
    currentMessage,
    index,
    activeMessages,
    startTypingMessage,
    onFinished,
  ]);

  // When index or activeMessages change update current message typing
  useEffect(() => {
    if (!activeMessages) return;
    if (index >= 0 && index < activeMessages.length) {
      startTypingMessage(activeMessages, index);
    }
    // cleanup on unmount of dialogue
    return () => clearTypingTimer();
  }, [activeMessages, index, startTypingMessage]);

  // the provided function
  const dialogue = useCallback(
    (messages: DialogueMessage[]) => {
      if (!messages || messages.length === 0) return Promise.resolve();

      // map and validate characters
      const prepared = prepareMessages(messages);
      setActiveMessages(prepared);
      setIndex(0);
      setIsActive(true);

      // return a promise resolved when finished
      return new Promise<void>((res) => {
        resolvePromise.current = res;
      });
    },
    [speed]
  );

  // helper: resolve character UI props for the currently shown message
  const resolveCurrentCharacter = (msg: InternalMessage | null) => {
    if (!msg)
      return {
        name: "",
        src: "",
        side: "left",
        resolvedMode: msg?.mode ?? "default",
      };
    const { entry, side } = findCharacterEntry(msg.charecter, msg.mode);
    return {
      name: msg.charecter,
      mode: msg.mode ?? entry?.mode ?? "default",
      src: entry?.src ?? "",
      side,
    };
  };

  // UI render of message bubble(s)
  const currentChar = resolveCurrentCharacter(currentMessage);
  const previousChar = resolveCurrentCharacter(prevMessage);

  // decide animation class: if previous message was same character name => consecutive animation
  const isConsecutiveSame =
    currentMessage &&
    prevMessage &&
    currentMessage.charecter === prevMessage.charecter;

  return (
    <DialogueContext.Provider value={{ dialogue, isActive }}>
      {/* when active: keep overlay + blurring outside via portal-style full-screen overlay */}
      {children}
      {isActive && (
        <div className="dialogue-overlay" aria-hidden={!isActive}>
          <div className="dialogue-gradient" />
          <div className="dialogue-container" aria-live="polite">
            {/* Left side */}
            <div
              className={`dialogue-slot left ${
                currentChar.side === "left" ? "visible" : "invisible"
              } ${
                isConsecutiveSame && currentChar.side === "left"
                  ? "consecutive"
                  : ""
              }`}
              data-side="left"
            >
              {/* NOTE: render image first in markup for both sides for deterministic order;
                  CSS will reverse the right side visually. */}
              <div
                className={`character-card ${
                  isConsecutiveSame ? "animate-change" : "animate-in"
                }`}
              >
                {currentChar.src ? (
                  <img
                    src={currentChar.src}
                    alt={currentChar.name}
                    className="character-img"
                  />
                ) : (
                  <div className="character-fallback">
                    {currentChar.name[0]}
                  </div>
                )}
                <div
                  className="bubble"
                  style={{
                    background: currentMessage?.resolvedBgColor ?? "#fff",
                    color: currentMessage?.resolvedTextColor ?? "#000",
                  }}
                >
                  <div className="name">{currentChar.name}</div>
                  <div className={`text ${typing ? "typing" : "done"}`}>
                    {display}
                  </div>
                </div>
              </div>
            </div>

            {/* Right side */}
            <div
              className={`dialogue-slot right ${
                currentChar.side === "right" ? "visible" : "invisible"
              } ${
                isConsecutiveSame && currentChar.side === "right"
                  ? "consecutive"
                  : ""
              }`}
              data-side="right"
            >
              {/* same markup: image first, bubble second. CSS (row-reverse) will place image to the right visually */}
              <div
                className={`character-card ${
                  isConsecutiveSame ? "animate-change" : "animate-in"
                }`}
              >
                {currentChar.src ? (
                  <img
                    src={currentChar.src}
                    alt={currentChar.name}
                    className="character-img"
                  />
                ) : (
                  <div className="character-fallback">
                    {currentChar.name[0]}
                  </div>
                )}
                <div
                  className="bubble"
                  style={{
                    background: currentMessage?.resolvedBgColor ?? "#fff",
                    color: currentMessage?.resolvedTextColor ?? "#000",
                  }}
                >
                  <div className="name">{currentChar.name}</div>
                  <div className={`text ${typing ? "typing" : "done"}`}>
                    {display}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogueContext.Provider>
  );
}
