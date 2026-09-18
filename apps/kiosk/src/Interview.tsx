import { useEffect, useRef, useState, type RefObject } from "react";
import { CHIEF_COMPLAINT_STARTER_CODES } from "@medikiosk/clinical-schema";
import {
  clinicalTermLabel,
  hasKey,
  type RegistrationLocale,
} from "@medikiosk/i18n";
import {
  ApiError,
  type Encounter,
  type KioskApi,
  type NextResult,
  type Question,
  type QuestionOption,
  type Session,
  type SubmitResult,
} from "./api";
import type { AsrTranscript } from "@medikiosk/ai";
import {
  createSpeechSession,
  needsConfirmation,
  speak,
  speechAvailable,
  stopSpeaking,
  type MicErrorCode,
  type SpeechSession,
} from "./voice";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

type ResponseState =
  "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN" | "NOT_APPLICABLE";

type MicState = "idle" | "listening" | "transcribing";

/** A recognised voice answer captured immutably, awaiting patient confirmation. */
interface PendingVoice {
  text: string;
  confidence: number | null;
}

/** Question kinds that take a typed text/duration/number/date answer. */
const TEXT_KINDS: Record<string, true> = {
  DURATION: true,
  NUMBER: true,
  FREE_TEXT: true,
  DATE: true,
};

/** Wrap a captured voice answer as the AsrTranscript `needsConfirmation` reads. */
function voiceAsTranscript(
  voice: PendingVoice,
  language: string,
): AsrTranscript {
  return {
    isFinal: true,
    text: voice.text,
    language,
    confidence: voice.confidence,
    provider: "webspeech",
    model: "browser-webspeech",
    durationMs: 0,
  };
}

/** Map a mic failure to the i18n key shown as a notice (touch always remains). */
function voiceErrorKey(code: MicErrorCode): string {
  switch (code) {
    case "PERMISSION_DENIED":
      return "voice.mic_permission";
    case "NOT_SUPPORTED":
      return "voice.mic_unsupported";
    default:
      return "voice.no_speech";
  }
}

/**
 * Patient-facing rendering of the encounter's adaptive interview.
 *
 * This component is a pure client of the runtime: it renders whatever
 * `GET .../interview/next` returns and records whatever the patient taps. It
 * never decides which question comes next, never branches, and carries no
 * hardcoded question flow. The only input it chooses is the chief complaint
 * that opens the encounter (a patient input surfaced from the canonical
 * starter list); the engine owns every question after that.
 */
export function Interview({
  session,
  patientId,
  locale,
  t,
  api,
  onExpired,
  onSubmitted,
}: {
  session: Session;
  patientId: string;
  locale: RegistrationLocale;
  t: Translate;
  api: KioskApi;
  onExpired: () => void;
  onSubmitted: (result: SubmitResult) => void;
}) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [next, setNext] = useState<NextResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [clarifying, setClarifying] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [multiKeys, setMultiKeys] = useState<string[]>([]);
  const lastAnswered = useRef<{ key: string; raw: string } | null>(null);
  const pendingComplaint = useRef<string | null>(null);
  const generation = useRef(0);
  const speechSession = useRef<SpeechSession | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const [micState, setMicState] = useState<MicState>("idle");
  const [partial, setPartial] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null);
  const [reading, setReading] = useState(false);
  const micSupported = speechAvailable(locale);

  const expireSession = () => {
    ++generation.current;
    onExpired();
  };

  const spin = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    setError(false);
    const epoch = generation.current;
    try {
      return await action();
    } catch (cause) {
      if (generation.current !== epoch) return undefined;
      if (
        cause instanceof ApiError &&
        (cause.status === 401 ||
          cause.code === "SESSION_EXPIRED" ||
          cause.code === "SESSION_WIPED")
      ) {
        expireSession();
        return undefined;
      }
      setError(true);
      return undefined;
    } finally {
      if (generation.current === epoch) setBusy(false);
    }
  };

  const applyNext = (result: NextResult) => {
    stopMicrophone();
    resetVoiceState();
    setNext(result);
    const question = result.question;
    setMultiKeys([]);
    setClarifying(
      question &&
        question.askCount > 1 &&
        lastAnswered.current?.key === question.key
        ? lastAnswered.current.raw
        : null,
    );
    if (question) setTextDraft("");
  };

  /** Stop any in-flight read-aloud and reset the reading toggle. */
  const stopReading = () => {
    if (!reading && !("speechSynthesis" in window)) return;
    stopSpeaking();
    setReading(false);
  };

  /** Halt the active speech session, if any. */
  const stopMicrophone = () => {
    speechSession.current?.stop();
    speechSession.current = null;
  };

  const resetVoiceState = () => {
    setMicState("idle");
    setPartial("");
    setVoiceError(null);
    setPendingVoice(null);
  };

  const fetchNext = () =>
    void spin(async () => {
      if (!encounter) return;
      applyNext(await api.nextQuestion(encounter.encounterId, session.token));
    });

  const beginInterview = (code: string) =>
    void spin(async () => {
      pendingComplaint.current = code;
      const opened = await api.createEncounter({
        sessionId: session.sessionId,
        token: session.token,
        patientId,
        locale,
        chiefComplaintCodes: [code],
      });
      applyNext(await api.nextQuestion(opened.encounterId, session.token));
      setEncounter(opened);
    });

  /** Shared submission for touch and voice answers; the raw answer is never
   * rewritten after capture — a reconciled voice answer is sent verbatim. */
  const sendRaw = (
    rawAnswer: string,
    state: ResponseState | undefined,
    modality: "VOICE" | "TOUCH",
    asrConfidence?: number,
  ) =>
    void spin(async () => {
      if (!encounter || !next?.question) return;
      stopReading();
      const questionKey = next.question.key;
      try {
        await api.respond({
          encounterId: encounter.encounterId,
          token: session.token,
          questionKey,
          state,
          rawAnswer,
          modality,
          ...(asrConfidence === undefined ? {} : { asrConfidence }),
        });
      } catch (cause) {
        if (
          cause instanceof ApiError &&
          (cause.code === "QUESTION_NOT_ACTIVE" ||
            cause.code === "QUESTION_ALREADY_COMPLETED")
        ) {
          // The engine moved on (or a retry raced a stale view) — re-render.
          applyNext(
            await api.nextQuestion(encounter.encounterId, session.token),
          );
          return;
        }
        throw cause;
      }
      lastAnswered.current = { key: questionKey, raw: rawAnswer };
      applyNext(await api.nextQuestion(encounter.encounterId, session.token));
    });

  const send = (rawAnswer: string, state?: ResponseState) =>
    sendRaw(rawAnswer, state, "TOUCH");

  /** Submit a voice answer exactly as captured (immutable), after confirmation. */
  const sendVoice = (voice: PendingVoice) => {
    setPendingVoice(null);
    sendRaw(voice.text, "ANSWERED", "VOICE", voice.confidence ?? undefined);
  };

  const startListening = () => {
    if (busy || !micSupported) return;
    stopReading();
    setVoiceError(null);
    setPartial("");
    setPendingVoice(null);
    setMicState("listening");
    const session = createSpeechSession(locale, {
      onPartial: (text) => setPartial(text),
      onFinal: (text) => {
        stopMicrophone();
        setMicState("transcribing");
        const voice: PendingVoice = { text, confidence: null };
        // Browser recognisers give no confidence → confirmation always
        // offered. needsConfirmation is still honoured for future providers.
        if (needsConfirmation(voiceAsTranscript(voice, locale))) {
          setMicState("idle");
          setPendingVoice(voice);
        } else {
          sendVoice(voice);
        }
      },
      onError: (code) => {
        stopMicrophone();
        setMicState("idle");
        setVoiceError(voiceErrorKey(code));
      },
      onEnd: () => {
        setMicState((current) => (current === "listening" ? "idle" : current));
      },
    });
    speechSession.current = session;
    session.start();
  };

  /** Read the prompt (+ option labels) aloud; toggles off on interaction. */
  const readAloud = () => {
    if (reading) {
      stopReading();
      return;
    }
    if (!next?.question) return;
    const q = next.question;
    stopSpeaking();
    const labels = q.options.map((option) =>
      optionLabel(option, q.kind, locale, t),
    );
    speak([t(q.promptKey), ...labels].join(". "), locale, () =>
      setReading(false),
    );
    setReading(true);
  };

  // Clean up any active speech/TTS when the interview unmounts.
  useEffect(
    () => () => {
      speechSession.current?.stop();
      speechSession.current = null;
      stopSpeaking();
    },
    [],
  );

  const finishAndSubmit = () =>
    void spin(async () => {
      if (!encounter) return;
      onSubmitted(
        await api.submitEncounter(encounter.encounterId, session.token),
      );
    });

  if (!encounter) {
    return (
      <>
        {error ? (
          <ErrorNotice
            t={t}
            onRetry={() => {
              setError(false);
              if (pendingComplaint.current)
                beginInterview(pendingComplaint.current);
            }}
          />
        ) : null}
        <ComplaintPicker
          locale={locale}
          t={t}
          busy={busy}
          onStart={beginInterview}
        />
      </>
    );
  }

  if (!next) {
    return (
      <div role="status" className="pending">
        <span aria-hidden="true" className="loading-dot" />
        {t("interview.loading")}
      </div>
    );
  }

  if (next.question === null) {
    // Completion screen: the engine has nothing left to ask; submission is never blocked.
    const outstanding = next.completion.outstandingRequired;
    return (
      <>
        <div className="completion-card">
          <h2>
            {next.completion.status === "COMPLETE"
              ? t("interview.complete")
              : t("interview.incomplete")}
          </h2>
          {outstanding.length > 0 ? (
            <p className="outstanding-note">
              {t("interview.outstanding", { count: outstanding.length })}
            </p>
          ) : null}
        </div>
        {showSafety(t, next)}
        {error ? (
          <ErrorNotice t={t} onRetry={fetchNext} />
        ) : (
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={finishAndSubmit}
            >
              {t("interview.submit")}
            </button>
          </div>
        )}
        <p className="caption">{t("interview.ready_for_review")}</p>
      </>
    );
  }

  const question = next.question;
  return (
    <div className="interview">
      {showSafety(t, next)}
      <div className="interview-progress">
        <span>
          {t("interview.question_of", {
            current: Math.min(
              next.progress.asked + 1,
              Math.max(next.progress.activeCount, 1),
            ),
            total: Math.max(next.progress.activeCount, 1),
          })}
        </span>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.max(next.progress.requiredTotal, 1)}
          aria-valuenow={Math.min(
            next.progress.requiredClosed,
            next.progress.requiredTotal,
          )}
          aria-label={t("interview.question_of", {
            current: next.progress.requiredClosed,
            total: next.progress.requiredTotal,
          })}
        >
          <div
            className="progress-fill"
            style={{
              width: `${Math.round(
                next.progress.requiredTotal === 0
                  ? 100
                  : (next.progress.requiredClosed /
                      next.progress.requiredTotal) *
                      100,
              )}%`,
            }}
          />
        </div>
      </div>
      {clarifying ? (
        <div className="notice" role="status">
          <p>{t("interview.clarification_notice")}</p>
          <p className="caption">
            {t("interview.previous_answer", { answer: clarifying })}
          </p>
        </div>
      ) : null}
      {error ? <ErrorNotice t={t} onRetry={fetchNext} /> : null}
      {busy ? (
        <p className="pending" role="status">
          <span aria-hidden="true" className="loading-dot" />
          {t("interview.loading")}
        </p>
      ) : null}
      <h2 className="question-prompt">{t(question.promptKey)}</h2>
      <div className="question-toolbar">
        <button
          className={`read-aloud ${reading ? "active" : ""}`}
          aria-pressed={reading}
          onClick={readAloud}
        >
          <span aria-hidden="true">🔊</span>
          {t(reading ? "voice.stop_reading" : "voice.read_aloud")}
        </button>
        {micSupported &&
        question.kind !== "INSTRUCTION" &&
        question.kind !== "DOCUMENT_UPLOAD" ? (
          <div className="mic-control">
            {micState === "listening" ? (
              <button
                className="mic-button active"
                disabled={busy}
                onClick={() => {
                  stopMicrophone();
                  resetVoiceState();
                }}
              >
                <span aria-hidden="true">🎤</span>
                {t("voice.stop_listening")}
              </button>
            ) : (
              <button
                className="mic-button"
                disabled={busy || micState !== "idle"}
                onClick={startListening}
                aria-label={t("voice.listen")}
              >
                <span aria-hidden="true">🎤</span>
                {t("voice.listen")}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {micState === "listening" && partial ? (
        <p className="voice-partial" aria-live="polite">
          {partial}
        </p>
      ) : null}
      {micState === "transcribing" ? (
        <p className="voice-partial" aria-live="polite">
          <span aria-hidden="true" className="loading-dot" />
          {t("voice.transcribing")}
        </p>
      ) : null}
      {voiceError ? (
        <p className="notice" role="status">
          {t(voiceError)}
        </p>
      ) : null}
      {pendingVoice ? (
        <div className="voice-confirm" role="status">
          <p>{t("voice.confirm_answer")}</p>
          <p className="voice-transcript">{pendingVoice.text}</p>
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => sendVoice(pendingVoice)}
            >
              {t("voice.confirm_yes")}
            </button>
            <button disabled={busy} onClick={startListening}>
              {t("voice.retry_voice")}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                resetVoiceState();
                if (TEXT_KINDS[question.kind]) textInput.current?.focus();
              }}
            >
              {t("voice.type_instead")}
            </button>
          </div>
        </div>
      ) : null}
      <QuestionBody
        question={question}
        locale={locale}
        t={t}
        busy={busy}
        textDraft={textDraft}
        inputRef={textInput}
        onTextChange={setTextDraft}
        onAnswer={(value) => void send(value)}
        onOption={(option) => void send(option.key)}
        selectedKeys={multiKeys}
        onToggle={(key) =>
          setMultiKeys((previous) =>
            previous.includes(key)
              ? previous.filter((item) => item !== key)
              : [...previous, key],
          )
        }
        onAcknowledge={() => void send("ok")}
        onSkip={() => void send("", "SKIPPED")}
        onDecline={() => void send("", "DECLINED")}
        onUnknown={() => void send("", "UNKNOWN")}
      />
      {question.kind === "MULTI_CHOICE" ? (
        <button
          className="primary"
          disabled={busy || multiKeys.length === 0}
          onClick={() => void send(multiKeys.join("; "))}
        >
          {t("interview.acknowledge")}
        </button>
      ) : null}
      <div className="secondary-actions">
        {question.kind !== "DOCUMENT_UPLOAD" ? (
          <button disabled={busy} onClick={() => void send("", "UNKNOWN")}>
            {t("interview.unknown")}
          </button>
        ) : null}
        <button disabled={busy} onClick={() => void send("", "SKIPPED")}>
          {t("interview.skip")}
        </button>
        <button disabled={busy} onClick={() => void send("", "DECLINED")}>
          {t("interview.decline")}
        </button>
      </div>
    </div>
  );
}

function showSafety(t: Translate, next: NextResult) {
  if (next.safetyStatus === "GREEN" && !next.requiresHumanReview) return null;
  return (
    <div className="notice priority" role="status">
      <strong>{t("interview.priority_alert")}</strong>
    </div>
  );
}

function ErrorNotice({ t, onRetry }: { t: Translate; onRetry: () => void }) {
  return (
    <div className="notice error" role="alert">
      <p>{t("interview.error")}</p>
      <button onClick={onRetry}>{t("interview.retry")}</button>
    </div>
  );
}

/** Best available label for an option: translated severity, translated key, or the key's slug. */
function optionLabel(
  option: QuestionOption,
  kind: string,
  locale: RegistrationLocale,
  t: Translate,
): string {
  if (kind === "SEVERITY" && option.severity)
    return t(`severity.${option.severity.toLowerCase()}`);
  if (hasKey(locale, option.key)) return t(option.key);
  const slug = option.key.split(".").at(-1) ?? option.key;
  return slug.replace(/_/g, " ");
}

function QuestionBody({
  question,
  locale,
  t,
  busy,
  textDraft,
  inputRef,
  onTextChange,
  onAnswer,
  onOption,
  selectedKeys,
  onToggle,
  onAcknowledge,
  onSkip,
  onDecline,
  onUnknown,
}: {
  question: Question;
  locale: RegistrationLocale;
  t: Translate;
  busy: boolean;
  textDraft: string;
  inputRef?: RefObject<HTMLInputElement>;
  onTextChange: (value: string) => void;
  onAnswer: (value: string) => void;
  onOption: (option: QuestionOption) => void;
  selectedKeys: readonly string[];
  onToggle: (key: string) => void;
  onAcknowledge: () => void;
  onSkip: () => void;
  onDecline: () => void;
  onUnknown: () => void;
}) {
  if (question.kind === "YES_NO")
    return (
      <div className="options-grid big">
        <button
          className="option"
          disabled={busy}
          onClick={() => onAnswer("yes")}
        >
          {t("interview.yes")}
        </button>
        <button
          className="option"
          disabled={busy}
          onClick={() => onAnswer("no")}
        >
          {t("interview.no")}
        </button>
      </div>
    );

  if (question.kind === "DOCUMENT_UPLOAD")
    return (
      <div className="notice">
        <p>{t("interview.unsupported_document")}</p>
        <div className="secondary-actions">
          <button disabled={busy} onClick={onSkip}>
            {t("interview.skip")}
          </button>
          <button disabled={busy} onClick={onDecline}>
            {t("interview.decline")}
          </button>
        </div>
      </div>
    );

  if (
    question.kind === "SINGLE_CHOICE" ||
    question.kind === "BODY_SITE" ||
    question.kind === "SEVERITY"
  )
    return (
      <div className="options-grid" aria-label={t(question.promptKey)}>
        {question.options.map((option) => (
          <button
            key={option.key}
            className="option"
            disabled={busy}
            onClick={() => onOption(option)}
          >
            {optionLabel(option, question.kind, locale, t)}
          </button>
        ))}
      </div>
    );

  // MULTI_CHOICE: tap to select any number of options, then confirm. The selected keys are
  // joined with "; " and persisted by the engine as the patient's exact selection.
  if (question.kind === "MULTI_CHOICE")
    return (
      <div
        className="options-grid"
        role="group"
        aria-label={t(question.promptKey)}
      >
        {question.options.map((option) => {
          const selected = selectedKeys.includes(option.key);
          return (
            <button
              key={option.key}
              className={`option ${selected ? "selected" : ""}`}
              disabled={busy}
              aria-pressed={selected}
              onClick={() => onToggle(option.key)}
            >
              {optionLabel(option, question.kind, locale, t)}
            </button>
          );
        })}
      </div>
    );

  if (question.kind === "INSTRUCTION")
    return (
      <div className="options-grid big">
        <button
          className="option primary"
          disabled={busy}
          onClick={onAcknowledge}
        >
          {t("interview.acknowledge")}
        </button>
        <button disabled={busy} onClick={onUnknown}>
          {t("interview.unknown")}
        </button>
      </div>
    );

  if (TEXT_KINDS[question.kind])
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (textDraft.trim()) onAnswer(textDraft.trim());
        }}
      >
        <input
          type={question.kind === "DATE" ? "date" : "text"}
          inputMode={
            question.kind === "NUMBER" || question.kind === "DURATION"
              ? "numeric"
              : "text"
          }
          ref={inputRef}
          value={textDraft}
          disabled={busy}
          placeholder={t(question.promptKey)}
          onChange={(event) => onTextChange(event.target.value)}
        />
        <div className="actions">
          <button
            className="primary"
            disabled={busy || !textDraft.trim()}
            type="submit"
          >
            {t("interview.acknowledge")}
          </button>
        </div>
      </form>
    );

  // Unknown kind: offer the non-coercive terminal states only.
  return (
    <div className="secondary-actions">
      <button disabled={busy} onClick={onSkip}>
        {t("interview.skip")}
      </button>
      <button disabled={busy} onClick={onDecline}>
        {t("interview.decline")}
      </button>
    </div>
  );
}

/** Chief-complaint picker shown before the engine begins (patient input, not branching). */
export function ComplaintPicker({
  locale,
  t,
  busy,
  onStart,
}: {
  locale: RegistrationLocale;
  t: Translate;
  busy: boolean;
  onStart: (code: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="complaint-picker">
      <h2>{t("interview.complaint")}</h2>
      <p className="lead">{t("interview.complaint_detail")}</p>
      <div className="options-grid">
        {CHIEF_COMPLAINT_STARTER_CODES.map((code) => (
          <button
            key={code}
            type="button"
            className={`option ${selected === code ? "selected" : ""}`}
            disabled={busy}
            aria-pressed={selected === code}
            onClick={() => setSelected(code)}
          >
            {clinicalTermLabel(code, locale)}
          </button>
        ))}
      </div>
      <div className="actions">
        <button
          className="primary"
          disabled={busy || !selected}
          onClick={() => selected && onStart(selected)}
        >
          {t("interview.begin")}
        </button>
      </div>
    </div>
  );
}
