import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  getFlowByIntent,
  type AccreditationStatus,
  type LeadIntent
} from "@bbb/shared";

import { apiRequest } from "../api";
import { FlowInput } from "../components/FlowInput";

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
  "Hi, I’m Sparky from BBB Serving Connecticut. Pick what you’re interested in, and I’ll guide you one question at a time."
);

const SparkyMascot = () => (
  <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
    <div className="h-10 w-10 rounded-full bg-gradient-to-b from-amber-300 via-orange-500 to-red-600 p-1">
      <div className="h-full w-full rounded-full bg-slate-950" />
    </div>
    <div>
      <p className="text-sm font-semibold text-slate-900">Sparky</p>
      <p className="text-xs text-slate-600">BBB CT Assistant</p>
    </div>
  </div>
);

export const ChatbotPage = () => {
  const [phase, setPhase] = useState<Phase>("intent");
  const [endState, setEndState] = useState<EndState>(null);
  const [selectedIntent, setSelectedIntent] = useState<SelectableIntent | null>(null);
  const [isCtBusiness, setIsCtBusiness] = useState<boolean | null>(null);
  const [accreditationStatus, setAccreditationStatus] =
    useState<AccreditationStatus | null>(null);
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
      leadId,
      currentStepIndex,
      messages
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    accreditationStatus,
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
      pushUserMessage(businessNameInput.trim());

      const started = await apiRequest<{ lead: { id: string } }>("/api/leads/start", {
        method: "POST",
        body: JSON.stringify({
          isCtBusiness,
          accreditationStatus,
          intent: selectedIntent,
          businessName: businessNameInput.trim()
        })
      });

      setLeadId(started.lead.id);
      setPhase("flow");
      setCurrentStepIndex(0);
      setBusinessNameInput("");
      await pushBotMessage(flow.steps[0]?.prompt ?? "Let’s continue.");
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
    setLeadId(null);
    setCurrentStepIndex(0);
    setMessages([initialMessage]);
  };

  if (!ready) {
    return <div className="panel">Loading chat...</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="panel flex min-h-[70vh] flex-col">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <SparkyMascot />
          {phase === "flow" && flow ? (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
              Step {currentStepIndex + 1} of {flow.steps.length}
            </span>
          ) : null}
        </div>

        <div
          ref={scrollerRef}
          className="flex-1 space-y-3 overflow-y-auto pr-1"
          aria-live="polite"
        >
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  message.sender === "bot"
                    ? "bg-slate-100 text-slate-800"
                    : "ml-auto bg-orange-600 text-white"
                }`}
              >
                {message.text}
              </motion.div>
            ))}
          </AnimatePresence>
          {typing ? (
            <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-slate-700">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          ) : null}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          {phase === "intent" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {intentChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  className="option-btn"
                  onClick={() => {
                    void handleIntentSelect(choice.value);
                  }}
                  disabled={submitting}
                >
                  <strong>{choice.label}</strong>
                  <span className="mt-1 block text-xs text-slate-600">{choice.description}</span>
                </button>
              ))}
            </div>
          ) : null}

          {phase === "ct" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="option-btn"
                type="button"
                onClick={() => {
                  void handleCtAnswer(true);
                }}
                disabled={submitting}
              >
                Yes
              </button>
              <button
                className="option-btn"
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
            <div className="grid gap-2 sm:grid-cols-2">
              {accreditationChoices.map((choice) => (
                <button
                  key={choice.value}
                  className="option-btn"
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
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void startLeadAndFlow();
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2"
                value={businessNameInput}
                onChange={(event) => setBusinessNameInput(event.target.value)}
                placeholder="Business name"
                disabled={submitting}
              />
              <button className="btn-primary" type="submit" disabled={submitting}>
                Continue
              </button>
            </form>
          ) : null}

          {phase === "flow" && currentStep ? (
            <FlowInput step={currentStep} onSubmit={handleFlowAnswer} disabled={submitting} />
          ) : null}

          {phase === "done" ? (
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="button" onClick={restart}>
                Start over
              </button>
              {endState === "redirect" ? (
                <a className="btn-secondary" href="https://www.bbb.org" target="_blank" rel="noreferrer">
                  Open bbb.org
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="panel space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">What gets saved</h2>
        <p className="text-sm text-slate-700">
          Your lead is created once you share business name. If you pause, status remains
          in-progress so our team can understand drop-off steps.
        </p>
        <div className="rounded-2xl bg-slate-100 p-3 text-xs text-slate-700">
          <p>Lead ID: {leadId ?? "Not created yet"}</p>
          <p>Intent: {selectedIntent ?? "Not selected"}</p>
          <p>CT Business: {isCtBusiness === null ? "Unknown" : isCtBusiness ? "Yes" : "No"}</p>
          <p>Accreditation: {accreditationStatus ?? "Unknown"}</p>
        </div>
      </aside>
    </div>
  );
};
