"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Send, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiBadge } from "@/components/ui/ai-badge";
import { cn } from "@/lib/utils";
import type {
  ConciergeChatState,
  VerifyBookingState,
  ConfirmServiceRequestState,
  ServiceRequestProposalView,
} from "@/app/[locale]/(guest)/concierge/actions";

/**
 * M6 Phase b — the anonymous public concierge chat. All hotel-specific
 * content on screen (the assistant's replies) comes from the server action;
 * nothing hotel-specific is hardcoded here. The starter prompts below
 * (`STARTER_QUESTION_CATEGORIES`) are generic question templates, not
 * answers — every one of them is answered fresh by the server action on
 * click, exactly like a hand-typed question.
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
 *
 * M9d — visual/UX polish only. Every string `tests/e2e/concierge.spec.ts`
 * and `tests/e2e/xssRegression.spec.ts` locate by exact role/name/id/text
 * is preserved verbatim (the `role="log"` container, `input[name="message"]`/
 * `input[name="token"]`, the "Send"/"Verify"/"Verify My Booking"/"Cancel"/
 * "Confirm Request" button names, `#verify-reference`/`#verify-contact`,
 * "Booking verified"/"Request submitted"/"Review your service request").
 * `message`/`state`/`token` object shapes, the action props, and every
 * `useActionState` call are unchanged — this file only changes markup,
 * classNames, and added (never removed) copy.
 *
 * Multilingual Support Phase 2 — every static string below now comes from
 * the `Concierge` message catalog namespace via `useTranslations()`. This
 * stays safe for the locked e2e strings above because: (a) those tests
 * run against unprefixed/English routes, and the English catalog's values
 * were copied byte-for-byte from what used to be hardcoded here; (b) every
 * locked ATTRIBUTE (`role`, `name`, `id`) was never text and is untouched.
 * Non-English locales are free to translate all of this — nothing here
 * scopes to English only except the underlying test fixtures' own routes.
 */
/**
 * Guest-experience Phase A (Product Owner approval) — expanded from the
 * original 4 starter prompts to ~17, organized into topic categories so
 * the guest can scan them without a wall of buttons. The original 4 exact
 * strings ("What time is check-in?", "Tell me about the restaurant.",
 * "What facilities do you have?", "What room types do you offer?") are
 * preserved verbatim inside their categories below —
 * `tests/e2e/concierge.spec.ts`'s `getByRole("button", {name: <exact
 * string>})` assertions locate them by that exact text regardless of
 * which category groups them, and this presentation is deliberately
 * NOT a collapsible/accordion UI (every category and every chip renders
 * immediately, always visible) specifically so those assertions — which
 * check visibility right after `page.goto("/concierge")` with no prior
 * interaction — keep passing unmodified.
 *
 * Every question here was checked against (and, in a few cases, required
 * a small keyword/reply fix to) `src/lib/ai/providers/mock.ts` so it
 * produces a real, grounded, non-fallback answer under the deterministic
 * demo provider — see that file's own Phase A comments. Two questions
 * from the Product Owner's original candidate list are deliberately
 * excluded: a coffee-ceremony question (not an established hotel fact —
 * would risk a misleading answer) and "Is breakfast included?" (whether
 * it's included in the room rate is not an established fact either;
 * replaced with the answerable "What time is breakfast served?").
 *
 * Multilingual Support Phase 2 — each question now carries its own
 * translation key (`labelKey`, looked up in `Concierge.starterQuestions`)
 * alongside its fixed `en` text. `en` is what actually gets SUBMITTED as
 * the chat message regardless of UI locale — a deliberate Phase 2 design
 * choice, not dictated by the spec: the mock AI provider
 * (`src/lib/ai/providers/mock.ts`) matches on English keywords only, so
 * submitting a translated question would silently degrade to its fallback
 * "I don't know" answer for every non-English guest. Only the button's
 * DISPLAY label is translated; the grounded answer quality stays the same
 * in every locale. Real multilingual AI conversation is Phase 4.
 */
const STARTER_QUESTION_CATEGORIES = [
  {
    categoryKey: "roomsBooking",
    questions: [
      { labelKey: "roomTypes", en: "What room types do you offer?" },
      { labelKey: "familyRoom", en: "Which room is best for a family?" },
      { labelKey: "premiumRoom", en: "What is your most premium room?" },
      { labelKey: "checkInTime", en: "What time is check-in?" },
      { labelKey: "checkOutTime", en: "What time is check-out?" },
      { labelKey: "howToVerify", en: "How can I verify my booking?" },
    ],
  },
  {
    categoryKey: "dining",
    questions: [
      { labelKey: "aboutRestaurant", en: "Tell me about the restaurant." },
      { labelKey: "diningOptions", en: "What dining options do you have?" },
      { labelKey: "aboutBunaLounge", en: "Tell me about the Buna Lounge." },
      { labelKey: "breakfastTime", en: "What time is breakfast served?" },
    ],
  },
  {
    categoryKey: "hotelFacilities",
    questions: [
      { labelKey: "facilities", en: "What facilities do you have?" },
      { labelKey: "fitnessCenter", en: "Do you have a fitness center?" },
      { labelKey: "conferenceFacilities", en: "Do you have conference facilities?" },
      { labelKey: "businessCenter", en: "Do you have a business center?" },
    ],
  },
  {
    categoryKey: "guestServices",
    questions: [
      { labelKey: "airportPickup", en: "Do you provide airport pickup?" },
      { labelKey: "guestServices", en: "What guest services are available?" },
      { labelKey: "requestService", en: "How can I request a hotel service?" },
    ],
  },
] as const;

const MAX_MESSAGE_LENGTH = 500;

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
  const t = useTranslations("Concierge");
  const [state, formAction, isPending] = useActionState(action, initialChatState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  // Presentation only — a live mirror of the input's own length against the
  // existing `maxLength={500}` attribute below. Deliberately imperative
  // (a ref write, not `useState`) rather than triggering a React
  // re-render on every keystroke: this component's hidden `token` input
  // is React-controlled (`value={token ?? ""}`), and a re-render while
  // `token` state hasn't changed would re-assert that same value —
  // harmless in normal use, but it would also silently overwrite a
  // directly-DOM-injected value (as `tests/e2e/concierge.spec.ts`'s
  // tampered-token test does) before the form submits. A ref write here
  // causes no re-render at all, so that pre-existing test behavior (and
  // the hidden field's own value) is completely unaffected. Does not
  // change what is submitted or how the server enforces the limit
  // (`src/lib/ai/messageBounds.ts`, untouched).
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

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-basalt-700/15 bg-parchment-50 shadow-sm">
      {/* Chat header — pure presentation, gives the assistant a clear
          product identity instead of reading as a generic chat widget. */}
      <div className="flex items-center gap-3 border-b border-basalt-700/10 bg-parchment-100 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ochre-500/15">
          <Sparkles className="h-5 w-5 text-ochre-600" aria-hidden />
        </div>
        <div className="flex-1">
          <p className="font-display text-base text-basalt-950">{t("chatHeaderTitle")}</p>
          <p className="text-xs text-basalt-700">{t("chatHeaderSubtitle", { hotelName })}</p>
        </div>
        <AiBadge className="hidden sm:inline-flex">{t("aiPowered")}</AiBadge>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label={t("conversationLabel")}
          className="flex max-h-[28rem] min-h-[16rem] flex-col gap-3 overflow-y-auto rounded-lg border border-basalt-700/15 bg-parchment-50 p-4"
        >
          <ConciergeBubble role="assistant">{t("welcomeMessage", { hotelName })}</ConciergeBubble>

          {state.messages.map((message, index) => (
            <ConciergeBubble key={index} role={message.role}>
              {message.content}
            </ConciergeBubble>
          ))}

          {isPending && (
            <ConciergeBubble role="assistant" pending>
              {t("thinking")}
            </ConciergeBubble>
          )}
        </div>

        {state.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.error}
          </p>
        )}

        {/*
          Pre-push security-review correction: also require `token` here, not
          just `state.proposal`. Server-side, confirming with no token was
          always safely rejected (`confirmServiceRequestAction` re-verifies
          the token fresh regardless) — but without this guard, pressing
          "Clear verification" only cleared `token`, leaving a now-unconfirmable
          proposal card visibly rendered and looking confirmable. Requiring
          both means clearing verification immediately hides the card too, so
          the UI never shows a proposal the server can no longer honor.
        */}
        {state.proposal && token && (
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
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-basalt-700">{t("tryAsking")}</p>
            {STARTER_QUESTION_CATEGORIES.map((category) => (
              <div key={category.categoryKey} className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-basalt-700/70">{t(`categories.${category.categoryKey}`)}</p>
                <div className="flex flex-wrap gap-2">
                  {category.questions.map((question) => (
                    <button
                      key={question.labelKey}
                      type="button"
                      onClick={() => askStarter(question.en)}
                      disabled={isPending}
                      className="rounded-full border border-basalt-700/25 bg-parchment-50 px-4 py-1.5 text-sm text-basalt-800 transition-colors hover:bg-parchment-100 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {t(`starterQuestions.${question.labelKey}`)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <VerifyBookingPanel
          verifyAction={verifyAction}
          token={token}
          onVerified={setToken}
          onClear={() => setToken(undefined)}
        />

        <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
          <input type="hidden" name="token" value={token ?? ""} />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="concierge-message" className="sr-only">
                {t("yourMessage")}
              </Label>
              <Input
                id="concierge-message"
                name="message"
                ref={inputRef}
                placeholder={t("messagePlaceholder")}
                maxLength={MAX_MESSAGE_LENGTH}
                autoComplete="off"
                disabled={isPending}
                onChange={(e) => setCounter(e.target.value.length)}
                required
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                t("sending")
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden />
                  {t("send")}
                </>
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-basalt-700/60">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {t("groundedNote")}
            </span>
            <span ref={counterRef}>0/{MAX_MESSAGE_LENGTH}</span>
          </div>
        </form>
      </div>
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
  const t = useTranslations("Concierge");
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
      <div className="flex items-center justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-2.5 text-sm text-green-800">
        <p role="status" className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          {t("bookingVerified")}
        </p>
        <button type="button" onClick={onClear} className="shrink-0 font-medium underline hover:no-underline">
          {t("clearVerification")}
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-basalt-700/25 bg-parchment-50 px-4 py-1.5 text-sm font-medium text-basalt-800 transition-colors hover:bg-parchment-100"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        {t("verifyMyBooking")}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={verifyFormAction}
      className="flex flex-col gap-3 rounded-lg border border-basalt-700/15 bg-parchment-50 p-4"
    >
      <div>
        <p className="text-sm font-medium text-basalt-900">{t("verifyBookingHeading")}</p>
        <p className="mt-0.5 text-xs text-basalt-700">{t("verifyBookingDescription")}</p>
      </div>
      {verifyState.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {verifyState.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="verify-reference">{t("bookingReferenceLabel")}</Label>
          <Input id="verify-reference" name="bookingReference" autoComplete="off" required disabled={verifyPending} />
        </div>
        <div>
          <Label htmlFor="verify-contact">{t("contactFieldLabel")}</Label>
          <Input id="verify-contact" name="contact" autoComplete="off" required disabled={verifyPending} />
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={verifyPending}>
          {verifyPending ? t("verifying") : t("verify")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)} disabled={verifyPending}>
          {t("cancel")}
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
  const t = useTranslations("Concierge");
  const [confirmState, confirmFormAction, confirmPending] = useActionState(confirmAction, initialConfirmState);
  const [cancelled, setCancelled] = useState(false);

  if (cancelled) return null;

  if (confirmState.status === "success") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p role="status" className="font-medium">
            {t("requestSubmitted", { type: confirmState.requestType ?? "", status: confirmState.requestStatus ?? "" })}
          </p>
          <p className="mt-1">{t("frontDeskFollowUp")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ochre-500/40 bg-parchment-100 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ochre-600" aria-hidden />
        <p className="text-sm font-medium text-basalt-900">{t("reviewServiceRequest")}</p>
      </div>
      <dl className="grid gap-1 text-sm text-basalt-800">
        <div className="flex gap-2">
          <dt className="font-medium">{t("type")}</dt>
          {/* Multilingual Support Phase 4 — `proposal.label` (from the AI
              tool's own output) is the canonical English label; the
              guest-facing DISPLAY uses the translated
              Concierge.serviceRequestTypes.* catalog instead, keyed by the
              canonical `proposal.type` enum value — the same "canonical
              operation value stays language-neutral, only presentation is
              translated" separation the hidden `type` form field below
              already relies on. Falls back to the tool's own English
              label if a type is ever unrecognized by the catalog. */}
          <dd>{t.has(`serviceRequestTypes.${proposal.type}`) ? t(`serviceRequestTypes.${proposal.type}`) : proposal.label}</dd>
        </div>
        {proposal.notes && (
          <div className="flex gap-2">
            <dt className="font-medium">{t("details")}</dt>
            <dd className="whitespace-pre-line">{proposal.notes}</dd>
          </div>
        )}
      </dl>

      {confirmState.status === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {confirmState.error}
        </p>
      )}

      <form action={confirmFormAction} className="flex flex-col gap-2">
        <div className="flex gap-3">
          <input type="hidden" name="token" value={token ?? ""} />
          <input type="hidden" name="type" value={proposal.type} />
          <input type="hidden" name="notes" value={proposal.notes ?? ""} />
          <Button type="submit" size="sm" disabled={confirmPending}>
            {confirmPending ? t("submitting") : t("confirmRequest")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCancelled(true)} disabled={confirmPending}>
            {t("cancel")}
          </Button>
        </div>
        <p className="text-xs text-basalt-700/70">{t("nothingSubmittedNote")}</p>
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
    <div className={cn("flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ochre-500/15">
          <Sparkles className="h-3.5 w-3.5 text-ochre-600" aria-hidden />
        </div>
      )}
      <p
        className={cn(
          "max-w-[80%] whitespace-pre-line rounded-lg px-4 py-2 text-sm",
          isUser ? "bg-ochre-500 text-parchment-50" : "bg-parchment-100 text-basalt-900",
          pending && "italic text-basalt-700/70"
        )}
      >
        {children}
      </p>
    </div>
  );
}
