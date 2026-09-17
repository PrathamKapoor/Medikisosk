import { useRef, useState } from "react";
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

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

type ResponseState =
  "ANSWERED" | "SKIPPED" | "DECLINED" | "UNKNOWN" | "NOT_APPLICABLE";

/** Question kinds that take a typed text/duration/number/date answer. */
const TEXT_KINDS: Record<string, true> = {
  DURATION: true,
  NUMBER: true,
  FREE_TEXT: true,
  DATE: true,
};

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

  const send = (rawAnswer: string, state?: ResponseState) =>
    void spin(async () => {
      if (!encounter || !next?.question) return;
      const questionKey = next.question.key;
      try {
        await api.respond({
          encounterId: encounter.encounterId,
          token: session.token,
          questionKey,
          ...(state ? { state } : { rawAnswer }),
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
      <QuestionBody
        question={question}
        locale={locale}
        t={t}
        busy={busy}
        textDraft={textDraft}
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
