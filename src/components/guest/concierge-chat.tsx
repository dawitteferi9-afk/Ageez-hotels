"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  ConciergeChatState,
  VerifyBookingState,
  ConfirmServiceRequestState,
  ServiceRequestProposalView,
} from "@/app/(guest)/concierge/actions";

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
 *
 * M6c adds an optional booking-verification panel (below). The resulting
 * signed token is held ONLY in this component's own React state (a
 * deliberate M6c decision, matching M6b's own — see docs/DECISIONS.md —
 * not `sessionStorage`, so no bearer-style token is ever written to
 * browser storage) and is threaded into the chat form as a hidden field on
 * every message, so `sendConciergeMessageAction` can attempt to resolve it
 * fresh on the server for that one request. Refreshing the page or
 * clearing verification always returns to the exact M6b anonymous
 * experience — nothing about the base chat changes.
 */
const STARTER_QUESTIONS = [
  "What time is check-in?",
  "Tell me about the restaurant.",
  "What facilities do you have?",
  "What room types do you offer?",
] as const;

type ConciergeAction = (prevState: ConciergeChatState, formData: FormData) => Promise<ConciergeChatState>;
type VerifyAction = (prevState: VerifyBookingState, formData: FormData) => Promise<VerifyBookingState>;
type ConfirmAction = (
  prevState: ConfirmServiceRequestState,
  formData: FormData
) => Promise<ConfirmServiceRequestState>;

const initialChatState: ConciergeChatState = { messages: [] };
const initialVerifyState: VerifyBookingState = {};
const initialConfirmState: ConfirmServiceRequestState = { status: "idle" };

export function ConciergeChat({
  hotelName,
  action,
  verifyAction,
  confirmAction,
}: {
  hotelName: string;
  action: ConciergeAction;
  verifyAction: VerifyAction;
  confirmAction: ConfirmAction;
}) {
  const [state, formAction, isPending] = useActionState(action, initialChatState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string | undefined>(undefined);

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
          {`Welcome to ${hotelName}! I'm the virtual concierge. Ask me about our rooms, dining, facilities, services, or policies. Verify your booking below to ask about your own reservation or requests.`}
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

      {state.proposal && (
        <ServiceRequestProposalCard
          // Remounts (discarding any prior Confirm/Cancel result) whenever a
          // NEW assistant turn produces a proposal — never carries a stale
          // confirm/error state over from an earlier proposal cycle.
          key={state.messages.length}
          proposal={state.proposal}
          token={token}
          confirmAction={confirmAction}
        />
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

      <VerifyBookingPanel verifyAction={verifyAction} token={token} onVerified={setToken} onClear={() => setToken(undefined)} />

      <form ref={formRef} action={formAction} className="flex items-end gap-3">
        <input type="hidden" name="token" value={token ?? ""} />
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

/**
 * M6c — the optional booking-verification panel. Collapsed by default so
 * the anonymous experience is unchanged unless a guest chooses to verify.
 * Only two fields are ever asked for: the displayed booking reference, and
 * a single contact field (checked against both email and phone
 * server-side — the guest never has to say which one they're giving).
 * Never asks for a surname, database id, guest id, or hotel id.
 */
function VerifyBookingPanel({
  verifyAction,
  token,
  onVerified,
  onClear,
}: {
  verifyAction: VerifyAction;
  token: string | undefined;
  onVerified: (token: string) => void;
  onClear: () => void;
}) {
  const [verifyState, verifyFormAction, verifyPending] = useActionState(verifyAction, initialVerifyState);
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (verifyState.token) {
      onVerified(verifyState.token);
      setExpanded(false);
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyState]);

  if (token) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
        <p role="status">✓ Booking verified — you can now ask about your reservation and requests.</p>
        <button type="button" onClick={onClear} className="font-medium underline hover:no-underline">
          Clear verification
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="self-start rounded-full border border-basalt-700/25 bg-parchment-50 px-4 py-1.5 text-sm font-medium text-basalt-800 transition-colors hover:bg-parchment-100"
      >
        Verify My Booking
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={verifyFormAction}
      className="flex flex-col gap-3 rounded-lg border border-basalt-700/15 bg-parchment-50 p-4"
    >
      <p className="text-sm font-medium text-basalt-900">Verify your booking</p>
      {verifyState.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {verifyState.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="verify-reference">Booking reference</Label>
          <Input id="verify-reference" name="bookingReference" autoComplete="off" required disabled={verifyPending} />
        </div>
        <div>
          <Label htmlFor="verify-contact">Email used for booking, or phone if no email was provided</Label>
          <Input id="verify-contact" name="contact" autoComplete="off" required disabled={verifyPending} />
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={verifyPending}>
          {verifyPending ? "Verifying…" : "Verify"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)} disabled={verifyPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * M6d — the deterministic ServiceRequest confirmation card. The proposal's
 * exact type/notes are shown to the guest BEFORE any write happens; only an
 * actual "Confirm Request" click submits `confirmAction` (never a chat
 * message, never inferred from "yes"/"okay"). "Cancel" is a pure client-side
 * discard — no server call, nothing created — matching the M6d design's
 * explicit requirement.
 *
 * Deliberately does NOT read `state.proposal` again after mounting — this
 * component owns exactly one proposal for its lifetime (the parent gives it
 * a fresh `key` per turn, see `ConciergeChat` above), so its own
 * `cancelled`/confirm-result state can never leak into a later, different
 * proposal.
 */
function ServiceRequestProposalCard({
  proposal,
  token,
  confirmAction,
}: {
  proposal: ServiceRequestProposalView;
  token: string | undefined;
  confirmAction: ConfirmAction;
}) {
  const [confirmState, confirmFormAction, confirmPending] = useActionState(confirmAction, initialConfirmState);
  const [cancelled, setCancelled] = useState(false);

  if (cancelled) return null;

  if (confirmState.status === "success") {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
        <p role="status" className="font-medium">
          ✓ Request submitted — {confirmState.requestType} ({confirmState.requestStatus})
        </p>
        <p className="mt-1">The front desk will follow up on your request.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ochre-500/40 bg-parchment-100 p-4">
      <p className="text-sm font-medium text-basalt-900">Review your service request</p>
      <dl className="grid gap-1 text-sm text-basalt-800">
        <div className="flex gap-2">
          <dt className="font-medium">Type:</dt>
          <dd>{proposal.label}</dd>
        </div>
        {proposal.notes && (
          <div className="flex gap-2">
            <dt className="font-medium">Details:</dt>
            <dd className="whitespace-pre-line">{proposal.notes}</dd>
          </div>
        )}
      </dl>

      {confirmState.status === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {confirmState.error}
        </p>
      )}

      <form action={confirmFormAction} className="flex gap-3">
        <input type="hidden" name="token" value={token ?? ""} />
        <input type="hidden" name="type" value={proposal.type} />
        <input type="hidden" name="notes" value={proposal.notes ?? ""} />
        <Button type="submit" size="sm" disabled={confirmPending}>
          {confirmPending ? "Submitting…" : "Confirm Request"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCancelled(true)}
          disabled={confirmPending}
        >
          Cancel
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
