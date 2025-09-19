import { useCallback, useEffect, useRef, useState } from "react";
import { DialogueContext } from "../context/DialogueContext";
import type { DialogueProviderProps } from "../context/DialogueContext";
import type { DialogueMessage, CharacterEntry } from "../types/dialogue";

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
  mode = "arcade", // new prop, default keeps arcade behaviour
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

  // helper: detect png (comic mode applies full-character only for pngs)
  const isPngSrc = (src?: string) =>
    !!src && src.toLowerCase().endsWith(".png");

  return (
    <DialogueContext.Provider value={{ dialogue, isActive }}>
      {children}
      {isActive && (
        <div
          /* overlay: moved Tailwind classes inline, kept backdrop filter raw via style */
          className={`fixed inset-0 z-[9999] pointer-events-auto flex items-end justify-center ${mode === "comic" ? "comic-mode" : ""}`}
          aria-hidden={!isActive}
          style={{
            backdropFilter: "blur(4px) saturate(95%)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          {/* gradient: adds .comic modifier when comic mode */}
          <div className={`dialogue-gradient ${mode === "comic" ? "comic" : ""}`} />

          {/* container: for comic we use full inset so character PNGs can be large; for arcade we keep bottom anchored */}
          <div
            className={
              mode === "comic"
                ? "absolute inset-0 flex justify-between items-end pointer-events-none z-[10000] w-full"
                : "absolute left-7 right-7 bottom-7 px-0 py-7 flex justify-between items-end pointer-events-none gap-4 z-[10000] w-auto"
            }
            aria-live="polite"
            style={{ maxWidth: "none" }}
          >
            {/* Left slot */}
            <div
              data-side="left"
              className={`w-auto max-w-[48%] flex items-end min-h-[120px] ${
                currentChar.side === "left"
                  ? "opacity-100 pointer-events-auto translate-y-0 transition-all duration-[200ms] ease-[cubic-bezier(.2,.9,.2,1)]"
                  : "opacity-0 pointer-events-none translate-y-4 transition-all duration-[180ms] ease-linear"
              } ${isConsecutiveSame && currentChar.side === "left" ? "consecutive" : ""}`}
            >
              {/* In comic mode: if PNG src available, show a full-character image (object-contain, larger). Otherwise fall back to arcade style. */}
              {mode === "comic" && isPngSrc(currentChar.src) ? (
                <div className={`relative pointer-events-auto ${isConsecutiveSame ? "animate-change" : "animate-in"} flex items-end`}>
                  <img
                    src={currentChar.src}
                    alt={currentChar.name}
                    className="comic-character-img object-contain"
                    style={{
                      maxHeight: "clamp(4rem, 85vh, 18rem)",
                      width: "auto",
                      // visual: leave corners intact (PNG), apply drop shadow to the PNG's opaque pixels
                      filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))",
                    }}
                  />

                  {/* bubble positioned at top-right of image */}
                  <div
                    className="bubble max-w-[45%] px-3 py-2.5 rounded-[14px] absolute"
                    style={{
                      background: currentMessage?.resolvedBgColor ?? "#fff",
                      color: currentMessage?.resolvedTextColor ?? "#000",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                      transformOrigin: "left bottom",
                      fontFamily:
                        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
                      top: "-6rem",
                      right: "1rem",
                      pointerEvents: "auto",
                    }}
                  >
                    <div className="text-[12px] font-bold opacity-90 mb-1.5 text-left name">
                      {currentChar.name}
                    </div>
                    <div className={`text text-[18px] leading-[1.2] whitespace-pre-wrap break-words ${typing ? "typing" : "done"}`}>
                      {display}
                    </div>
                  </div>
                </div>
              ) : (
                /* Arcade-style fallback (unchanged) */
                <div className={`flex items-end gap-2.5 pointer-events-auto ${isConsecutiveSame ? "animate-change" : "animate-in"}`}>
                  {currentChar.src ? (
                    <img
                      src={currentChar.src}
                      alt={currentChar.name}
                      className="character-img w-[92px] h-[92px] object-cover rounded-full"
                    />
                  ) : (
                    <div className="w-[92px] h-[92px] rounded-full inline-flex items-center justify-center font-bold bg-gray-300 character-img">
                      {currentChar.name ? currentChar.name[0] : ""}
                    </div>
                  )}
                  <div
                    className="bubble max-w-[65%] px-3 py-2.5 rounded-[14px]"
                    style={{
                      background: currentMessage?.resolvedBgColor ?? "#fff",
                      color: currentMessage?.resolvedTextColor ?? "#000",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                      transformOrigin: "left bottom",
                      fontFamily:
                        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
                    }}
                  >
                    <div className="text-[12px] font-bold opacity-90 mb-1.5 text-left name">
                      {currentChar.name}
                    </div>
                    <div className={`text text-[18px] leading-[1.2] whitespace-pre-wrap break-words ${typing ? "typing" : "done"}`}>
                      {display}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right slot */}
            <div
              data-side="right"
              className={`w-auto max-w-[48%] flex items-end min-h-[120px] ${
                currentChar.side === "right"
                  ? "opacity-100 pointer-events-auto translate-y-0 transition-all duration-[200ms] ease-[cubic-bezier(.2,.9,.2,1)]"
                  : "opacity-0 pointer-events-none translate-y-4 transition-all duration-[180ms] ease-linear"
              } ${isConsecutiveSame && currentChar.side === "right" ? "consecutive" : ""}`}
            >
              {mode === "comic" && isPngSrc(currentChar.src) ? (
                <div className={`relative pointer-events-auto ${isConsecutiveSame ? "animate-change" : "animate-in"} flex items-end`}>
                  <img
                    src={currentChar.src}
                    alt={currentChar.name}
                    className="comic-character-img object-contain"
                    style={{
                      maxHeight: "clamp(4rem, 85vh, 25rem)",
                      width: "auto",
                      filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))",
                    }}
                  />

                  {/* bubble positioned at top-left of image */}
                  <div
                    className="bubble max-w-[45%] px-3 py-2.5 rounded-[14px] absolute"
                    style={{
                      background: currentMessage?.resolvedBgColor ?? "#fff",
                      color: currentMessage?.resolvedTextColor ?? "#000",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                      transformOrigin: "right bottom",
                      fontFamily:
                        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
                      top: "-6rem",
                      left: "1rem",
                      pointerEvents: "auto",
                      textAlign: "right",
                    }}
                  >
                    <div className="text-[12px] font-bold opacity-90 mb-1.5 text-right name">
                      {currentChar.name}
                    </div>
                    <div className={`text text-[18px] leading-[1.2] whitespace-pre-wrap break-words ${typing ? "typing" : "done"}`}>
                      {display}
                    </div>
                  </div>
                </div>
              ) : (
                /* Arcade-style fallback (unchanged) */
                <div className={`flex items-end gap-2.5 pointer-events-auto flex-row-reverse ${isConsecutiveSame ? "animate-change" : "animate-in"}`}>
                  {currentChar.src ? (
                    <img
                      src={currentChar.src}
                      alt={currentChar.name}
                      className="character-img w-[92px] h-[92px] object-cover rounded-full"
                    />
                  ) : (
                    <div className="w-[92px] h-[92px] rounded-full inline-flex items-center justify-center font-bold bg-gray-300 character-img">
                      {currentChar.name ? currentChar.name[0] : ""}
                    </div>
                  )}
                  <div
                    className="bubble max-w-[65%] px-3 py-2.5 rounded-[14px] text-right"
                    style={{
                      background: currentMessage?.resolvedBgColor ?? "#fff",
                      color: currentMessage?.resolvedTextColor ?? "#000",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                      transformOrigin: "right bottom",
                      fontFamily:
                        'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
                    }}
                  >
                    <div className="text-[12px] font-bold opacity-90 mb-1.5 text-right name">
                      {currentChar.name}
                    </div>
                    <div className={`text text-[18px] leading-[1.2] whitespace-pre-wrap break-words ${typing ? "typing" : "done"}`}>
                      {display}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogueContext.Provider>
  );
}
