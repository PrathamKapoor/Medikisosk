import { useEffect, useState } from "react";
import type { RegistrationLocale } from "@medikiosk/i18n";
import { ApiError, type KioskApi, type Review, type SubmitResult } from "./api";
import { speak, stopSpeaking } from "./voice";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="review-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Empty({ t }: { t: Translate }) {
  return <p className="caption">{t("details.not_provided")}</p>;
}

/**
 * Pre-submit review: the complete assembled record, an explicit confirmation gate, and then
 * submission. Nothing here is editable in place — corrections go back to the details steps —
 * so the confirmed record always matches what the patient saw.
 */
export function ReviewScreen({
  encounterId,
  token,
  locale,
  t,
  api,
  onBack,
  onSubmitted,
}: {
  encounterId: string;
  token: string;
  locale: RegistrationLocale;
  t: Translate;
  api: KioskApi;
  onBack: () => void;
  onSubmitted: (result: SubmitResult) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setReview(await api.getReview(encounterId, token));
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.serverMessage
          ? t("details.review_server_error", {
              message: cause.serverMessage,
            })
          : t("details.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    return () => stopSpeaking();
  }, [encounterId]);

  const readAloud = () => {
    if (reading) {
      stopSpeaking();
      setReading(false);
      return;
    }
    if (!review) return;
    const lines = [
      t("details.review_title"),
      `${t("details.review_complaint")}: ${review.encounter.chiefComplaintVerbatim ?? review.encounter.chiefComplaintCodes.join(", ")}`,
      `${t("details.review_medications")}: ${review.medications.map((m) => m.name).join(", ") || t("details.not_provided")}`,
      `${t("details.review_allergies")}: ${review.allergies.map((a) => a.name ?? "").join(", ") || t("details.not_provided")}`,
    ];
    speak(lines.join(". "), locale, () => setReading(false));
    setReading(true);
  };

  const confirmAndSubmit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmReview(encounterId, token);
      onSubmitted(await api.submitEncounter(encounterId, token));
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 401 ||
          cause.code === "SESSION_EXPIRED" ||
          cause.code === "SESSION_WIPED")
      ) {
        // The App shell owns expiry handling; surface a retryable error here.
        setError(t("details.error"));
      } else {
        setError(
          cause instanceof ApiError && cause.serverMessage
            ? t("details.review_server_error", {
                message: cause.serverMessage,
              })
            : t("details.error"),
        );
      }
      setBusy(false);
    }
  };

  if (!review) {
    return (
      <div role="status" className="pending">
        <span aria-hidden="true" className="loading-dot" />
        {t("common.loading")}
        {error ? (
          <div className="notice error" role="alert">
            <p>{error}</p>
            <button onClick={load}>{t("common.retry")}</button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="review">
      <h2>{t("details.review_title")}</h2>
      <p className="lead">{t("details.review_lead")}</p>
      <div className="question-toolbar">
        <button
          className={`read-aloud ${reading ? "active" : ""}`}
          aria-pressed={reading}
          onClick={readAloud}
        >
          <span aria-hidden="true">🔊</span>
          {t(reading ? "voice.stop_reading" : "voice.read_aloud")}
        </button>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <Section title={t("details.review_identity")}>
        <p>
          {review.patient.displayName ?? t("details.not_provided")}
          {review.patient.ageYears !== null
            ? ` · ${review.patient.ageYears}`
            : ""}
          {review.patient.sex ? ` · ${review.patient.sex}` : ""}
        </p>
      </Section>
      <Section title={t("details.review_complaint")}>
        <p>
          {review.encounter.chiefComplaintVerbatim ??
            review.encounter.chiefComplaintCodes.join(", ")}
        </p>
      </Section>
      <Section title={t("details.review_answers")}>
        {review.responses.length > 0 ? (
          <ul className="entry-list static">
            {review.responses.slice(0, 12).map((response, index) => (
              <li key={`${response.questionKey}-${index}`}>
                <span>{response.rawAnswer}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty t={t} />
        )}
      </Section>
      <Section title={t("details.review_history")}>
        {review.history.length > 0 ? (
          <ul className="entry-list static">
            {review.history.map((entry) => (
              <li key={entry.id}>
                <span>{entry.displayName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty t={t} />
        )}
      </Section>
      <Section title={t("details.review_medications")}>
        {review.medications.length > 0 ? (
          <ul className="entry-list static">
            {review.medications.map((entry) => (
              <li key={entry.id}>
                <span>{entry.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty t={t} />
        )}
      </Section>
      <Section title={t("details.review_allergies")}>
        {review.allergies.length > 0 ? (
          <ul className="entry-list static">
            {review.allergies.map((entry) => (
              <li key={entry.id}>
                <span>{entry.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty t={t} />
        )}
      </Section>
      <Section title={t("details.review_vitals")}>
        {review.vitals.length > 0 ? (
          <ul className="entry-list static">
            {review.vitals.map((vital) => (
              <li key={vital.id}>
                <span>
                  {vital.code}
                  {vital.componentCode ? ` (${vital.componentCode})` : ""}:{" "}
                  {vital.value} {vital.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty t={t} />
        )}
      </Section>
      <Section title={t("details.review_documents")}>
        {review.documents.length > 0 ? (
          <ul className="entry-list static">
            {review.documents.map((document) => (
              <li key={document.id}>
                <span>
                  {document.documentType} — {document.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty t={t} />
        )}
      </Section>
      <Section title={t("details.review_safety")}>
        {review.safety && review.safety.level !== "GREEN" ? (
          <div className="notice priority" role="status">
            {t("interview.priority_alert")}
          </div>
        ) : (
          <p className="caption">{t("details.review_safety_none")}</p>
        )}
      </Section>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={confirmAndSubmit}>
          {t("details.review_confirm")}
        </button>
        <button disabled={busy} onClick={onBack}>
          {t("details.review_back")}
        </button>
      </div>
    </div>
  );
}
