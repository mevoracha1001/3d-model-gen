"use client";

/* eslint-disable @next/next/no-img-element -- Local data URL previews are user uploads. */

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBarsStaggered,
  faBoxArchive,
  faCheck,
  faCircleXmark,
  faPenToSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

type Message = { role: "assistant" | "user"; content: string; model?: PrintableModel | null };

type Session = {
  id: string;
  title: string;
  messages: Message[];
  references: ReferenceImage[];
  createdAt: number;
  updatedAt: number;
  isThinking: boolean;
  stageIndex: number;
};

type ReferenceImage = {
  id: string;
  name: string;
  mediaType: string;
  dataUrl: string;
};

type ManufacturingProfile = {
  audience: "professional" | "hobbyist" | "nontechnical";
  method: string;
  units: "mm" | "inch";
  toleranceMm: number;
  minWallMm: number;
  clearanceMm: number;
  maxBuildMm: [number, number, number];
  material: string;
  finish: string;
  useCase: string;
  artisticIntent: string;
  surfaceDetail: string;
  accuracyPriority: "exact fit" | "visual match" | "balanced";
  autoFillSpecifics: boolean;
};

type PrintableModel = {
  name: string;
  dimensionsMm: [number, number, number];
  geometry: unknown;
  detailLevel?: string;
  material?: string;
  finish?: string;
  criticalDimensions?: Array<{ label: string; valueMm: number; toleranceMm: number }>;
  assumptions?: string[];
  validationReport?: {
    manufacturingMethod: string;
    riskLevel: string;
    minWallMm: number;
    clearanceMm: number;
    checks: string[];
  };
  renderProfile?: {
    baseColor?: string;
    accentColor?: string;
    roughness?: number;
    metalness?: number;
    clearcoat?: number;
  };
};

type ModelGeneratorProps = { displayName: string };

const appName = "Spec2Mesh";

const defaultProfile: ManufacturingProfile = {
  audience: "nontechnical",
  method: "FDM 3D printing",
  units: "mm",
  toleranceMm: 0.2,
  minWallMm: 2,
  clearanceMm: 0.3,
  maxBuildMm: [220, 220, 220],
  material: "PLA/PETG",
  finish: "functional",
  useCase: "accurate printable model",
  artisticIntent: "clean professional product design",
  surfaceDetail: "functional high fidelity",
  accuracyPriority: "balanced",
  autoFillSpecifics: true,
};

const swarmStages = [
  "Spec agent reading brief",
  "Calculation agent deriving dimensions",
  "Manufacturing agent checking fit",
  "Art agent shaping details",
  "Geometry agent building mesh",
  "Validator preparing render",
];

const quickPrompts = [
  "Design a functional enclosure",
  "Make a part from a photo",
  "Create a printable miniature",
  "Make a replacement bracket",
];

export function ModelGenerator({ displayName }: ModelGeneratorProps) {
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<Session[]>(() => [createInitialSession()]);
  const [activeSessionId, setActiveSessionId] = useState("session_initial");
  const [prompt, setPrompt] = useState("");
  const [profile, setProfile] = useState<ManufacturingProfile>(defaultProfile);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const autoScrollRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const messages = activeSession?.messages ?? [];
  const references = activeSession?.references ?? [];
  const isThinking = Boolean(activeSession?.isThinking);
  const stageIndex = activeSession?.stageIndex ?? 0;
  const hasRunningSessions = sessions.some((session) => session.isThinking);
  const hasChat = messages.length > 0 || isThinking;

  useEffect(() => {
    const storedSessions = loadStoredSessions();
    const storedActiveSessionId = loadActiveSessionId();
    setSessions(storedSessions);
    setActiveSessionId(
      storedSessions.some((session) => session.id === storedActiveSessionId)
        ? storedActiveSessionId
        : storedSessions[0].id,
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("modelgen.sessions", JSON.stringify(sessions));
    if (activeSession?.id) {
      window.localStorage.setItem("modelgen.activeSessionId", activeSession.id);
    }
  }, [activeSession?.id, hydrated, sessions]);

  useEffect(() => {
    const updateBottomState = () => {
      const remaining =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      setIsAtBottom(remaining < 120);
    };

    updateBottomState();
    window.addEventListener("scroll", updateBottomState, { passive: true });
    window.addEventListener("resize", updateBottomState);

    return () => {
      window.removeEventListener("scroll", updateBottomState);
      window.removeEventListener("resize", updateBottomState);
    };
  }, []);

  useEffect(() => {
    if (!autoScrollRef.current) return;

    scrollToLatest("smooth");
    if (!isThinking) {
      window.setTimeout(() => {
        autoScrollRef.current = false;
      }, 250);
    }
  }, [messages, isThinking, stageIndex]);

  useEffect(() => {
    if (!hasRunningSessions) {
      return;
    }

    const timer = window.setInterval(() => {
      setSessions((current) =>
        current.map((session) =>
          session.isThinking
            ? {
                ...session,
                stageIndex: Math.min(session.stageIndex + 1, swarmStages.length - 1),
              }
            : session,
        ),
      );
    }, 2600);

    return () => window.clearInterval(timer);
  }, [hasRunningSessions]);

  function updateSession(sessionId: string, patch: Partial<Session>) {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? { ...session, ...patch, updatedAt: Date.now() }
          : session,
      ),
    );
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = prompt.trim();
    if ((!content && references.length === 0) || isThinking) return;

    const sessionId = activeSession.id;
    const userMessage: Message = {
      role: "user",
      content: buildUserMessage(content, references),
    };
    const nextMessages = [...messages, userMessage];
    autoScrollRef.current = true;
    updateSession(sessionId, {
      messages: nextMessages,
      isThinking: true,
      stageIndex: 0,
      title: nameSessionFromPrompt(content, activeSession.title),
    });
    setPrompt("");
    queueLatestScroll();

    try {
      const response = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: nextMessages.map(({ role, content }) => ({ role, content })),
          referenceImages: references.map(({ name, mediaType, dataUrl }) => ({
            name,
            mediaType,
            dataUrl,
          })),
          manufacturingProfile: profile,
        }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Codex bridge failed.");
      const normalized = normalizeClientResponse(data);

      updateSession(sessionId, {
        messages: [
          ...nextMessages,
          {
            role: "assistant",
            content:
              normalized.message ||
              (normalized.ready
                ? "Model generated. Review render and export STL when ready."
                : "I need one more critical detail."),
            model: normalized.ready ? normalized.model : null,
          },
        ],
        isThinking: false,
        stageIndex: 0,
      });
      queueLatestScroll();
    } catch (error) {
      updateSession(sessionId, {
        messages: [
          ...nextMessages,
          {
            role: "assistant",
            content: error instanceof Error ? error.message : "Codex bridge failed.",
          },
        ],
        isThinking: false,
        stageIndex: 0,
      });
      queueLatestScroll();
    }
  }

  async function attachReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).slice(0, 6 - references.length);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const nextReferences = await Promise.all(files.map(readReferenceImage));
      updateSession(activeSession.id, {
        references: [...references, ...nextReferences].slice(0, 6),
      });
    } finally {
      event.target.value = "";
      setIsUploading(false);
    }
  }

  async function downloadModel(model: PrintableModel) {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Model generation failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${model.name}.stl`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }

  function scrollToLatest(behavior: ScrollBehavior = "auto") {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior,
    });
  }

  function queueLatestScroll() {
    window.requestAnimationFrame(() => scrollToLatest("smooth"));
    window.setTimeout(() => scrollToLatest("smooth"), 80);
    window.setTimeout(() => scrollToLatest("smooth"), 220);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#05070d] text-white">
      <AnimatedBackground />
      <div className="relative z-10 min-h-screen">
        <header className="pointer-events-none fixed left-0 right-0 top-0 z-30 flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <button
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              className="pointer-events-auto relative grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/8 text-white/70 shadow-2xl backdrop-blur-xl transition hover:bg-white/14 hover:text-white active:scale-95"
              onClick={() => setSidebarOpen((value) => !value)}
              type="button"
            >
              <FontAwesomeIcon
                className={`absolute h-3.5 w-3.5 transition duration-200 ${
                  sidebarOpen ? "scale-75 opacity-0" : "scale-100 opacity-100"
                }`}
                icon={faBarsStaggered}
              />
              <FontAwesomeIcon
                className={`absolute h-3.5 w-3.5 transition duration-200 ${
                  sidebarOpen ? "scale-100 opacity-100" : "scale-75 opacity-0"
                }`}
                icon={faXmark}
              />
            </button>
            <div className="pointer-events-auto rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-sm font-semibold tracking-tight text-white/70 shadow-2xl backdrop-blur-xl">
              {appName}
            </div>
          </div>
          <button
            className="pointer-events-auto rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-sm text-white/70 shadow-2xl backdrop-blur-xl transition hover:bg-white/14"
            onClick={() => setShowSettings((value) => !value)}
            type="button"
          >
            Settings
          </button>
        </header>
        <div className="pointer-events-none fixed inset-x-0 top-0 z-20 h-32 bg-gradient-to-b from-[#05070d]/80 via-[#05070d]/35 to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-40 bg-gradient-to-t from-[#05070d]/90 via-[#05070d]/45 to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_top,black,transparent)]" />

        <SessionSidebar
          activeSessionId={activeSession.id}
          deleteSession={(sessionId) => {
            setSessions((current) => {
              const next = current.filter((session) => session.id !== sessionId);
              if (next.length > 0) {
                if (sessionId === activeSession.id) setActiveSessionId(next[0].id);
                return next;
              }
              const fresh = createSession();
              setActiveSessionId(fresh.id);
              return [fresh];
            });
          }}
          isOpen={sidebarOpen}
          newSession={() => {
            const session = createSession();
            setSessions((current) => [session, ...current]);
            setActiveSessionId(session.id);
            setPrompt("");
          }}
          renameSession={(sessionId, title) => {
            setSessions((current) =>
              current.map((session) =>
                session.id === sessionId
                  ? { ...session, title: title.trim() || "Untitled", updatedAt: Date.now() }
                  : session,
              ),
            );
          }}
          sessions={sessions}
          switchSession={(sessionId) => setActiveSessionId(sessionId)}
        />

        <section
          className={`mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pt-24 transition-all duration-700 ${
            hasChat ? "justify-end pb-40" : "justify-center pb-[18vh]"
          }`}
        >
          {!hasChat && (
            <div className="mx-auto mb-8 max-w-3xl text-center">
              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                Describe a model
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/55">
                Add dimensions or photos when needed.
              </p>
            </div>
          )}

        {hasChat && (
          <button
            className={`fixed bottom-32 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[#7dfcc1]/20 bg-[#07100d]/72 px-4 py-2 text-sm text-[#dfffee] shadow-2xl backdrop-blur-2xl transition ${
              isAtBottom ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100 hover:bg-white/18"
            }`}
            onClick={() => scrollToLatest("smooth")}
            type="button"
          >
            Latest
          </button>
        )}

        {hasChat && (
            <div
              className="mb-4 space-y-5 pr-1"
            >
              {messages.map((message, index) => (
                <ChatMessage
                  downloadModel={downloadModel}
                  isDownloading={isDownloading}
                  key={`${message.role}-${index}`}
                  message={message}
                />
              ))}
              {isThinking && <SwarmCard stage={swarmStages[stageIndex]} />}
              <div ref={bottomRef} />
            </div>
          )}

          {showSettings && (
            <SettingsPanel
              displayName={displayName}
              onClose={() => setShowSettings(false)}
              profile={profile}
              setProfile={setProfile}
            />
          )}

          {!hasChat && (
            <div className="mx-auto mb-3 flex max-w-3xl flex-wrap justify-center gap-2">
              {quickPrompts.map((quick) => (
                <button
                  className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-sm text-white/68 backdrop-blur-xl transition hover:bg-white/14"
                  key={quick}
                  onClick={() => setPrompt(quick)}
                  type="button"
                >
                  {quick}
                </button>
              ))}
            </div>
          )}

          <Composer
            attachReferences={attachReferences}
            isThinking={isThinking}
            isUploading={isUploading}
            onSubmit={submitMessage}
            profile={profile}
            prompt={prompt}
            references={references}
            removeReference={(id) =>
              updateSession(activeSession.id, {
                references: references.filter((image) => image.id !== id),
              })
            }
            setProfile={setProfile}
            setPrompt={setPrompt}
          />
        </section>
      </div>
    </main>
  );
}

function SessionSidebar({
  activeSessionId,
  deleteSession,
  isOpen,
  newSession,
  renameSession,
  sessions,
  switchSession,
}: {
  activeSessionId: string;
  deleteSession: (sessionId: string) => void;
  isOpen: boolean;
  newSession: () => void;
  renameSession: (sessionId: string, title: string) => void;
  sessions: Session[];
  switchSession: (sessionId: string) => void;
}) {
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const saveDraftTitle = (sessionId: string) => {
    renameSession(sessionId, draftTitle);
    setEditingId("");
  };
  const cancelDraftTitle = () => {
    setDraftTitle("");
    setEditingId("");
  };

  return (
    <aside
      className={`fixed bottom-5 left-5 top-20 z-30 w-[292px] rounded-[28px] border border-white/10 bg-[#0b0f17]/88 p-2 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition duration-300 ${
        isOpen ? "translate-x-0 opacity-100" : "-translate-x-[calc(100%+2rem)] opacity-0"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1">
        <div>
          <h2 className="text-sm font-medium text-white/86">Chats</h2>
          <p className="text-[11px] text-white/36">Saved model threads</p>
        </div>
        <button
          className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-medium text-white/78 transition hover:bg-white/12"
          onClick={newSession}
          type="button"
        >
          New
        </button>
      </div>
      <div className="max-h-[calc(100vh-150px)] space-y-0.5 overflow-y-auto pr-1">
        {sortedSessions.map((session) => (
          <div
            className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 transition ${
              session.id === activeSessionId
                ? "bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                : "hover:bg-white/[0.075]"
            }`}
            key={session.id}
          >
            <div className="min-w-0 flex-1">
              {editingId === session.id ? (
                <input
                  autoFocus
                  className="w-full rounded-lg border border-white/12 bg-black/28 px-2 py-1 text-sm font-medium text-white outline-none"
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveDraftTitle(session.id);
                    }
                    if (event.key === "Escape") cancelDraftTitle();
                  }}
                  value={draftTitle}
                />
              ) : (
                <button
                  className="block w-full truncate text-left text-sm font-normal text-white/84"
                  onClick={() => switchSession(session.id)}
                  type="button"
                >
                  {session.title}
                </button>
              )}
            </div>
            {session.isThinking && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#7dfcc1]" />
            )}
            <div
              className={`flex shrink-0 items-center gap-1 transition ${
                session.id === activeSessionId
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
              }`}
            >
              {editingId === session.id ? (
                <>
                  <button
                    aria-label={`Save ${session.title}`}
                    className="grid h-6 w-5 place-items-center text-[#7dfcc1]/78 transition duration-150 hover:text-[#dfffee] active:scale-90"
                    onClick={() => saveDraftTitle(session.id)}
                    type="button"
                  >
                    <FontAwesomeIcon className="h-3 w-3" icon={faCheck} />
                  </button>
                  <button
                    aria-label={`Cancel editing ${session.title}`}
                    className="grid h-6 w-5 place-items-center text-white/34 transition duration-150 hover:text-red-100 active:scale-90"
                    onClick={cancelDraftTitle}
                    type="button"
                  >
                    <FontAwesomeIcon className="h-3 w-3" icon={faXmark} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    aria-label={`Rename ${session.title}`}
                    className="grid h-6 w-5 place-items-center text-white/34 transition duration-150 hover:text-white/82 hover:opacity-100 active:scale-90"
                    onClick={() => {
                      setEditingId(session.id);
                      setDraftTitle(session.title);
                    }}
                    type="button"
                  >
                    <FontAwesomeIcon className="h-3 w-3" icon={faPenToSquare} />
                  </button>
                  <button
                    aria-label={`Delete ${session.title}`}
                    className="grid h-6 w-5 place-items-center text-white/30 transition duration-150 hover:text-red-100 hover:opacity-100 active:scale-90"
                    onClick={() => deleteSession(session.id)}
                    type="button"
                  >
                    <FontAwesomeIcon className="h-3 w-3" icon={faBoxArchive} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function AnimatedBackground() {
  return (
    <>
      <div className="fixed inset-0 overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(78,179,255,0.28),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(191,123,255,0.24),transparent_26%),radial-gradient(circle_at_50%_90%,rgba(125,252,193,0.18),transparent_34%)]" />
      <div className="fixed left-[10%] top-[18%] h-56 w-56 animate-[drift_12s_ease-in-out_infinite] rounded-full bg-[#4eb3ff]/16 blur-3xl" />
      <div className="fixed right-[12%] top-[14%] h-72 w-72 animate-[drift_14s_ease-in-out_infinite_reverse] rounded-full bg-[#bf7bff]/14 blur-3xl" />
      <div className="fixed bottom-[4%] left-[35%] h-80 w-80 animate-[drift_16s_ease-in-out_infinite] rounded-full bg-[#7dfcc1]/12 blur-3xl" />
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-[-25%] animate-[spinSlow_38s_linear_infinite] bg-[conic-gradient(from_90deg,transparent,rgba(125,252,193,0.08),transparent,rgba(78,179,255,0.08),transparent,rgba(191,123,255,0.08),transparent)]" />
      </div>
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30 [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />
      <div className="fixed inset-0 backdrop-blur-[46px]" />
      <style jsx>{`
        @keyframes drift {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(34px, -26px, 0) scale(1.08);
          }
        }
        @keyframes float {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-12px) rotate(4deg);
          }
        }
        @keyframes spinSlow {
          from {
            transform: rotate(0deg) scale(1);
          }
          to {
            transform: rotate(360deg) scale(1.04);
          }
        }
      `}</style>
    </>
  );
}

function Composer({
  prompt,
  setPrompt,
  references,
  removeReference,
  attachReferences,
  onSubmit,
  isThinking,
  isUploading,
  profile,
  setProfile,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  references: ReferenceImage[];
  removeReference: (id: string) => void;
  attachReferences: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isThinking: boolean;
  isUploading: boolean;
  profile: ManufacturingProfile;
  setProfile: React.Dispatch<React.SetStateAction<ManufacturingProfile>>;
}) {
  return (
    <form
      className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-[30px] border border-white/12 bg-[#0b1118]/78 p-2 shadow-[0_24px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
      onSubmit={onSubmit}
    >
      {references.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-2 pb-2 pt-1">
          {references.map((image) => (
            <div className="group relative shrink-0 overflow-hidden rounded-2xl border border-white/12 bg-white/8" key={image.id}>
              <img alt={image.name} className="h-16 w-20 object-cover" src={image.dataUrl} />
              <button
                aria-label={`Remove ${image.name}`}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center text-white/70 opacity-0 drop-shadow transition duration-150 hover:text-white active:scale-90 group-hover:opacity-100"
                onClick={() => removeReference(image.id)}
                type="button"
              >
                <FontAwesomeIcon className="h-3 w-3" icon={faCircleXmark} />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        className="min-h-20 w-full resize-none bg-transparent px-4 py-3 text-base text-white outline-none placeholder:text-white/38"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Ask for any model. Example: compact snap-fit enclosure for this board, auto-fill non-critical specs..."
        value={prompt}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-2 pb-1 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-full border border-white/14 bg-white/8 px-3 py-2 text-sm text-white/72 transition hover:bg-white/14">
            {isUploading ? "Reading" : "Attach"}
            <input
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={isUploading || references.length >= 6}
              multiple
              onChange={attachReferences}
              type="file"
            />
          </label>
          <button
            className={`rounded-full border px-3 py-2 text-sm transition ${
              profile.autoFillSpecifics
                ? "border-[#7dfcc1]/28 bg-[#123329]/72 text-[#dfffee]"
                : "border-white/12 bg-white/6 text-white/62"
            }`}
            onClick={() =>
              setProfile((current) => ({
                ...current,
                autoFillSpecifics: !current.autoFillSpecifics,
              }))
            }
            type="button"
          >
            Auto-fill specifics
          </button>
        </div>
        <button
          className="rounded-full bg-[#bdfadd] px-5 py-2.5 text-sm font-semibold text-[#07100d] shadow-[0_0_30px_rgba(125,252,193,0.28)] transition duration-150 hover:bg-[#d9ffe9] hover:shadow-[0_0_38px_rgba(125,252,193,0.36)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isThinking || (!prompt.trim() && references.length === 0)}
          type="submit"
        >
          {isThinking ? "Working" : "Generate"}
        </button>
      </div>
    </form>
  );
}

function ChatMessage({
  message,
  downloadModel,
  isDownloading,
}: {
  message: Message;
  downloadModel: (model: PrintableModel) => void;
  isDownloading: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-[28px] px-4 py-3 shadow-2xl backdrop-blur-2xl ${
          isUser
            ? "border border-[#7dfcc1]/22 bg-[#143428]/88 text-[#e9fff5]"
            : "border border-white/12 bg-[#0b1118]/74 text-white"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
        {message.model && (
          <div className="mt-4 overflow-hidden rounded-[24px] border border-white/12 bg-black/38">
            <div className="h-[420px]">
              <ModelPreview model={message.model} />
            </div>
            <div className="flex flex-col gap-3 border-t border-white/10 bg-[#080d13]/72 p-3 md:flex-row md:items-center md:justify-between">
              <ModelSummary model={message.model} />
              <button
                className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07100d] transition duration-150 hover:bg-[#e9fff5] active:scale-95 disabled:opacity-45"
                disabled={isDownloading}
                onClick={() => downloadModel(message.model as PrintableModel)}
                type="button"
              >
                {isDownloading ? "Exporting" : "Download STL"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SwarmCard({ stage }: { stage: string }) {
  return (
    <div className="flex justify-start">
      <div className="rounded-[28px] border border-white/12 bg-[#0b1118]/74 px-4 py-3 text-sm text-white/72 shadow-2xl backdrop-blur-2xl">
        <span className="mr-2 inline-block h-2 w-2 animate-ping rounded-full bg-[#7dfcc1]" />
        {stage}
      </div>
    </div>
  );
}

function SettingsPanel({
  displayName,
  onClose,
  profile,
  setProfile,
}: {
  displayName: string;
  onClose: () => void;
  profile: ManufacturingProfile;
  setProfile: React.Dispatch<React.SetStateAction<ManufacturingProfile>>;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close settings"
        className="absolute inset-0 cursor-default animate-[settingsFadeIn_180ms_ease-out] bg-gradient-to-l from-[#05070d]/82 via-[#05070d]/48 to-transparent backdrop-blur-[3px] [mask-image:linear-gradient(to_left,black,rgba(0,0,0,0.82),transparent)]"
        onClick={onClose}
        type="button"
      />
      <aside className="absolute bottom-4 right-4 top-4 w-[min(420px,calc(100vw-2rem))] animate-[settingsSlideIn_240ms_cubic-bezier(0.22,1,0.36,1)] rounded-[30px] border border-white/12 bg-[#0b1118]/86 p-4 shadow-[0_26px_100px_rgba(0,0,0,0.58)] backdrop-blur-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white/92">Settings</h2>
            <p className="mt-1 text-xs text-white/42">{displayName}</p>
          </div>
          <button
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center text-white/46 transition duration-150 hover:text-white active:scale-90"
            onClick={onClose}
            type="button"
          >
            <FontAwesomeIcon className="h-4 w-4" icon={faXmark} />
          </button>
        </div>
        <div className="grid gap-3">
          <Select
            label="Mode"
            value={profile.audience}
            options={["nontechnical", "hobbyist", "professional"]}
            onChange={(audience) =>
              setProfile((current) => ({
                ...current,
                audience: audience as ManufacturingProfile["audience"],
              }))
            }
          />
          <Select
            label="Priority"
            value={profile.accuracyPriority}
            options={["balanced", "exact fit", "visual match"]}
            onChange={(accuracyPriority) =>
              setProfile((current) => ({
                ...current,
                accuracyPriority: accuracyPriority as ManufacturingProfile["accuracyPriority"],
              }))
            }
          />
          <Field
            label="Tolerance"
            value={profile.toleranceMm}
            numeric
            onChange={(toleranceMm) =>
              setProfile((current) => ({ ...current, toleranceMm }))
            }
          />
          <Field label="Method" value={profile.method} onChange={(method) => setProfile((current) => ({ ...current, method }))} />
          <Field label="Material" value={profile.material} onChange={(material) => setProfile((current) => ({ ...current, material }))} />
          <Field label="Art direction" value={profile.artisticIntent} onChange={(artisticIntent) => setProfile((current) => ({ ...current, artisticIntent }))} />
        </div>
      </aside>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-white/46">
      {label}
      <select
        className="rounded-2xl border border-white/12 bg-white/10 px-3 py-2 text-sm font-normal text-white outline-none"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option className="bg-[#111827]" key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field<T extends string | number>({
  label,
  value,
  numeric,
  onChange,
}: {
  label: string;
  value: T;
  numeric?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-white/46">
      {label}
      <input
        className="min-w-0 rounded-2xl border border-white/12 bg-white/10 px-3 py-2 text-sm font-normal text-white outline-none"
        onChange={(event) =>
          onChange((numeric ? Number(event.target.value) : event.target.value) as T)
        }
        step={numeric ? 0.1 : undefined}
        type={numeric ? "number" : "text"}
        value={value}
      />
    </label>
  );
}

function ModelSummary({ model }: { model: PrintableModel }) {
  const size = model.dimensionsMm
    .map((dimension) => Number(dimension).toFixed(Number.isInteger(dimension) ? 0 : 1))
    .join(" x ");

  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-semibold text-white/90">{model.name}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Spec label="Size" value={`${size} mm`} />
        <Spec label="Risk" value={model.validationReport?.riskLevel || "review"} />
        <Spec label="Material" value={model.material || "print-ready"} />
        <Spec label="Detail" value={model.detailLevel || "production"} />
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-[min(100%,12rem)] items-center rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1 text-[11px] text-white/58">
      <span className="shrink-0 text-white/34">{label}</span>
      <span className="mx-1 text-white/20">/</span>
      <span className="truncate font-medium text-white/78">{value}</span>
    </span>
  );
}

function buildUserMessage(content: string, references: ReferenceImage[]) {
  const referenceNote =
    references.length > 0
      ? `\nReference files: ${references.map((image) => image.name).join(", ")}`
      : "";

  return [
    content || "Use uploaded references as primary visual and dimensional source.",
    referenceNote,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeClientResponse(data: {
  message?: string;
  output_text?: string;
  text?: string;
  ready?: boolean;
  model?: PrintableModel;
}) {
  if (data.ready && data.model) {
    return {
      ...data,
      message: cleanAssistantMessage(data.message, true),
    };
  }

  const rawMessage = data.message || data.output_text || data.text || "";
  const parsed = parseJsonPayload(rawMessage);
  if (parsed?.ready && parsed.model) {
    return {
      message: cleanAssistantMessage(parsed.message, true),
      ready: true,
      model: parsed.model as PrintableModel,
    };
  }

  return {
    ...data,
    message: cleanAssistantMessage(rawMessage, false),
  };
}

function cleanAssistantMessage(message: unknown, ready: boolean) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text || parseJsonPayload(text)) {
    return ready
      ? "Model generated. Review render and export STL when ready."
      : "I need one more critical detail.";
  }

  return text;
}

function parseJsonPayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.match(/\{[\s\S]*\}/)?.[0] || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next extraction.
    }
  }

  return null;
}

function createSession(): Session {
  const now = Date.now();
  return {
    id: `session_${now}_${Math.random().toString(16).slice(2)}`,
    title: "New model",
    messages: [],
    references: [],
    createdAt: now,
    updatedAt: now,
    isThinking: false,
    stageIndex: 0,
  };
}

function createInitialSession(): Session {
  return {
    id: "session_initial",
    title: "New model",
    messages: [],
    references: [],
    createdAt: 0,
    updatedAt: 0,
    isThinking: false,
    stageIndex: 0,
  };
}

function loadStoredSessions() {
  if (typeof window === "undefined") return [createSession()];

  try {
    const parsed = JSON.parse(window.localStorage.getItem("modelgen.sessions") || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((session) => ({
        ...createSession(),
        ...session,
        isThinking: false,
        stageIndex: 0,
        references: Array.isArray(session.references) ? session.references : [],
        messages: Array.isArray(session.messages) ? session.messages : [],
      }));
    }
  } catch {
    // Use fresh session.
  }

  return [createSession()];
}

function loadActiveSessionId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("modelgen.activeSessionId") || "";
}

function nameSessionFromPrompt(prompt: string, currentTitle: string) {
  if (!prompt.trim() || currentTitle !== "New model") return currentTitle;

  return prompt
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .slice(0, 6)
    .join(" ")
    .slice(0, 42);
}

function readReferenceImage(file: File): Promise<ReferenceImage> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Only image uploads are supported."));
  if (file.size > 6 * 1024 * 1024) return Promise.reject(new Error(`${file.name} is larger than 6 MB.`));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () =>
      resolve({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        mediaType: file.type,
        dataUrl: String(reader.result || ""),
      });
    reader.readAsDataURL(file);
  });
}

function ModelPreview({ model }: { model: PrintableModel }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Loading render...");
  const modelKey = useMemo(() => JSON.stringify(model), [model]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    async function renderPreview() {
      const container = containerRef.current;
      if (!container) return;

      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Preview generation failed.");
      }

      const [three, loaderModule, controlsModule] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/STLLoader.js"),
        import("three/examples/jsm/controls/OrbitControls.js"),
      ]);

      if (disposed || !containerRef.current) return;

      const geometry = new loaderModule.STLLoader().parse(await response.arrayBuffer());
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();

      const scene = new three.Scene();
      scene.background = new three.Color(0x070a10);
      const renderer = new three.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;

      const camera = new three.PerspectiveCamera(35, 1, 0.1, 5000);
      camera.up.set(0, 0, 1);
      const material = new three.MeshPhysicalMaterial({
        color: model.renderProfile?.baseColor || 0xd8e2dc,
        clearcoat: model.renderProfile?.clearcoat ?? 0.28,
        metalness: model.renderProfile?.metalness ?? 0.08,
        roughness: model.renderProfile?.roughness ?? 0.36,
      });
      const mesh = new three.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const sourceBox = new three.Box3().setFromObject(mesh);
      const sourceCenter = sourceBox.getCenter(new three.Vector3());
      const sourceMinZ = sourceBox.min.z;
      mesh.position.set(-sourceCenter.x, -sourceCenter.y, -sourceMinZ);
      scene.add(mesh);

      const box = new three.Box3().setFromObject(mesh);
      const size = box.getSize(new three.Vector3());
      const center = box.getCenter(new three.Vector3());

      const edges = new three.LineSegments(
        new three.EdgesGeometry(geometry, 32),
        new three.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }),
      );
      edges.position.copy(mesh.position);
      scene.add(edges);

      const maxDimension = Math.max(size.x, size.y, size.z, 1);
      const floor = new three.Mesh(
        new three.CircleGeometry(maxDimension * 2.4, 96),
        new three.ShadowMaterial({ color: 0x000000, opacity: 0.3 }),
      );
      floor.position.set(0, 0, -0.02);
      floor.receiveShadow = true;
      scene.add(floor);

      const grid = new three.GridHelper(maxDimension * 2.8, 28, 0x6d7b73, 0x26302b);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = 0.01;
      scene.add(grid);

      scene.add(new three.HemisphereLight(0xf8fff9, 0x1c211f, 2.2));
      const keyLight = new three.DirectionalLight(0xffffff, 3.4);
      keyLight.position.set(maxDimension * 1.25, -maxDimension * 1.5, maxDimension * 1.8);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const rimLight = new three.DirectionalLight(model.renderProfile?.accentColor || 0x7dfcc1, 1.8);
      rimLight.position.set(-maxDimension * 1.5, maxDimension * 1.25, maxDimension * 1.15);
      scene.add(rimLight);

      container.replaceChildren(renderer.domElement);
      renderer.domElement.className = "h-full w-full cursor-grab active:cursor-grabbing";
      setStatus("");

      const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.screenSpacePanning = false;
      controls.minDistance = maxDimension * 0.75;
      controls.maxDistance = maxDimension * 4;
      controls.mouseButtons = {
        LEFT: three.MOUSE.ROTATE,
        MIDDLE: three.MOUSE.DOLLY,
        RIGHT: three.MOUSE.PAN,
      };
      controls.target.set(0, 0, Math.max(size.z * 0.35, center.z));

      const resize = () => {
        const width = Math.max(container.clientWidth, 320);
        const height = Math.max(container.clientHeight, 360);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.position.set(maxDimension * 1.35, -maxDimension * 1.45, maxDimension * 0.9);
        camera.lookAt(controls.target);
        controls.update();
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(container);

      let frame = 0;
      const animate = () => {
        if (disposed) return;
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      animate();

      cleanup = () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        geometry.dispose();
        material.dispose();
        floor.geometry.dispose();
        edges.geometry.dispose();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    renderPreview().catch((error) => {
      setStatus(error instanceof Error ? error.message : "Preview failed.");
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [model, modelKey]);

  return (
    <div className="relative h-full min-h-[360px] overflow-hidden bg-[#070a10]">
      <div ref={containerRef} className="h-full w-full" />
      {status && (
        <div className="absolute inset-0 grid place-items-center text-sm text-white/56">
          {status}
        </div>
      )}
    </div>
  );
}
