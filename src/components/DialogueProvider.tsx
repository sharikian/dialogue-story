import { useCallback, useEffect, useRef, useState } from "react";
import { DialogueContext } from "../context/DialogueContext";
import type { DialogueProviderProps } from "../context/DialogueContext";
import type { DialogueMessage, CharacterEntry } from "../types/dialogue";

type InternalMessage = DialogueMessage & {
  resolvedTypeSpeed: number;
  resolvedTextColor: string;
  resolvedBgColor: string;
};

type PinnedMap = {
  left?: InternalMessage;
  right?: InternalMessage;
};

export function DialogueProvider({
  children,
  leftCharacters,
  rightCharacters,
  speed = 35,
  onFinished,
  mode = "arcade", // new prop, default keeps arcade behaviour
  rtl = false, // new prop, default false
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
  const [pinned, setPinned] = useState<PinnedMap>({}); // store messages that should persist until next same-side message
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

      // NEW: when starting a message, clear any pinned message for the SAME SIDE.
      // This enforces: pinned (showTimes) remains visible only until the next message from the same side appears.
      const { side: startingSide } = findCharacterEntry(msg.charecter, msg.mode);
      if (startingSide === "left" || startingSide === "right") {
        setPinned((p) => {
          if (!p) return p;
          // if pinned exists for this side, remove it
          if (startingSide === "left" && p.left) {
            const np = { ...p };
            delete np.left;
            return np;
          }
          if (startingSide === "right" && p.right) {
            const np = { ...p };
            delete np.right;
            return np;
          }
          return p;
        });
      }

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

  // helper: pin message if it has showTimes true
  const pinIfNeeded = (msg: InternalMessage | null) => {
    if (!msg) return;
    if (!msg.showTimes) return;
    const { side } = findCharacterEntry(msg.charecter, msg.mode);
    if (side === "left") {
      setPinned((p) => ({ ...p, left: { ...msg } }));
    } else if (side === "right") {
      setPinned((p) => ({ ...p, right: { ...msg } }));
    }
  };

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
      // before advancing, if current has showTimes, pin it (it will stay until next same-side message)
      pinIfNeeded(currentMessage);

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
      setPinned({}); // clear pinned on finish
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
        // before advancing, if current has showTimes, pin it (it will stay until next same-side message)
        pinIfNeeded(currentMessage);

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
        setPinned({}); // clear pinned on finish
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

  // the provided function (start a dialogue)
  const dialogue = useCallback(
    (messages: DialogueMessage[]) => {
      if (!messages || messages.length === 0) return Promise.resolve();

      // map and validate characters
      const prepared = prepareMessages(messages);
      setActiveMessages(prepared);
      setIndex(0);
      setIsActive(true);
      setPinned({}); // clear any previous pinned messages when starting a new dialogue

      // return a promise resolved when finished
      return new Promise<void>((res) => {
        resolvePromise.current = res;
      });
    },
    [speed]
  );

  // helper: resolve character UI props for the given message
  const resolveCurrentCharacter = (msg: InternalMessage | null) => {
    if (!msg)
      return {
        name: "",
        src: "",
        side: "left",
        resolvedMode: "default",
      };
    const { entry, side } = findCharacterEntry(msg.charecter, msg.mode);
    return {
      name: msg.charecter,
      mode: msg.mode ?? entry?.mode ?? "default",
      src: entry?.src ?? "",
      side,
    };
  };

  // helper: detect png (comic mode applies full-character only for pngs)
  const isPngSrc = (src?: string) =>
    !!src && src.toLowerCase().endsWith(".png");

  // UI render helper: render a "card" (avatar / bubble) for a message
  const renderCharacterCard = (
    msg: InternalMessage,
    options: {
      forSide: "left" | "right";
      isPinned?: boolean;
      animate?: boolean;
      comic?: boolean;
    }
  ) => {
    const resolved = resolveCurrentCharacter(msg);

    // compute effective alignment depending on rtl flag.
    // NOTE: we do NOT move the character avatar positions — only the bubble/text/name alignment and bubble offset.
    const effectiveTextAlignClass = (() => {
      // in LTR: left -> text-left, right -> text-right
      // in RTL: left -> text-right, right -> text-left (flip only message/name alignment)
      if (!rtl) return options.forSide === "left" ? "text-left" : "text-right";
      return options.forSide === "left" ? "text-right" : "text-left";
    })();

    const transformOrigin = (() => {
      // mirror transform origin for bubble animations when rtl is true
      if (!rtl) return options.forSide === "left" ? "left bottom" : "right bottom";
      return options.forSide === "left" ? "right bottom" : "left bottom";
    })();

    const animateClass = options.animate ? (isConsecutiveSame ? "animate-change" : "animate-in") : "";
    const isComic = options.comic ?? mode === "comic";

    // If comic and PNG available -> show full image + bubble positioned accordingly
    if (isComic && isPngSrc(resolved.src)) {
      // For LTR:
      //  - left side bubble uses `right: X` (bubble positioned inward toward center)
      //  - right side bubble uses `left: X`
      // For RTL we invert those bubble offsets so the bubble still points inward but text alignment flips.
      const posOffset =
        options.forSide === "left"
          ? rtl
            ? { left: options.isPinned ? "1rem" : "1rem" }
            : { right: options.isPinned ? "1rem" : "1rem" }
          : rtl
          ? { right: options.isPinned ? "1rem" : "1rem" }
          : { left: options.isPinned ? "1rem" : "1rem" };

      const bubbleStyle: React.CSSProperties =
        {
          background: msg.resolvedBgColor ?? "#fff",
          color: msg.resolvedTextColor ?? "#000",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          transformOrigin,
          fontFamily: rtl
            ? '"Vazirmatn", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
            : 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
          top: options.isPinned ? "-5.5rem" : "-6rem",
          pointerEvents: options.isPinned ? "none" : "auto",
          ...posOffset,
          // ensure RTL mode doesn't unexpectedly flip text direction of bubble contents:
          direction: rtl ? "rtl" : "ltr",
        };

      return (
        <div
          key={`${msg.charecter}-${options.isPinned ? "pinned" : "cur"}`}
          className={`relative pointer-events-${options.isPinned ? "none" : "auto"} ${animateClass} flex items-end`}
        >
          <img
            src={resolved.src}
            alt={resolved.name}
            className="comic-character-img object-contain"
            style={{
              maxHeight: options.isPinned ? "clamp(4rem, 70vh, 25rem)" : "clamp(4rem, 85vh, 25rem)",
              width: "auto",
              filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))",
            }}
          />

          <div
            className="bubble max-w-[45%] px-3 py-2.5 rounded-[14px] absolute"
            style={bubbleStyle}
            aria-hidden={options.isPinned ? "false" : "false"}
          >
            <div className={`text-[12px] font-bold opacity-90 mb-1.5 ${effectiveTextAlignClass} name`}>
              {resolved.name}
            </div>
            <div className={`text ${options.isPinned ? "" : typing ? "typing" : "done"} text-[18px] leading-[1.2] whitespace-pre-wrap break-words`}>
              {/* For pinned show full message (no typing), for current allow typing via `display` state */}
              {options.isPinned ? msg.text : display}
            </div>
          </div>
        </div>
      );
    }

    // Arcade / fallback: circular avatar + bubble
    const arcadeTransformOrigin = rtl
      ? options.forSide === "left"
        ? "right bottom"
        : "left bottom"
      : options.forSide === "left"
      ? "left bottom"
      : "right bottom";

    return (
      <div
        key={`${msg.charecter}-${options.isPinned ? "pinned" : "cur"}`}
        className={`flex items-end gap-2.5 pointer-events-${options.isPinned ? "none" : "auto"} ${animateClass}`}
      >
        {resolved.src ? (
          <img
            src={resolved.src}
            alt={resolved.name}
            className="character-img w-[92px] h-[92px] object-cover rounded-full"
          />
        ) : (
          <div className="w-[92px] h-[92px] rounded-full inline-flex items-center justify-center font-bold bg-gray-300 character-img">
            {resolved.name ? resolved.name[0] : ""}
          </div>
        )}

        <div
          className="bubble max-w-[65%] px-3 py-2.5 rounded-[14px]"
          style={{
            background: msg.resolvedBgColor ?? "#fff",
            color: msg.resolvedTextColor ?? "#000",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            transformOrigin: arcadeTransformOrigin,
            fontFamily: rtl
              ? '"Vazirmatn", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
              : 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
            pointerEvents: options.isPinned ? "none" : "auto",
            direction: rtl ? "rtl" : "ltr",
          }}
        >
          <div className={`${effectiveTextAlignClass} text-[12px] font-bold opacity-90 mb-1.5 name`}>
            {resolved.name}
          </div>
          <div className={`text ${options.isPinned ? "" : typing ? "typing" : "done"} text-[18px] leading-[1.2] whitespace-pre-wrap break-words`}>
            {options.isPinned ? msg.text : display}
          </div>
        </div>
      </div>
    );
  };

  // UI render of message bubble(s)
  const currentChar = resolveCurrentCharacter(currentMessage);
  // const previousChar = resolveCurrentCharacter(prevMessage);

  // decide animation class: if previous message was same character name => consecutive animation
  const isConsecutiveSame =
    currentMessage &&
    prevMessage &&
    currentMessage.charecter === prevMessage.charecter;

  // prepare pinned/current render items for each side
  const leftPinned = pinned.left ?? null;
  const rightPinned = pinned.right ?? null;
  const leftCurrent = currentChar.side === "left" && currentMessage ? currentMessage : null;
  const rightCurrent = currentChar.side === "right" && currentMessage ? currentMessage : null;

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
            {/* Left slot: may render pinned (older) + current (typing) */}
            <div
              data-side="left"
              className={`w-auto max-w-[48%] flex flex-col items-end min-h-[120px] ${
                (leftPinned || leftCurrent)
                  ? "opacity-100 pointer-events-auto translate-y-0 transition-all duration-[200ms] ease-[cubic-bezier(.2,.9,.2,1)]"
                  : "opacity-0 pointer-events-none translate-y-4 transition-all duration-[180ms] ease-linear"
              } ${isConsecutiveSame && currentChar.side === "left" ? "consecutive" : ""}`}
            >
              {/* pinned left (if exists) - show first so current (typing) renders after */}
              {leftPinned ? renderCharacterCard(leftPinned, { forSide: "left", isPinned: true, animate: false, comic: mode === "comic" }) : null}

              {/* current left (typing) */}
              {leftCurrent ? renderCharacterCard(leftCurrent, { forSide: "left", isPinned: false, animate: true, comic: mode === "comic" }) : null}
            </div>

            {/* Right slot: may render pinned (older) + current (typing) */}
            <div
              data-side="right"
              className={`w-auto max-w-[48%] flex flex-col items-start min-h-[120px] ${
                (rightPinned || rightCurrent)
                  ? "opacity-100 pointer-events-auto translate-y-0 transition-all duration-[200ms] ease-[cubic-bezier(.2,.9,.2,1)]"
                  : "opacity-0 pointer-events-none translate-y-4 transition-all duration-[180ms] ease-linear"
              } ${isConsecutiveSame && currentChar.side === "right" ? "consecutive" : ""}`}
            >
              {/* pinned right */}
              {rightPinned ? renderCharacterCard(rightPinned, { forSide: "right", isPinned: true, animate: false, comic: mode === "comic" }) : null}

              {/* current right (typing) */}
              {rightCurrent ? renderCharacterCard(rightCurrent, { forSide: "right", isPinned: false, animate: true, comic: mode === "comic" }) : null}
            </div>
          </div>
        </div>
      )}
    </DialogueContext.Provider>
  );
}
