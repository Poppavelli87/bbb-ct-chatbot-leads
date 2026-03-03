import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  getFlowByIntent,
  type AccreditationStatus
} from "@bbb/shared";

import { apiRequest } from "../api";
import { FlowInput } from "../components/FlowInput";
import { SparkyAvatar } from "../components/SparkyAvatar";

type SelectableIntent = "accreditation" | "advertising" | "ignite" | "both";

type Phase = "intent" | "ct" | "accreditation" | "business_name" | "flow" | "done";
type EndState = "completed" | "out_of_scope" | "redirect" | null;

type ChatMessage = {
  id: string;
  sender: "bot" | "user";
  text: string;
};

type PersistedState = {
  version: 1;
  phase: Phase;
  endState: EndState;
  selectedIntent: SelectableIntent | null;
  isCtBusiness: boolean | null;
  accreditationStatus: AccreditationStatus | null;
  businessName: string | null;
  leadId: string | null;
  currentStepIndex: number;
  messages: ChatMessage[];
};

const STORAGE_KEY = "bbb_ct_chatbot_state_v1";

const intentChoices: Array<{ value: SelectableIntent; label: string; description: string }> = [
  {
    value: "accreditation",
    label: "Accreditation",
    description: "Start a BBB Accreditation application"
  },
  {
    value: "advertising",
    label: "Advertising",
    description: "Ask about advertising opportunities"
  },
  {
    value: "ignite",
    label: "Ignite Coworking",
    description: "Ask about coworking space"
  },
  {
    value: "both",
    label: "Both",
    description: "I need advertising and coworking details"
  }
];

const accreditationChoices: Array<{
  label: string;
  value: "not_accredited" | "accredited" | "not_sure" | "redirect";
}> = [
  { label: "Not accredited", value: "not_accredited" },
  { label: "Already accredited", value: "accredited" },
  { label: "Not sure", value: "not_sure" },
  { label: "Something else (bbb.org)", value: "redirect" }
];

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const createMessage = (sender: "bot" | "user", text: string): ChatMessage => ({
  id: crypto.randomUUID(),
  sender,
  text
});

const initialMessage = createMessage(
  "bot",
  "Hey there! I'm Sparky, the BBB's friendly chatbot assistant.\n\nThis application and support chat is for businesses operating in Connecticut.\n\nBefore we get started, do you currently operate in Connecticut?"
);

const progressForPhase = (
  phase: Phase,
  currentStepIndex: number,
  flowLength: number
): number => {
  if (phase === "done") {
    return 100;
  }

  if (phase === "flow") {
    if (flowLength <= 0) {
      return 70;
    }
    return Math.min(95, Math.round(70 + (currentStepIndex / flowLength) * 25));
  }

  if (phase === "business_name") {
    return 60;
  }

  if (phase === "accreditation") {
    return 40;
  }

  if (phase === "ct") {
    return 20;
  }

  return 0;
};

const primaryButtonClass =
  "rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition duration-150 hover:bg-blue-700 hover:shadow-md hover:ring-2 hover:ring-orange-300/60 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClass =
  "rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-slate-800 transition duration-150 hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

export const ChatbotPage = () => {
  const [phase, setPhase] = useState<Phase>("intent");
  const [endState, setEndState] = useState<EndState>(null);
  const [selectedIntent, setSelectedIntent] = useState<SelectableIntent | null>(null);
  const [isCtBusiness, setIsCtBusiness] = useState<boolean | null>(null);
  const [accreditationStatus, setAccreditationStatus] =
    useState<AccreditationStatus | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [typing, setTyping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [businessNameInput, setBusinessNameInput] = useState("");
  const [ready, setReady] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const flow = useMemo(() => {
    if (!selectedIntent) {
      return null;
    }

    return getFlowByIntent(selectedIntent);
  }, [selectedIntent]);

  const currentStep = phase === "flow" && flow ? flow.steps[currentStepIndex] : null;
  const progress = progressForPhase(phase, currentStepIndex, flow?.steps.length ?? 0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.version !== 1) {
        setReady(true);
        return;
      }

      setPhase(parsed.phase);
      setEndState(parsed.endState);
      setSelectedIntent(parsed.selectedIntent);
      setIsCtBusiness(parsed.isCtBusiness);
      setAccreditationStatus(parsed.accreditationStatus);
      setBusinessName(parsed.businessName ?? null);
      setLeadId(parsed.leadId);
      setCurrentStepIndex(parsed.currentStepIndex);
      setMessages(parsed.messages.length > 0 ? parsed.messages : [initialMessage]);
    } catch {
      setMessages([initialMessage]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const snapshot: PersistedState = {
      version: 1,
      phase,
      endState,
      selectedIntent,
      isCtBusiness,
      accreditationStatus,
      businessName,
      leadId,
      currentStepIndex,
      messages
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    accreditationStatus,
    businessName,
    currentStepIndex,
    endState,
    isCtBusiness,
    leadId,
    messages,
    phase,
    ready,
    selectedIntent
  ]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const pushBotMessage = async (text: string) => {
    setTyping(true);
    await wait(350);
    setMessages((previous) => [...previous, createMessage("bot", text)]);
    setTyping(false);
  };

  const pushUserMessage = (text: string) => {
    setMessages((previous) => [...previous, createMessage("user", text)]);
  };

  const markLeadComplete = async (id: string) => {
    await apiRequest(`/api/leads/${id}/complete`, { method: "POST" });
  };

  const handleIntentSelect = async (intent: SelectableIntent) => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      setSelectedIntent(intent);
      setPhase("ct");
      const intentLabel = intentChoices.find((choice) => choice.value === intent)?.label ?? intent;
      pushUserMessage(intentLabel);
      await pushBotMessage("First question: Is your business located in Connecticut?");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCtAnswer = async (answer: boolean) => {
    if (submitting || !selectedIntent) {
      return;
    }

    setSubmitting(true);
    try {
      setIsCtBusiness(answer);
      pushUserMessage(answer ? "Yes" : "No");

      if (!answer) {
        const started = await apiRequest<{ lead: { id: string } }>("/api/leads/start", {
          method: "POST",
          body: JSON.stringify({
            isCtBusiness: false,
            accreditationStatus: "unknown",
            intent: "out_of_scope",
            businessName: "Out of scope"
          })
        });

        setLeadId(started.lead.id);
        await markLeadComplete(started.lead.id);
        setPhase("done");
        setEndState("out_of_scope");
        await pushBotMessage(
          "Thanks for checking in. This assistant is focused on Connecticut businesses, but you can still explore resources at bbb.org."
        );
        return;
      }

      setPhase("accreditation");
      await pushBotMessage("Is your business currently BBB Accredited?");
    } catch (error) {
      await pushBotMessage(`I ran into an issue: ${(error as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccreditationAnswer = async (
    value: "not_accredited" | "accredited" | "not_sure" | "redirect",
    label: string
  ) => {
    if (submitting || !selectedIntent || isCtBusiness === null) {
      return;
    }

    setSubmitting(true);
    try {
      pushUserMessage(label);

      if (value === "redirect") {
        const started = await apiRequest<{ lead: { id: string } }>("/api/leads/start", {
          method: "POST",
          body: JSON.stringify({
            isCtBusiness,
            accreditationStatus: "unknown",
            intent: "redirect_bbb_org",
            businessName: "Redirected to BBB.org"
          })
        });

        setLeadId(started.lead.id);
        await markLeadComplete(started.lead.id);
        setPhase("done");
        setEndState("redirect");
        await pushBotMessage(
          "The best next step is bbb.org for this request. Use the button below and we can help when you return."
        );
        return;
      }

      setAccreditationStatus(value);
      setPhase("business_name");
      await pushBotMessage("What is your business name?");
    } catch (error) {
      await pushBotMessage(`I ran into an issue: ${(error as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const startLeadAndFlow = async () => {
    if (
      !selectedIntent ||
      accreditationStatus === null ||
      isCtBusiness === null ||
      !businessNameInput.trim() ||
      !flow
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const normalizedBusinessName = businessNameInput.trim();
      pushUserMessage(normalizedBusinessName);
      setBusinessName(normalizedBusinessName);

      const started = await apiRequest<{ lead: { id: string } }>("/api/leads/start", {
        method: "POST",
        body: JSON.stringify({
          isCtBusiness,
          accreditationStatus,
          intent: selectedIntent,
          businessName: normalizedBusinessName
        })
      });

      setLeadId(started.lead.id);
      setPhase("flow");
      setCurrentStepIndex(0);
      setBusinessNameInput("");
      await pushBotMessage(flow.steps[0]?.prompt ?? "Let's continue.");
    } catch (error) {
      await pushBotMessage(`I ran into an issue: ${(error as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFlowAnswer = async (value: unknown, displayText: string) => {
    if (!leadId || !flow || !currentStep || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      pushUserMessage(displayText);

      await apiRequest(`/api/leads/${leadId}/answer`, {
        method: "POST",
        body: JSON.stringify({
          stepKey: currentStep.key,
          value
        })
      });

      const nextIndex = currentStepIndex + 1;
      const nextStep = flow.steps[nextIndex];

      if (!nextStep) {
        await markLeadComplete(leadId);
        setPhase("done");
        setEndState("completed");
        await pushBotMessage(
          "Thank you. Your information has been saved and our BBB Serving Connecticut team will follow up soon."
        );
        return;
      }

      setCurrentStepIndex(nextIndex);
      await pushBotMessage(nextStep.prompt);
    } catch (error) {
      await pushBotMessage(`I ran into an issue: ${(error as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPhase("intent");
    setEndState(null);
    setSelectedIntent(null);
    setIsCtBusiness(null);
    setAccreditationStatus(null);
    setBusinessName(null);
    setLeadId(null);
    setCurrentStepIndex(0);
    setMessages([initialMessage]);
  };

  const applicationTypeLabel = selectedIntent
    ? intentChoices.find((choice) => choice.value === selectedIntent)?.label ?? selectedIntent
    : "Not selected";

  const accreditationStatusLabel =
    accreditationStatus === null
      ? "Unknown"
      : accreditationChoices.find((choice) => choice.value === accreditationStatus)?.label ??
        accreditationStatus;

  const businessLabel = businessNameInput.trim() || businessName || "Not provided yet";

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="bg-blue-600 py-2 text-center text-sm text-white">
          This application and support chat is for businesses operating in Connecticut.
        </div>
        <div className="mx-auto max-w-[900px] px-4 py-8 text-sm text-slate-600 sm:px-6">
          Loading chat...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-blue-600 py-2 text-center text-sm text-white">
        This application and support chat is for businesses operating in Connecticut.
      </div>

      <header className="mx-auto flex w-full max-w-[900px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-white text-xs font-semibold text-blue-700">
            BBB
          </div>
          <p className="text-base font-semibold text-slate-900">BBB Serving Connecticut</p>
        </div>

        <div className="w-full max-w-[240px]">
          <p className="text-right text-sm font-medium text-slate-700">
            Progress {progress}% complete
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-4 pb-10 sm:px-6">
        <section className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-slate-200/60 ring-1 ring-slate-200">
          <div className="relative flex items-center justify-between bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-5 py-4 text-white shadow-[0_10px_26px_rgba(29,78,216,0.35)]">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10" />
            <div className="flex items-center gap-3">
              <SparkyAvatar />
              <div>
                <p className="text-sm font-semibold">Sparky</p>
                <p className="text-xs text-blue-100">BBB Chatbot Assistant</p>
              </div>
            </div>
            {phase === "flow" && flow ? (
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs">
                Step {currentStepIndex + 1} of {flow.steps.length}
              </span>
            ) : null}
          </div>

          <div
            ref={scrollerRef}
            className="max-h-[430px] min-h-[260px] space-y-3 overflow-y-auto bg-slate-50 px-5 py-5"
            aria-live="polite"
          >
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    message.sender === "bot"
                      ? "bg-gray-100 text-slate-800"
                      : "ml-auto bg-blue-600 text-white"
                  }`}
                >
                  {message.text}
                </motion.div>
              ))}
            </AnimatePresence>

            {typing ? (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-3 text-slate-700">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 px-5 py-4">
            {phase === "intent" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {intentChoices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-sm transition duration-150 hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      void handleIntentSelect(choice.value);
                    }}
                    disabled={submitting}
                  >
                    <span className="block font-semibold text-slate-900">{choice.label}</span>
                    <span className="mt-1 block text-xs text-slate-600">{choice.description}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {phase === "ct" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className={primaryButtonClass}
                  type="button"
                  onClick={() => {
                    void handleCtAnswer(true);
                  }}
                  disabled={submitting}
                >
                  Yes
                </button>
                <button
                  className={secondaryButtonClass}
                  type="button"
                  onClick={() => {
                    void handleCtAnswer(false);
                  }}
                  disabled={submitting}
                >
                  No
                </button>
              </div>
            ) : null}

            {phase === "accreditation" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {accreditationChoices.map((choice) => (
                  <button
                    key={choice.value}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition duration-150 hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      void handleAccreditationAnswer(choice.value, choice.label);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : null}

            {phase === "business_name" ? (
              <form
                className="flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startLeadAndFlow();
                }}
              >
                <input
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
                  value={businessNameInput}
                  onChange={(event) => setBusinessNameInput(event.target.value)}
                  placeholder="Business name"
                  disabled={submitting}
                />
                <button
                  className={primaryButtonClass}
                  type="submit"
                  disabled={submitting}
                >
                  Continue
                </button>
              </form>
            ) : null}

            {phase === "flow" && currentStep ? (
              <FlowInput step={currentStep} onSubmit={handleFlowAnswer} disabled={submitting} />
            ) : null}

            {phase === "done" ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className={primaryButtonClass}
                  type="button"
                  onClick={restart}
                >
                  Start over
                </button>
                {endState === "redirect" ? (
                  <a
                    className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-slate-800 transition duration-150 hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm active:scale-[0.99]"
                    href="https://www.bbb.org"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open bbb.org
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Conversation Notes</h2>
          <p className="mt-2 text-sm text-slate-600">
            Sparky will keep track of details you share during this conversation.
          </p>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <p>Business: {businessLabel}</p>
            <p>Application Type: {applicationTypeLabel}</p>
            <p>
              Connecticut Business: {isCtBusiness === null ? "Unknown" : isCtBusiness ? "Yes" : "No"}
            </p>
            <p>Accreditation Status: {accreditationStatusLabel}</p>
          </div>
        </section>

        <section className="mt-5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white shadow-sm">
          <h2 className="text-lg font-semibold">Why BBB Accreditation?</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            <li>Build trust with your customers</li>
            <li>Stand out from competitors</li>
            <li>Join 400,000+ accredited businesses</li>
          </ul>
        </section>
      </main>
    </div>
  );
};
