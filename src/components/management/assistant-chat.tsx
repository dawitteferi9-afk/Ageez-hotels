"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  // Clear the input after every submission resolves (success or inline error).
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = "";
  }, [state]);

  // Keep the newest message in view as the transcript grows.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [state, isPending]);

  function askStarter(question: string) {
    if (inputRef.current) inputRef.current.value = question;
    formRef.current?.requestSubmit();
  }

  const suggestedQuestions = SUGGESTED_QUESTIONS[staffRole];

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with the management assistant"
        className="flex max-h-[28rem] min-h-[16rem] flex-col gap-3 overflow-y-auto rounded-lg border border-basalt-700/15 bg-parchment-50 p-4"
      >
        <AssistantBubble role="assistant">
          {`Hi ${staffName}, I'm the management assistant for ${hotelName}. Ask me about current occupancy, arrivals/departures, housekeeping, maintenance, or service requests. I'm read-only — I can tell you what's happening, but I can't make operational changes for you.`}
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
      )}

      <form ref={formRef} action={formAction} className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="assistant-message" className="sr-only">
            Your question
          </Label>
          <Input
            id="assistant-message"
            name="message"
            ref={inputRef}
            placeholder="Ask about occupancy, arrivals, housekeeping, maintenance…"
            maxLength={500}
            autoComplete="off"
            disabled={isPending}
            required
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send"}
        </Button>
      </form>
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
    <div className={cn("flex", isStaff ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-line rounded-lg px-4 py-2 text-sm",
          isStaff ? "bg-ochre-500 text-parchment-50" : "bg-parchment-100 text-basalt-900",
          pending && "italic text-basalt-700/70"
        )}
      >
        {children}
      </p>
    </div>
  );
}
