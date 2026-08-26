"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ConciergeChatState } from "@/app/(guest)/concierge/actions";

/**
 * M6 Phase b — the anonymous public concierge chat. All hotel-specific
 * content on screen (the assistant's replies) comes from the server action;
 * nothing hotel-specific is hardcoded here. The four starter prompts below
 * are generic question templates, not answers.
 *
 * Conversation state lives only in this component's React state via
 * `useActionState` — nothing is written to `localStorage`/`sessionStorage`
 * or the database, so refreshing the page starts a fresh conversation
 * (docs/DECISIONS.md M6 corrected design — browser-only, no persistence).
 */
const STARTER_QUESTIONS = [
  "What time is check-in?",
  "Tell me about the restaurant.",
  "What facilities do you have?",
  "What room types do you offer?",
] as const;

type ConciergeAction = (prevState: ConciergeChatState, formData: FormData) => Promise<ConciergeChatState>;

const initialState: ConciergeChatState = { messages: [] };

export function ConciergeChat({ hotelName, action }: { hotelName: string; action: ConciergeAction }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
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

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with the virtual concierge"
        className="flex max-h-[28rem] min-h-[16rem] flex-col gap-3 overflow-y-auto rounded-lg border border-basalt-700/15 bg-parchment-50 p-4"
      >
        <ConciergeBubble role="assistant">
          {`Welcome to ${hotelName}! I'm the virtual concierge. Ask me about our rooms, dining, facilities, services, or policies.`}
        </ConciergeBubble>

        {state.messages.map((message, index) => (
          <ConciergeBubble key={index} role={message.role}>
            {message.content}
          </ConciergeBubble>
        ))}

        {isPending && (
          <ConciergeBubble role="assistant" pending>
            Thinking…
          </ConciergeBubble>
        )}
      </div>

      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      {state.messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((question) => (
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
          <Label htmlFor="concierge-message" className="sr-only">
            Your message
          </Label>
          <Input
            id="concierge-message"
            name="message"
            ref={inputRef}
            placeholder="Ask about rooms, dining, facilities…"
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

function ConciergeBubble({
  role,
  pending,
  children,
}: {
  role: "user" | "assistant";
  pending?: boolean;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-line rounded-lg px-4 py-2 text-sm",
          isUser ? "bg-ochre-500 text-parchment-50" : "bg-parchment-100 text-basalt-900",
          pending && "italic text-basalt-700/70"
        )}
      >
        {children}
      </p>
    </div>
  );
}
