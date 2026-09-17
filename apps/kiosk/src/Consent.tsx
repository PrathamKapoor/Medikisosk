import type { ConsentRecord, ConsentVersion, Decision } from "./api";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;
export function categoryLabel(category: string, t: Translate): string {
  return t(
    category === "SESSION_METRICS"
      ? "registration.category.session_metrics"
      : `consent.category.${category.toLowerCase()}`,
  );
}
export function ConsentForm({
  version,
  decisions,
  onChange,
  onSave,
  busy,
  t,
}: {
  version: ConsentVersion;
  decisions: Decision[];
  onChange: (decisions: Decision[]) => void;
  onSave: (decline: boolean) => void;
  busy: boolean;
  t: Translate;
}) {
  return (
    <>
      <p className="lead">{t("registration.consent_intro")}</p>
      <p className="caption">
        {t("registration.version", {
          version: version.consentVersion,
          translation: version.translationVersion,
        })}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(false);
        }}
      >
        <fieldset disabled={busy} className="choice-fields">
          {version.purposes.map((purpose) => {
            const decision = decisions.find(
              (item) => item.purpose === purpose.key,
            );
            const selected = decision?.categories ?? [];
            const update = (next: Decision) =>
              onChange(
                decisions.map((item) =>
                  item.purpose === purpose.key ? next : item,
                ),
              );
            return (
              <fieldset className="purpose-card" key={purpose.key}>
                <legend>{t(purpose.statementKey)}</legend>
                <p>{purpose.statement}</p>
                <p className="caption">
                  {t(
                    purpose.required
                      ? "registration.required"
                      : "common.optional",
                  )}
                </p>
                <dl className="purpose-detail">
                  <div>
                    <dt>{t("registration.action")}</dt>
                    <dd>{t(`registration.scope.${purpose.action}`)}</dd>
                  </div>
                  <div>
                    <dt>{t("registration.destination")}</dt>
                    <dd>{t(`registration.scope.${purpose.destination}`)}</dd>
                  </div>
                </dl>
                <label className="check-row purpose-toggle">
                  <input
                    type="checkbox"
                    checked={decision?.granted ?? false}
                    onChange={(event) =>
                      update({
                        purpose: purpose.key,
                        granted: event.target.checked,
                        categories: selected,
                      })
                    }
                  />
                  <span>{t("registration.allow")}</span>
                </label>
                <div className="category-grid">
                  {purpose.categories.map((category) => (
                    <label className="check-row" key={category}>
                      <input
                        type="checkbox"
                        disabled={!decision?.granted}
                        checked={selected.includes(category)}
                        onChange={(event) =>
                          update({
                            purpose: purpose.key,
                            granted: true,
                            categories: event.target.checked
                              ? [...selected, category]
                              : selected.filter((item) => item !== category),
                          })
                        }
                      />
                      <span>{categoryLabel(category, t)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          <div className="actions">
            <button className="primary" type="submit">
              {t("registration.save")}
            </button>
            <button type="button" onClick={() => onSave(true)}>
              {t("registration.decline")}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
export function Receipt({
  record,
  t,
  locale,
}: {
  record: ConsentRecord;
  t: Translate;
  locale: string;
}) {
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <>
      <div className="notice success">
        <strong>
          {t(
            record.revokedAt ? "consent.revoked_notice" : "registration.saved",
          )}
        </strong>
        <p>
          {t(
            record.revokedAt
              ? "registration.revoked"
              : record.stopRequired
                ? "registration.stopped"
                : "registration.next",
          )}
        </p>
      </div>
      <dl className="receipt-meta">
        <div>
          <dt>{t("registration.reference")}</dt>
          <dd className="reference">{record.id}</dd>
        </div>
        <div>
          <dt>{t("registration.saved_at")}</dt>
          <dd>{format(record.grantedAt)}</dd>
        </div>
        <div>
          <dt>{t("registration.expires")}</dt>
          <dd>{format(record.expiresAt)}</dd>
        </div>
        <div>
          <dt>{t("registration.language")}</dt>
          <dd>{record.locale}</dd>
        </div>
      </dl>
      <ul className="receipt-decisions">
        {record.decisions.map((decision) => (
          <li key={decision.purpose}>
            <div>
              <strong>{t(`consent.purpose.${decision.purpose}`)}</strong>
              <span className="status-pill">
                {t(
                  !record.revokedAt && decision.granted
                    ? "registration.allowed"
                    : "registration.declined",
                )}
              </span>
            </div>
            {decision.granted && decision.categories.length > 0 ? (
              <p>
                {decision.categories
                  .map((category) => categoryLabel(category, t))
                  .join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="caption">
        {t("consent.version_label", { version: record.consentVersion })}
      </p>
    </>
  );
}
