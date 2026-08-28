"use client";

import { useActionState, useEffect, useRef } from "react";
import { Sparkles, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiBadge } from "@/components/ui/ai-badge";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/auth/rbac";
import type { ManagementAssistantChatState } from "@/app/management/(protected)/assistant/actions";

/**
 * M7b — the staff-facing AI Management Assistant chat. Structurally
 * separate from the guest concierge (`src/components/guest/concierge-chat.tsx`)
 * — no shared component, no shared client state, no verification panel or
 * token of any kind (the staff member is already authenticated via the
 * existing Auth.js session; `action` re-derives their identity server-side
 * on every message, never from anything this component sends). All
 * hotel/staff-specific content on screen comes from server-rendered props
 * or the server action's own replies; nothing operational is hardcoded
 * here.
 *
 * Conversation state lives only in this component's React state via
 * `useActionState` — no database table, no `localStorage`/`sessionStorage`
 * — refreshing the page starts a fresh conversation, matching M6's own
 * "browser-only, no persistence" decision (no distinguishing need was
 * found for the staff-facing assistant to behave differently).
 *
 * Strictly read-only: there is no confirmation card, no mutation button,
 * and no "propose" state anywhere in this component — M7 has no mutation
 * capability at any layer (docs/DECISIONS.md M7a entry).
 *
 * M9g — visual/UX polish only, in the same restrained-management register
 * as the rest of `/management/*` (not a guest-Concierge clone — no
 * verification panel, no capability-chip row, no proposal card, because
 * none of that exists in M7's read-only design). Every exact role/name/
 * text `tests/e2e/managementAssistant.spec.ts` locates is preserved
 * verbatim: `role="log"`, `input[name="message"]`, the exact "Send"
 * button name, every `SUGGESTED_QUESTIONS` string (unchanged below), the
 * "read-only" substring inside the log's welcome bubble, and — critically
 * — the assistant bubble's wrapping `<div>` keeps the literal
 * `justify-start` class the adversarial-prompt test selects assistant-
 * only text with (`'[role="log"] div.justify-start p'`); the avatar below
 * is added as a sibling inside that same div, never a new outer wrapper
 * with a different class scheme.
 */
const SUGGESTED_QUESTIONS: Record<StaffRole, readonly string[]> = {
  OWNER_ADMIN: [
    "What is today's occupancy?",
    "Who is arriving today?",
    "Which rooms need cleaning?",
    "Which urgent maintenance issues are open?",
    "Which service requests are pending?",
    "Who has OWNER_ADMIN access?",
  ],
  MANAGER: [
    "What is today's occupancy?",
    "Who is arriving today?",
    "Which rooms need cleaning?",
    "Which urgent maintenance issues are open?",
    "Which service requests are pending?",
    "Who has OWNER_ADMIN access?",
  ],
  FRONT_DESK: ["What is today's occupancy?", "Who is arriving today?", "Who is departing today?", "Which service requests are pending?"],
  HOUSEKEEPING: ["Which rooms need cleaning?", "What is today's occupancy?", "Are there urgent maintenance issues?"],
  MAINTENANCE: ["Which urgent maintenance issues are open?", "Which rooms need cleaning?", "What is today's occupancy?"],
};

const MAX_MESSAGE_LENGTH = 500;

type AssistantAction = (
  prevState: ManagementAssistantChatState,
  formData: FormData
) => Promise<ManagementAssistantChatState>;

const initialChatState: ManagementAssistantChatState = { messages: [] };

export function AssistantChat({
  hotelName,
  staffName,
  staffRole,
  action,
}: {
  hotelName: string;
  staffName: string;
  staffRole: StaffRole;
  action: AssistantAction;
}) {
  const [state, formAction, isPending] = useActionState(action, initialChatState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  // Presentation only — a live mirror of the input's own length against the
  // existing `maxLength={500}` attribute below. Deliberately a ref write
  // (no `useState`, no re-render on every keystroke) rather than a
  // state-driven counter — the same fix M9d's Concierge polish already
  // required after a state-driven version was found to force a re-render
  // capable of resetting security-sensitive DOM state. This form has no
  // hidden token field to reset, but the ref-based approach is kept
  // consistent regardless, per that established fix. Never changes what
  // is submitted or how the server enforces the limit
  // (`src/lib/ai/messageBounds.ts`, `actions.ts`'s M8c ordering — both
  // untouched).
  const counterRef = useRef<HTMLSpanElement>(null);

  function setCounter(length: number) {
    if (counterRef.current) counterRef.current.textContent = `${length}/${MAX_MESSAGE_LENGTH}`;
  }

  // Clear the input after every submission resolves (success or inline error).
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = "";
    setCounter(0);
  }, [state]);

  // Keep the newest message in view as the transcript grows.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [state, isPending]);

  function askStarter(question: string) {
    if (inputRef.current) inputRef.current.value = question;
    setCounter(question.length);
    formRef.current?.requestSubmit();
  }

  const suggestedQuestions = SUGGESTED_QUESTIONS[staffRole];

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-basalt-700/15 bg-parchment-50 shadow-sm">
      {/* Chat header — pure presentation, gives the assistant a clear,
          professional identity distinct from an ordinary management page. */}
      <div className="flex items-center gap-3 border-b border-basalt-700/10 bg-parchment-100 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ochre-500/15">
          <Sparkles className="h-5 w-5 text-ochre-600" aria-hidden />
        </div>
        <div className="flex-1">
          <p className="font-display text-base text-basalt-950">Management Assistant</p>
          <p className="text-xs text-basalt-700">Read-only · grounded in live {hotelName} data</p>
        </div>
        <AiBadge className="hidden sm:inline-flex">AI-Powered</AiBadge>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation with the management assistant"
          className="flex max-h-[28rem] min-h-[16rem] flex-col gap-3 overflow-y-auto rounded-lg border border-basalt-700/15 bg-parchment-50 p-4"
        >
          <AssistantBubble role="assistant">
            {`Hi ${staffName}, I'm your AI management assistant for ${hotelName}. Ask me about current occupancy, arrivals/departures, housekeeping, maintenance, or service requests. I'm read-only — I can tell you what's happening, but I can't create, change, or cancel anything for you.`}
          </AssistantBubble>

          {state.messages.map((message, index) => (
            <AssistantBubble key={index} role={message.role}>
              {message.content}
            </AssistantBubble>
          ))}

          {isPending && (
            <AssistantBubble role="assistant" pending>
              Thinking…
            </AssistantBubble>
          )}
        </div>

        {state.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.error}
          </p>
        )}

        {state.messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-basalt-700">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => askStarter(question)}
                  disabled={isPending}
                  className="rounded-full border border-basalt-700/25 bg-parchment-50 px-4 py-1.5 text-sm text-basalt-800 transition-colors hover:bg-parchment-100 disabled:pointer-events-none disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="assistant-message" className="sr-only">
                Your question
              </Label>
              <Input
                id="assistant-message"
                name="message"
                ref={inputRef}
                placeholder="Ask about occupancy, arrivals, housekeeping, maintenance…"
                maxLength={MAX_MESSAGE_LENGTH}
                autoComplete="off"
                disabled={isPending}
                onChange={(e) => setCounter(e.target.value.length)}
                required
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                "Sending…"
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden />
                  Send
                </>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-basalt-700/60">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Read-only — it can&apos;t create, change, or cancel anything.
            </span>
            <span ref={counterRef}>0/{MAX_MESSAGE_LENGTH}</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssistantBubble({
  role,
  pending,
  children,
}: {
  role: "user" | "assistant";
  pending?: boolean;
  children: React.ReactNode;
}) {
  const isStaff = role === "user";
  return (
    // `justify-start`/`justify-end` are kept as literal class names (not
    // renamed to e.g. `flex-row`/`flex-row-reverse`) because
    // tests/e2e/managementAssistant.spec.ts's adversarial-prompt test
    // selects assistant-only text via `'[role="log"] div.justify-start p'`
    // — the avatar below is a sibling inside this same div, not a new
    // outer wrapper.
    <div className={cn("flex items-end gap-2", isStaff ? "justify-end" : "justify-start")}>
      {!isStaff && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ochre-500/15">
          <Sparkles className="h-3.5 w-3.5 text-ochre-600" aria-hidden />
        </div>
      )}
      <p
        className={cn(
          "max-w-[80%] whitespace-pre-line rounded-lg px-4 py-2 text-sm",
          isStaff ? "bg-ochre-500 text-parchment-50" : "bg-parchment-100 text-basalt-900",
          pending && "italic text-basalt-700/70"
        )}
      >
        {children}
      </p>
    </div>
  );
}
