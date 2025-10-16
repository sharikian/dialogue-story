// src/components/DialogueProvider.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DialogueContext } from "../context/DialogueContext";
import type { DialogueProviderProps } from "../context/DialogueContext";
import type {
  DialogueMessage,
  CharacterEntry,
  BackgroundFilter,
} from "../types/dialogue";

const DEFAULT_BG_FILTER: Readonly<BackgroundFilter> = Object.freeze({
  fade: 0,
  blur: 0,
});

type InternalMessage = DialogueMessage & {
  resolvedTypeSpeed: number;
  resolvedTextColor: string;
  resolvedBgColor: string;
  resolvedFontSize?: number | string;
  resolvedFontWeight?: number | string;
};

type PinnedMap = {
  left?: InternalMessage;
  right?: InternalMessage;
  top?: InternalMessage;
};

const modeFromFilename = (filename: string) => {
  const name = filename.replace(/\.[^.]+$/, "");
  if (name.toLowerCase() === "default") return undefined;
  return name;
};

type CharactersManifest = {
  characters: Record<string, string[]>;
};

const parseCharacterKey = (raw: string): { name: string; forcedSide?: "left" | "right" } => {
  if (!raw) return { name: raw, forcedSide: undefined };
  const parts = raw.split(":").map((p) => p.trim());
  const base = parts[0] ?? raw;
  if (parts.length > 1) {
    const suffix = parts[1]?.toLowerCase();
    if (suffix === "right") return { name: base, forcedSide: "right" };
    return { name: base, forcedSide: "left" };
  }
  return { name: base, forcedSide: undefined };
};

/**
 * Small helper to turn a character/name into an id-safe string
 * e.g. "Eddy (angry)" -> "eddy-angry"
 */
const idSafe = (s?: string) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export function DialogueProvider({
  children,
  leftCharacters: propLeftCharacters = [],
  rightCharacters: propRightCharacters = [],
  charectersPath,
  speed = 35,
  onFinished,
  mode = "arcade",
  rtl = false,
  bgImage: providerBgImage,
  bgFilter: providerBgFilter = DEFAULT_BG_FILTER,
  activeRedo = false,
  canSkip = false,
  skipMessage = "Skip"
}: DialogueProviderProps) {
  const [activeMessages, setActiveMessages] = useState<InternalMessage[] | null>(null);
  const [index, setIndex] = useState(0);
  const [display, setDisplay] = useState("");
  const [typing, setTyping] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<InternalMessage | null>(null);
  const [prevMessage, setPrevMessage] = useState<InternalMessage | null>(null);
  const [pinned, setPinned] = useState<PinnedMap>({});
  const typingTimer = useRef<number | null>(null);
  const resolvePromise = useRef<(() => void) | null>(null);

  const [currentBg, setCurrentBg] = useState<string | null>(providerBgImage ?? null);
  const [currentBgFilter, setCurrentBgFilter] = useState<BackgroundFilter | null>(providerBgFilter ?? DEFAULT_BG_FILTER);
  const [prevBg, setPrevBg] = useState<string | null>(null);
  const [prevBgFilter, setPrevBgFilter] = useState<BackgroundFilter | null>(null);
  const [prevVisible, setPrevVisible] = useState(false);
  const bgFadeTimeout = useRef<number | null>(null);
  const BG_FADE_DURATION = 420;

  const [runtimeLeftCharacters, setRuntimeLeftCharacters] = useState<CharacterEntry[] | null>(null);
  const [runtimeRightCharacters, setRuntimeRightCharacters] = useState<CharacterEntry[] | null>(null);
  const loaderInFlight = useRef(false);

  useEffect(() => {
    if (!charectersPath) {
      setRuntimeLeftCharacters(null);
      setRuntimeRightCharacters(null);
      return;
    }
    if (loaderInFlight.current) return;
    loaderInFlight.current = true;

    const tryLoad = async () => {
      const tryUrls = [
        `${charectersPath.replace(/\/$/, "")}/index.json`,
        `${charectersPath.replace(/\/$/, "")}/manifest.json`,
      ];

      let manifest: CharactersManifest | null = null;
      for (const url of tryUrls) {
        try {
          const res = await fetch(url, { cache: "no-cache" });
          if (!res.ok) continue;
          const json = (await res.json()) as CharactersManifest;
          if (json && typeof json === "object" && json.characters) {
            manifest = json;
            break;
          }
        } catch (err) {
          // continue
        }
      }

      if (!manifest) {
        // eslint-disable-next-line no-console
        console.warn(
          `DialogueProvider: failed to load manifest at ${charectersPath}/index.json or manifest.json — falling back to provided left/right character props.`
        );
        loaderInFlight.current = false;
        setRuntimeLeftCharacters(null);
        setRuntimeRightCharacters(null);
        return;
      }

      const left: CharacterEntry[] = [];
      const right: CharacterEntry[] = [];
      const basePath = charectersPath.replace(/\/$/, "");
      Object.entries(manifest.characters).forEach(([charName, files]) => {
        const uniqueFiles = Array.from(new Set(files));
        uniqueFiles.forEach((filename) => {
          const mode = modeFromFilename(filename);
          const src = `${basePath}/${encodeURIComponent(charName)}/${encodeURIComponent(filename)}`;
          left.push({ name: charName, mode, src });
          right.push({ name: charName, mode, src });
        });

        const hasDefault = uniqueFiles.some((f) => /^default\.[^.]+$/i.test(f));
        if (!hasDefault && uniqueFiles.length > 0) {
          const first = uniqueFiles[0];
          left.push({ name: charName, mode: undefined, src: `${basePath}/${encodeURIComponent(charName)}/${encodeURIComponent(first)}` });
          right.push({ name: charName, mode: undefined, src: `${basePath}/${encodeURIComponent(charName)}/${encodeURIComponent(first)}` });
        }
      });

      setRuntimeLeftCharacters(left);
      setRuntimeRightCharacters(right);
      loaderInFlight.current = false;
    };

    tryLoad().catch(() => {
      loaderInFlight.current = false;
      // eslint-disable-next-line no-console
      console.warn("DialogueProvider: failed to auto-load characters manifest (unexpected).");
      setRuntimeLeftCharacters(null);
      setRuntimeRightCharacters(null);
    });
  }, [charectersPath]);

  const leftChars = runtimeLeftCharacters ?? propLeftCharacters;
  const rightChars = runtimeRightCharacters ?? propRightCharacters;

  const prepareMessages = (messages: DialogueMessage[]): InternalMessage[] =>
    messages.map((m) => ({
      ...m,
      resolvedTypeSpeed: m.typeSpeed ?? speed,
      resolvedTextColor: m.textColor ?? "#000000",
      resolvedBgColor: m.bgColor ?? "#ffffff",
      resolvedFontSize: m.fontSize,
      resolvedFontWeight: m.fontWeight,
    }));

  const clearTypingTimer = () => {
    if (typingTimer.current) {
      window.clearInterval(typingTimer.current);
      typingTimer.current = null;
    }
  };

  const clearBgFadeTimeout = () => {
    if (bgFadeTimeout.current) {
      window.clearTimeout(bgFadeTimeout.current);
      bgFadeTimeout.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTypingTimer();
      clearBgFadeTimeout();
    };
  }, []);

  const updateBackgroundForMessage = useCallback(
    (newBg?: string | null, filter?: BackgroundFilter | null) => {
      if (typeof newBg === "undefined") return;
      const targetFilter: BackgroundFilter | null = filter ?? providerBgFilter ?? DEFAULT_BG_FILTER;

      setCurrentBg((prevCur) => {
        const sameUrl = prevCur === newBg;
        const sameFilter =
          JSON.stringify(currentBgFilter ?? {}) === JSON.stringify(targetFilter ?? {});
        if (sameUrl && sameFilter) return prevCur;

        if (prevCur) {
          clearBgFadeTimeout();
          setPrevBg(prevCur);
          setPrevBgFilter(currentBgFilter ?? null);
          setPrevVisible(true);
          requestAnimationFrame(() => setPrevVisible(false));
          bgFadeTimeout.current = window.setTimeout(() => {
            setPrevBg(null);
            setPrevBgFilter(null);
            setPrevVisible(false);
            bgFadeTimeout.current = null;
          }, BG_FADE_DURATION + 30);
        }

        setCurrentBgFilter(targetFilter);
        return newBg;
      });
    },
    [providerBgFilter, currentBgFilter]
  );

  const findCharacterEntryByName = (name: string, mode?: string) => {
    const searchIn = (arr?: CharacterEntry[]) => {
      if (!arr) return undefined;
      if (mode) {
        const exact = arr.find((c) => c.name === name && c.mode === mode);
        if (exact) return exact;
      }
      let found = arr.find((c) => c.name === name && (!c.mode || c.mode === "default"));
      if (found) return found;
      found = arr.find((c) => c.name === name);
      return found;
    };

    const leftFound = searchIn(leftChars);
    if (leftFound) return { entry: leftFound, foundOn: "left" as const };
    const rightFound = searchIn(rightChars);
    if (rightFound) return { entry: rightFound, foundOn: "right" as const };
    return { entry: undefined, foundOn: undefined };
  };

  const startTypingMessage = useCallback(
    (msgs: InternalMessage[], idx: number) => {
      clearTypingTimer();
      const msg = msgs[idx];

      updateBackgroundForMessage(msg.bgImage, msg.filter ?? null);

      const parsed = parseCharacterKey(msg.charecter);

      // If starting a new ravi message, clear any previously pinned top narrator,
      // so the old pinned box doesn't remain alongside the new current ravi.
      if (parsed.name && parsed.name.toLowerCase() === "ravi") {
        setPinned((p) => {
          const np = { ...p };
          if (np.top) delete np.top;
          return np;
        });
      }

      const { foundOn } = findCharacterEntryByName(parsed.name, msg.mode);

      const startingSide = (msg.forcedSide ?? parsed.forcedSide) ?? foundOn ?? "left";

      if (startingSide === "left" || startingSide === "right") {
        setPinned((p) => {
          if (!p) return p;
          const np = { ...p };
          if (startingSide === "left" && np.left) delete np.left;
          if (startingSide === "right" && np.right) delete np.right;
          return np;
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

      typingTimer.current = window.setInterval(() => {
        pos += 1;
        setDisplay(full.slice(0, pos));
        if (pos >= full.length) {
          clearTypingTimer();
          setTyping(false);
        }
      }, interval);
    },
    [updateBackgroundForMessage, leftChars, rightChars]
  );

  const pinIfNeeded = (msg: InternalMessage | null) => {
    if (!msg) return;
    if (!msg.showTimes) return;

    const parsed = parseCharacterKey(msg.charecter);
    if (parsed.name && parsed.name.toLowerCase() === "ravi") {
      setPinned((p) => ({ ...p, top: { ...msg } }));
      return;
    }

    const { foundOn } = findCharacterEntryByName(parsed.name, msg.mode);
    const side = (msg.forcedSide ?? parsed.forcedSide) ?? foundOn ?? "left";
    if (side === "left") setPinned((p) => ({ ...p, left: { ...msg } }));
    if (side === "right") setPinned((p) => ({ ...p, right: { ...msg } }));
  };

  const finishDialogueImmediately = useCallback(() => {
    clearTypingTimer();
    clearBgFadeTimeout();

    setActiveMessages(null);
    setIndex(0);
    setCurrentMessage(null);
    setPrevMessage(null);
    setDisplay("");
    setTyping(false);
    setIsActive(false);
    setPinned({});
    setCurrentBg(providerBgImage ?? null);
    setCurrentBgFilter(providerBgFilter ?? DEFAULT_BG_FILTER);
    setPrevBg(null);
    setPrevBgFilter(null);
    setPrevVisible(false);

    if (onFinished) onFinished();
    if (resolvePromise.current) {
      resolvePromise.current();
      resolvePromise.current = null;
    }
  }, [onFinished, providerBgFilter, providerBgImage]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!isActive || !activeMessages) return;
      e.preventDefault();

      if (typing && currentMessage) {
        clearTypingTimer();
        setDisplay(currentMessage.text);
        setTyping(false);
        return;
      }

      // If activeRedo is enabled, interpret click position:
      // left half => go back, right half => go forward.
      if (activeRedo) {
        const mx = e.clientX;
        const w = window.innerWidth || document.documentElement.clientWidth || 0;
        const isLeftHalf = mx < w / 2;

        if (isLeftHalf) {
          // go back one
          const prevIndex = Math.max(0, index - 1);
          if (prevIndex !== index && activeMessages && prevIndex < activeMessages.length) {
            setIndex(prevIndex);
            startTypingMessage(activeMessages, prevIndex);
          }
          return;
        }

        // right half: forward (preserve pin behaviour)
        const nextIndex = index + 1;
        pinIfNeeded(currentMessage);

        if (nextIndex < activeMessages.length) {
          setIndex(nextIndex);
          startTypingMessage(activeMessages, nextIndex);
          return;
        }

        // finished
        finishDialogueImmediately();
        return;
      }

      // default behavior (activeRedo === false)
      const nextIndex = index + 1;
      pinIfNeeded(currentMessage);

      if (nextIndex < activeMessages.length) {
        setIndex(nextIndex);
        startTypingMessage(activeMessages, nextIndex);
        return;
      }

      // finished
      finishDialogueImmediately();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        if (!isActive || !activeMessages) return;
        e.preventDefault();

        if (typing && currentMessage) {
          clearTypingTimer();
          setDisplay(currentMessage.text);
          setTyping(false);
          return;
        }

        const nextIndex = index + 1;
        pinIfNeeded(currentMessage);

        if (nextIndex < activeMessages.length) {
          setIndex(nextIndex);
          startTypingMessage(activeMessages, nextIndex);
          return;
        }

        finishDialogueImmediately();
      }

      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && activeRedo) {
        // optional keyboard support for activeRedo: left = back, right = forward
        e.preventDefault();
        if (e.key === "ArrowLeft") {
          const prevIndex = Math.max(0, index - 1);
          if (prevIndex !== index && activeMessages && prevIndex < activeMessages.length) {
            setIndex(prevIndex);
            startTypingMessage(activeMessages, prevIndex);
          }
          return;
        }
        if (e.key === "ArrowRight") {
          const nextIndex = index + 1;
          pinIfNeeded(currentMessage);
          if (activeMessages) {
            if (nextIndex < activeMessages.length) {
              setIndex(nextIndex);
              startTypingMessage(activeMessages, nextIndex);
              return;
            }
          }
          finishDialogueImmediately();
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
    providerBgImage,
    providerBgFilter,
    activeRedo,
    finishDialogueImmediately,
  ]);

  useEffect(() => {
    if (!activeMessages) return;
    if (index >= 0 && index < activeMessages.length) startTypingMessage(activeMessages, index);
    return () => clearTypingTimer();
  }, [activeMessages, index, startTypingMessage]);

  const dialogue = useCallback(
    (messages: DialogueMessage[]) => {
      if (!messages || messages.length === 0) return Promise.resolve();
      const prepared = prepareMessages(messages);

      setCurrentBg(providerBgImage ?? null);
      setCurrentBgFilter(providerBgFilter ?? DEFAULT_BG_FILTER);
      setPrevBg(null);
      setPrevBgFilter(null);
      setPrevVisible(false);

      setActiveMessages(prepared);
      setIndex(0);
      setIsActive(true);
      setPinned({});

      return new Promise<void>((res) => {
        resolvePromise.current = res;
      });
    },
    [speed, providerBgImage, providerBgFilter]
  );

  const resolveCurrentCharacter = (msg: InternalMessage | null) => {
    if (!msg) return { name: "", src: "", side: "left" as "left" | "right", resolvedMode: "default" };
    const parsed = parseCharacterKey(msg.charecter);
    const { entry, foundOn } = findCharacterEntryByName(parsed.name, msg.mode);
    const finalSide = (msg.forcedSide ?? parsed.forcedSide) ?? foundOn ?? "left";
    return { name: parsed.name, mode: msg.mode ?? entry?.mode ?? "default", src: entry?.src ?? "", side: finalSide };
  };

  const isPngSrc = (src?: string) => !!src && src.toLowerCase().endsWith(".png");

  const normalizeFontSize = (fs?: number | string) => {
    if (fs === undefined) return undefined;
    return typeof fs === "number" ? `${fs}px` : fs;
  };

  const renderCharacterCard = (
    msg: InternalMessage,
    options: { forSide: "left" | "right"; isPinned?: boolean; animate?: boolean; comic?: boolean }
  ) => {
    const resolved = resolveCurrentCharacter(msg);

    const effectiveTextAlignClass = (() => {
      if (!rtl) return options.forSide === "left" ? "text-left" : "text-right";
      return options.forSide === "left" ? "text-right" : "text-left";
    })();

    const transformOrigin = (() => {
      if (!rtl) return options.forSide === "left" ? "left bottom" : "right bottom";
      return options.forSide === "left" ? "right bottom" : "left bottom";
    })();

    const isConsecutiveSame =
      currentMessage && prevMessage && currentMessage.charecter === prevMessage.charecter;

    const animateClass = options.animate ? (isConsecutiveSame ? "animate-change" : "animate-in") : "";
    const isComic = options.comic ?? mode === "comic";

    const textInlineStyle: React.CSSProperties = {
      fontSize: normalizeFontSize(msg.resolvedFontSize),
      fontWeight: msg.resolvedFontWeight as React.CSSProperties["fontWeight"] | undefined,
      color: msg.resolvedTextColor ?? undefined,
    };

    // Provide sanitized id-friendly name for id attributes:
    const safeName = idSafe(resolved.name || msg.charecter);

    // Compose base id fragments
    const state = options.isPinned ? "pinned" : "current";
    const side = options.forSide;

    // Comic mode with PNG (full character)
    if (isComic && isPngSrc(resolved.src)) {
      const posOffset =
        options.forSide === "left"
          ? rtl
            ? { left: options.isPinned ? "1rem" : "1rem" }
            : { right: options.isPinned ? "1rem" : "1rem" }
          : rtl
          ? { right: options.isPinned ? "1rem" : "1rem" }
          : { left: options.isPinned ? "1rem" : "1rem" };

      const bubbleStyle: React.CSSProperties = {
        background: msg.resolvedBgColor ?? "#fff",
        color: msg.resolvedTextColor ?? "#000",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        transformOrigin,
        fontFamily: rtl
          ? '"Vazirmatn", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
          : 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        bottom: options.isPinned ? "calc(100% + 0.75rem)" : "calc(100% + 1rem)",
        pointerEvents: options.isPinned ? "none" : "auto",
        ...posOffset,
        direction: rtl ? "rtl" : "ltr",
        maxHeight: "50vh",
        overflowY: "auto",
        boxSizing: "border-box",
        paddingRight: "8px",
        WebkitOverflowScrolling: "touch",
        maxWidth: "100%",
      };

      const imgStyle: React.CSSProperties = {
        maxHeight: options.isPinned ? "clamp(4rem, 70vh, 25rem)" : "clamp(4rem, 85vh, 25rem)",
        width: "auto",
        filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.5))",
        transform: options.forSide === "right" ? "scaleX(-1)" : undefined,
      };

      return (
        <div
          key={`${msg.charecter}-${options.isPinned ? "pinned" : "cur"}`}
          className={`relative pointer-events-${options.isPinned ? "none" : "auto"} ${animateClass} flex items-end`}
        >
          <img src={resolved.src} alt={resolved.name} className="comic-character-img object-contain" style={imgStyle} />

          <div
            className="bubble px-3 py-2.5 rounded-[14px] absolute"
            style={bubbleStyle}
            // bubble-level id for testing if needed
            id={`dial-bubble-${side}-${state}-${safeName}`}
          >
            <div
              className={`text-[14px] font-bold opacity-90 mb-1.5 ${effectiveTextAlignClass} name`}
              id={`dial-charecter-title-${side}-${state}-${safeName}`}
            >
              {resolved.name}
            </div>
            <div
              className={`text ${options.isPinned ? "" : typing ? "typing" : "done"} text-[20px] leading-[1.2] whitespace-pre-wrap break-words`}
              style={textInlineStyle}
              id={`dial-charecter-text-${side}-${state}-${safeName}`}
            >
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
        id={`dial-char-wrapper-${side}-${state}-${safeName}`}
      >
        {resolved.src ? (
          <img
            src={resolved.src}
            alt={resolved.name}
            className="character-img object-cover rounded-full"
            style={isPngSrc(resolved.src) && options.forSide === "right" ? { transform: "scaleX(-1)" } : undefined}
            id={`dial-charecter-avatar-${side}-${state}-${safeName}`}
          />
        ) : (
          <div
            className="character-img inline-flex items-center justify-center font-bold bg-gray-300"
            id={`dial-charecter-avatar-${side}-${state}-${safeName}`}
          >
            {resolved.name ? resolved.name[0] : ""}
          </div>
        )}

        <div
          className="bubble px-3 py-2.5 rounded-[14px]"
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
            maxHeight: "40vh",
            overflowY: "auto",
            boxSizing: "border-box",
            paddingRight: "8px",
            WebkitOverflowScrolling: "touch",
            maxWidth: "100%",
          }}
          id={`dial-bubble-${side}-${state}-${safeName}`}
        >
          <div
            className={`${effectiveTextAlignClass} text-[14px] font-bold opacity-90 mb-1.5 name`}
            id={`dial-charecter-title-${side}-${state}-${safeName}`}
          >
            {resolved.name}
          </div>
          <div
            className={`text ${options.isPinned ? "" : typing ? "typing" : "done"} text-[20px] leading-[1.2] whitespace-pre-wrap break-words`}
            style={textInlineStyle}
            id={`dial-charecter-text-${side}-${state}-${safeName}`}
          >
            {options.isPinned ? msg.text : display}
          </div>
        </div>
      </div>
    );
  };

  const renderNarrator = (msg: InternalMessage, options?: { isPinned?: boolean }) => {
    const bubbleStyle: React.CSSProperties = {
      maxWidth: "min(1100px, 92%)",
      margin: "0 auto",
      padding: "10px 14px",
      borderRadius: "12px",
      borderStyle: "dashed",
      borderWidth: "2px",
      background: "rgba(18,18,20,0.76)",
      color: "#f6f7f9",
      boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
      pointerEvents: "none",
      direction: rtl ? "rtl" : "ltr",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    };

    const nameStyle: React.CSSProperties = {
      fontSize: "13px",
      opacity: 0.85,
      fontWeight: 700,
      alignSelf: rtl ? "flex-end" : "flex-start",
    };

    const textStyle: React.CSSProperties = {
      fontSize: normalizeFontSize(msg.resolvedFontSize) ?? "16px",
      fontWeight: msg.resolvedFontWeight as React.CSSProperties["fontWeight"] | undefined,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    };

    // safe id suffix (ravi is the narrator)
    const state = options?.isPinned ? "pinned" : "current";

    return (
      <div
        className={`narrator-banner ${options?.isPinned ? "pinned" : "current"}`}
        style={{ width: "100%", display: "flex", justifyContent: "center", pointerEvents: "none" }}
        key={`ravi-${options?.isPinned ? "pinned" : "cur"}`}
        id={`dial-ravi-wrapper-${state}`}
      >
        <div style={bubbleStyle} aria-live="polite">
          <div style={nameStyle} id={`dial-ravi-name-${state}`}>
            پیام راوی
          </div>
          <div style={textStyle} id={`dial-ravi-text-${state}`}>
            {options?.isPinned ? msg.text : display}
          </div>
        </div>
      </div>
    );
  };

  const currentChar = resolveCurrentCharacter(currentMessage);
  const isConsecutiveSame = currentMessage && prevMessage && currentMessage.charecter === prevMessage.charecter;
  const leftPinned = pinned.left ?? null;
  const rightPinned = pinned.right ?? null;
  const topPinned = pinned.top ?? null;

  const topCurrent = currentMessage && parseCharacterKey(currentMessage.charecter).name.toLowerCase() === "ravi" ? currentMessage : null;
  const leftCurrent = currentChar.side === "left" && currentMessage && parseCharacterKey(currentMessage.charecter).name.toLowerCase() !== "ravi" ? currentMessage : null;
  const rightCurrent = currentChar.side === "right" && currentMessage && parseCharacterKey(currentMessage.charecter).name.toLowerCase() !== "ravi" ? currentMessage : null;

  const opacityFromFade = (f?: number) => {
    const fade = typeof f === "number" ? f : 0;
    const op = 1 - Math.min(1, Math.max(0, fade));
    return op;
  };

  // Skip click handler (for the small button)
  const handleSkipClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    finishDialogueImmediately();
  };

  return (
    <DialogueContext.Provider value={{ dialogue, isActive }}>
      {children}
      {isActive && (
        <div
          id="dial-overlay"
          className={`dialogue-overlay fixed inset-0 z-[9999] pointer-events-auto flex items-end justify-center ${mode === "comic" ? "comic-mode" : ""}`}
          aria-hidden={!isActive}
          style={{
            backdropFilter: "blur(4px) saturate(95%)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
          {/* top narrator slot */}
          <div style={{ position: "absolute", top: 18, left: 0, right: 0, zIndex: 10002, display: "flex", justifyContent: "center", pointerEvents: "none", padding: "0 12px" }}>
            {topPinned ? renderNarrator(topPinned, { isPinned: true }) : null}
            {topCurrent ? renderNarrator(topCurrent, { isPinned: false }) : null}
          </div>

          {/* Background layers */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ zIndex: 9998 }}>
            {prevBg ? (
              <div
                id="dial-bg-prev"
                className="dialogue-bg-layer prev"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${prevBg})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center center",
                  backgroundRepeat: "no-repeat",
                  transition: `opacity ${BG_FADE_DURATION}ms ease`,
                  opacity: prevVisible ? opacityFromFade(prevBgFilter?.fade) : 0,
                  filter: prevBgFilter && typeof prevBgFilter.blur === "number" && prevBgFilter.blur > 0 ? `blur(${prevBgFilter.blur}px)` : undefined,
                }}
              />
            ) : null}

            {currentBg ? (
              <div
                id="dial-bg-cur"
                className="dialogue-bg-layer cur"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${currentBg})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center center",
                  backgroundRepeat: "no-repeat",
                  transition: `opacity ${BG_FADE_DURATION}ms ease`,
                  opacity: opacityFromFade(currentBgFilter?.fade),
                  filter: currentBgFilter && typeof currentBgFilter.blur === "number" && currentBgFilter.blur > 0 ? `blur(${currentBgFilter.blur}px)` : undefined,
                }}
              />
            ) : null}
          </div>

          <div className={`dialogue-gradient ${mode === "comic" ? "comic" : ""}`} />

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
              className={`w-auto flex flex-col items-end min-h-[120px] ${
                (leftPinned || leftCurrent)
                  ? "opacity-100 pointer-events-auto translate-y-0 transition-all duration-[200ms] ease-[cubic-bezier(.2,.9,.2,1)]"
                  : "opacity-0 pointer-events-none translate-y-4 transition-all duration-[180ms] ease-linear"
              } ${isConsecutiveSame && currentChar.side === "left" ? "consecutive" : ""}`}
              style={{ maxWidth: "calc(50% - 8px)" }}
            >
              {leftPinned ? renderCharacterCard(leftPinned, { forSide: "left", isPinned: true, animate: false, comic: mode === "comic" }) : null}
              {leftCurrent ? renderCharacterCard(leftCurrent, { forSide: "left", isPinned: false, animate: true, comic: mode === "comic" }) : null}
            </div>

            {/* Right slot */}
            <div
              data-side="right"
              className={`w-auto flex flex-col items-start min-h-[120px] ${
                (rightPinned || rightCurrent)
                  ? "opacity-100 pointer-events-auto translate-y-0 transition-all duration-[200ms] ease-[cubic-bezier(.2,.9,.2,1)]"
                  : "opacity-0 pointer-events-none translate-y-4 transition-all duration-[180ms] ease-linear"
              } ${isConsecutiveSame && currentChar.side === "right" ? "consecutive" : ""}`}
              style={{ maxWidth: "calc(50% - 8px)" }}
            >
              {rightPinned ? renderCharacterCard(rightPinned, { forSide: "right", isPinned: true, animate: false, comic: mode === "comic" }) : null}
              {rightCurrent ? renderCharacterCard(rightCurrent, { forSide: "right", isPinned: false, animate: true, comic: mode === "comic" }) : null}
            </div>
          </div>

          {/* center bottom small skip button (only when canSkip is true) */}
          {canSkip ? (
            <div
              style={{
                position: "absolute",
                bottom: 14,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10003,
                pointerEvents: "auto",
              }}
            >
              <button
                id="dial-skip-button"
                className="skip-button"
                onClick={handleSkipClick}
                aria-label="Skip dialogue"
              >
                {skipMessage}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </DialogueContext.Provider>
  );
}

export default DialogueProvider;
