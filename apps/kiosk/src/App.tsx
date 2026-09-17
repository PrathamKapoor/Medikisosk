import { useEffect, useMemo, useRef, useState } from "react";
import {
  createTranslator,
  isRegistrationLocale,
  LOCALE_CODES,
  LOCALE_META,
  type RegistrationLocale,
} from "@medikiosk/i18n";
import {
  ApiError,
  KioskApi,
  type Challenge,
  type ConsentRecord,
  type ConsentVersion,
  type Decision,
  type Device,
  type Identity,
  type Session,
  type SessionState,
  type SubmitResult,
} from "./api";
import { ConsentForm, Receipt } from "./Consent";
import { Interview } from "./Interview";

type Screen =
  "welcome" | "identity" | "consent" | "receipt" | "interview" | "result";
const stages: Screen[] = [
  "welcome",
  "identity",
  "consent",
  "receipt",
  "interview",
];
const titleKeys: Record<Screen, string> = {
  welcome: "kiosk.welcome.title",
  identity: "registration.identity",
  consent: "registration.consent",
  receipt: "registration.receipt",
  interview: "interview.title",
  result: "interview.submitted",
};

type ResultTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/** Post-submit triage outcome rendered in patient-safe wording (never a diagnosis). */
function ResultScreen({
  result,
  t,
  onFinish,
}: {
  result: SubmitResult;
  t: ResultTranslate;
  onFinish: () => void;
}) {
  const red = result.triageLevel === "RED";
  const messageKey =
    result.triageLevel === "RED"
      ? "interview.red"
      : result.triageLevel === "AMBER"
        ? "interview.amber"
        : "interview.green";
  return (
    <div className="result-screen">
      <div className={`notice ${red ? "priority" : "success"}`} role="status">
        <h2>
          {red ? t("interview.review_required") : t("interview.submitted")}
        </h2>
        <p>{t(messageKey)}</p>
        {red ? (
          <button className="primary" onClick={onFinish}>
            {t("triage.red.action")}
          </button>
        ) : null}
      </div>
      <div className="actions">
        {!red ? (
          <button className="primary" onClick={onFinish}>
            {t("interview.finish")}
          </button>
        ) : null}
        {red ? (
          <button onClick={onFinish}>{t("interview.finish")}</button>
        ) : null}
      </div>
    </div>
  );
}

function Provisioning({ onReady }: { onReady: (device: Device) => void }) {
  const [id, setId] = useState("");
  const [token, setToken] = useState("");
  return (
    <main className="provision card" id="main">
      <p className="eyebrow">OPERATOR SETUP</p>
      <h1>Prepare this kiosk</h1>
      <p className="lead">
        Enter the device credentials provided by your administrator. The server
        verifies them when a patient starts registration.
      </p>
      <form
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          onReady({ id: id.trim(), token });
          setId("");
          setToken("");
        }}
      >
        <label htmlFor="device-id">Kiosk ID</label>
        <input
          id="device-id"
          value={id}
          onChange={(event) => setId(event.target.value)}
          required
          autoCapitalize="none"
          spellCheck={false}
        />
        <label htmlFor="device-token">Device token</label>
        <input
          id="device-token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
          autoComplete="off"
        />
        <button className="primary" type="submit">
          Prepare patient screen
        </button>
      </form>
      <p className="caption">
        Operator credentials stay in memory only and are never bundled with the
        app or saved in browser storage. Reload to change device configuration.
        For a local synthetic demonstration, use the kiosk ID and token printed
        by the base seed command.
      </p>
    </main>
  );
}

export default function App() {
  const [device, setDevice] = useState<Device | null>(null);
  const [locale, setLocale] = useState<RegistrationLocale>("en-IN");
  const [screen, setScreen] = useState<Screen>("welcome");
  const [session, setSession] = useState<Session | null>(null);
  const [version, setVersion] = useState<ConsentVersion | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otp, setOtp] = useState("");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [receipt, setReceipt] = useState<ConsentRecord | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [now, setNow] = useState(Date.now());
  const [warning, setWarning] = useState(false);
  const api = useRef(new KioskApi());
  const generation = useRef(0);
  const locked = useRef(false);
  const activity = useRef(Date.now());
  const liveSession = useRef<Session | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useMemo(
    () => createTranslator(locale, { fallbackToEnglish: false }),
    [locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [screen, device]);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);

  function clearPatient(
    reason: "registration.cleared" | "registration.expired",
  ) {
    const old = liveSession.current;
    const epoch = ++generation.current;
    liveSession.current = null;
    api.current.clear();
    locked.current = false;
    setSession(null);
    setIdentity(null);
    setChallenge(null);
    setOtp("");
    setReceipt(null);
    setSubmitResult(null);
    setDecisions([]);
    setScreen("welcome");
    setBusy(false);
    setError(null);
    setWarning(false);
    setNotice(reason);
    activity.current = Date.now();
    if (old) {
      const cleanup = new KioskApi();
      void cleanup
        .request(`/kiosk/sessions/${old.sessionId}/wipe`, {
          method: "POST",
          body: {},
          token: old.token,
        })
        .catch(() => {
          if (generation.current === epoch)
            setNotice("registration.wipe_pending");
        })
        .finally(() => cleanup.clear());
    }
  }

  useEffect(() => {
    if (!session) return;
    const markActivity = () => {
      // Once the warning opens, only an explicit response resets inactivity.
      if (Date.now() - activity.current < 240000) activity.current = Date.now();
    };
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (
        current >= Date.parse(session.expiresAt) ||
        current - activity.current >= 300000
      )
        clearPatient("registration.expired");
      else setWarning(current - activity.current >= 240000);
    };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [session]);

  useEffect(() => {
    if (warning) dialog.current?.showModal();
    else dialog.current?.close();
  }, [warning]);

  async function run(action: (current: () => boolean) => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    const epoch = generation.current;
    const current = () => generation.current === epoch;
    try {
      await action(current);
    } catch (cause) {
      if (!current()) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 401 ||
          cause.code === "SESSION_EXPIRED" ||
          cause.code === "SESSION_WIPED")
      )
        clearPatient("registration.expired");
      else
        setError(
          cause instanceof ApiError && cause.code === "CONSENT_UNAVAILABLE"
            ? "registration.empty"
            : cause instanceof ApiError && cause.code.startsWith("IDENTITY_OTP")
              ? "registration.otp_error"
              : cause instanceof ApiError && cause.status === 503
                ? "registration.unavailable_error"
                : "registration.error",
        );
    } finally {
      if (current()) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  async function loadVersion(
    nextLocale: RegistrationLocale,
  ): Promise<ConsentVersion> {
    const next = await api.current.request<ConsentVersion>(
      `/consent/versions?locale=${nextLocale}`,
    );
    if (next.locale !== nextLocale || !next.purposes?.length)
      throw new ApiError("CONSENT_UNAVAILABLE", 503);
    return next;
  }

  const changeLanguage = (nextLocale: RegistrationLocale) =>
    void run(async (current) => {
      const next = await loadVersion(nextLocale);
      if (liveSession.current)
        await api.current.request(
          `/kiosk/sessions/${liveSession.current.sessionId}`,
          {
            method: "PATCH",
            body: { locale: nextLocale },
            token: liveSession.current.token,
          },
        );
      if (!current()) return;
      setLocale(nextLocale);
      setVersion(next);
      setDecisions((previous) =>
        next.purposes.map(
          (purpose) =>
            previous.find((item) => item.purpose === purpose.key) ?? {
              purpose: purpose.key,
              granted: false,
              categories: [],
            },
        ),
      );
    });

  const start = () =>
    void run(async (current) => {
      if (!device) return;
      const wording = version ?? (await loadVersion(locale));
      if (!current()) return;
      const opened = await api.current.request<Session>("/kiosk/sessions", {
        method: "POST",
        body: { locale },
        device,
      });
      if (!current()) return;
      ++generation.current;
      liveSession.current = opened;
      setSession(opened);
      setVersion(wording);
      setDecisions(
        wording.purposes.map((purpose) => ({
          purpose: purpose.key,
          granted: false,
          categories: [],
        })),
      );
      setScreen("identity");
      setNotice(null);
      activity.current = Date.now();
      setNow(Date.now());
      locked.current = false;
      setBusy(false);
    });

  const chooseIdentity = (
    method: "GUEST" | "ABHA_OTP" | "ABHA_QR" | "RETURNING",
  ) =>
    void run(async (current) => {
      if (!session) return;
      const result = await api.current.request<Identity | Challenge>(
        "/kiosk/identity/start",
        {
          method: "POST",
          body: { sessionId: session.sessionId, method },
          token: session.token,
        },
      );
      if (!current()) return;
      setOtp("");
      if ("challengeId" in result) setChallenge(result);
      else {
        setIdentity(result);
        setChallenge(null);
        setScreen("consent");
      }
    });

  const verifyIdentity = () =>
    void run(async (current) => {
      if (!session || !challenge) return;
      const result = await api.current.request<Identity>(
        "/kiosk/identity/verify",
        {
          method: "POST",
          body: { challengeId: challenge.challengeId, otp },
          token: session.token,
        },
      );
      if (!current()) return;
      setIdentity(result);
      setChallenge(null);
      setOtp("");
      setScreen("consent");
    });

  const saveConsent = (decline: boolean) =>
    void run(async (current) => {
      if (!session || !identity || !version) return;
      const selected = decisions.map((decision) => ({
        ...decision,
        granted: !decline && decision.granted,
        categories: decline || !decision.granted ? [] : decision.categories,
      }));
      const saved = await api.current.request<ConsentRecord>("/kiosk/consent", {
        method: "POST",
        body: {
          sessionId: session.sessionId,
          patientId: identity.patientId,
          consentVersion: version.consentVersion,
          locale,
          method: "TOUCH_CONFIRMED",
          decisions: selected,
        },
        token: session.token,
      });
      if (!current()) return;
      setReceipt(saved);
      setDecisions(selected);
      setScreen("receipt");
    });

  const revoke = () =>
    void run(async (current) => {
      if (!session || !receipt) return;
      const saved = await api.current.request<ConsentRecord>(
        `/consent/${receipt.id}/revoke`,
        {
          method: "POST",
          body: { reason: "PATIENT_REQUEST" },
          token: session.token,
        },
      );
      if (current()) setReceipt(saved);
    });

  const retry = () => {
    if (screen === "welcome") changeLanguage(locale);
    else
      void run(async (current) => {
        if (!session) return;
        const saved = await api.current.request<SessionState>(
          `/kiosk/sessions/${session.sessionId}`,
          { token: session.token },
        );
        if (!current()) return;
        if (saved.consent) {
          setReceipt(saved.consent);
          setScreen("receipt");
        } else if (saved.patientId) {
          setIdentity({
            patientId: saved.patientId,
            verified: false,
            providerName: "mock",
          });
          setScreen("consent");
        }
      });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t("registration.skip")}
      </a>
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M7 23V9l9 10 9-10v14"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            Medi<span className="brand-light">Kiosk</span>
          </span>
        </div>
        <span className="header-caption">{t("registration.tag")}</span>
        {session ? (
          <span className="session-time">
            {t("registration.remaining", {
              minutes: Math.max(
                0,
                Math.ceil((Date.parse(session.expiresAt) - now) / 60000),
              ),
            })}
          </span>
        ) : null}
      </header>
      {!device ? (
        <Provisioning onReady={setDevice} />
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <p className="eyebrow">{t("registration.tag")}</p>
            <h2>{t("registration.subtitle")}</h2>
            <ol className="steps" aria-label={t("kiosk.progress")}>
              {stages.map((stage, index) => (
                <li
                  key={stage}
                  className={
                    stage === screen
                      ? "active"
                      : stages.indexOf(screen) > index
                        ? "complete"
                        : ""
                  }
                  aria-current={stage === screen ? "step" : undefined}
                >
                  <span className="step-number">{index + 1}</span>
                  <span>
                    {t(
                      stage === "welcome"
                        ? "registration.language"
                        : titleKeys[stage],
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <div className="sidebar-footer">
              <span className="privacy-line" aria-hidden="true"></span>
              <p>{t("registration.privacy")}</p>
              <p>{t("registration.help")}</p>
            </div>
          </aside>
          <main className="card content" id="main" aria-busy={busy}>
            <div className="content-toolbar">
              <label className="language-control">
                {t("registration.language")}
                <select
                  value={locale}
                  disabled={busy}
                  onChange={(event) =>
                    changeLanguage(event.target.value as RegistrationLocale)
                  }
                >
                  {LOCALE_CODES.map((code) => (
                    <option
                      key={code}
                      value={code}
                      disabled={!isRegistrationLocale(code)}
                    >
                      {LOCALE_META[code].nativeName}
                      {isRegistrationLocale(code)
                        ? ""
                        : ` — ${t("registration.unavailable")}`}
                    </option>
                  ))}
                </select>
              </label>
              {session ? (
                <button
                  className="text-button"
                  onClick={() => clearPatient("registration.cleared")}
                >
                  {t("registration.clear")}
                </button>
              ) : null}
            </div>
            <h1 ref={heading} tabIndex={-1}>
              {t(titleKeys[screen])}
            </h1>
            {offline ? (
              <div className="notice warning" role="status">
                {t("registration.offline")}
              </div>
            ) : null}
            {locale !== "en-IN" ? (
              <div className="notice translation">
                {t("registration.review")}
              </div>
            ) : null}
            {notice ? (
              <div className="notice" role="status">
                {t(notice)}
              </div>
            ) : null}
            {error ? (
              <div className="notice error" role="alert">
                <p>{t(error)}</p>
                <button disabled={busy} onClick={retry}>
                  {t("common.retry")}
                </button>
              </div>
            ) : null}
            {busy ? (
              <p className="pending" role="status">
                <span aria-hidden="true" className="loading-dot" />
                {t("registration.loading")}
              </p>
            ) : null}
            {screen === "welcome" ? (
              <>
                <p className="lead">{t("registration.intro")}</p>
                <div className="language-grid">
                  {LOCALE_CODES.map((code) => (
                    <button
                      type="button"
                      className={`language-card ${locale === code ? "selected" : ""}`}
                      key={code}
                      lang={code}
                      disabled={busy || !isRegistrationLocale(code)}
                      aria-pressed={locale === code}
                      onClick={() => {
                        if (isRegistrationLocale(code)) changeLanguage(code);
                      }}
                    >
                      <span>{LOCALE_META[code].nativeName}</span>
                      <small>
                        {isRegistrationLocale(code)
                          ? LOCALE_META[code].englishName
                          : t("registration.unavailable")}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={busy || offline}
                    onClick={start}
                  >
                    {t("registration.start")}
                    <span aria-hidden="true"> →</span>
                  </button>
                </div>
                <p className="caption">{t("registration.demo_notice")}</p>
              </>
            ) : null}
            {screen === "identity" ? (
              <>
                <div className="notice">
                  <strong>{t("registration.demo")}</strong>
                  <p>{t("registration.demo_notice")}</p>
                </div>
                {challenge ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      verifyIdentity();
                    }}
                  >
                    <h2>{t("registration.challenge")}</h2>
                    <p>{t("registration.challenge_detail")}</p>
                    <label htmlFor="demo-otp">{t("registration.code")}</label>
                    <input
                      id="demo-otp"
                      className="otp-input"
                      inputMode="numeric"
                      autoComplete="off"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otp}
                      disabled={busy}
                      required
                      onChange={(event) =>
                        setOtp(event.target.value.replace(/\D/g, ""))
                      }
                    />
                    <div className="actions">
                      <button
                        className="primary"
                        disabled={busy || offline}
                        type="submit"
                      >
                        {t("kiosk.identity.verify")}
                      </button>
                      <button
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          setChallenge(null);
                          setOtp("");
                          setError(null);
                        }}
                      >
                        {t("registration.choose_again")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="identity-options">
                    <button
                      className="identity-card guest"
                      disabled={busy || offline}
                      onClick={() => chooseIdentity("GUEST")}
                    >
                      <strong>{t("registration.guest")}</strong>
                      <span>{t("registration.guest_detail")}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                    <div className="demo-options">
                      {(["ABHA_OTP", "ABHA_QR", "RETURNING"] as const).map(
                        (method) => (
                          <button
                            disabled={busy || offline}
                            key={method}
                            onClick={() => chooseIdentity(method)}
                          >
                            {t(
                              method === "ABHA_OTP"
                                ? "registration.otp"
                                : method === "ABHA_QR"
                                  ? "registration.qr"
                                  : "registration.returning",
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : null}
            {screen === "consent" && version ? (
              <ConsentForm
                version={version}
                decisions={decisions}
                onChange={setDecisions}
                onSave={saveConsent}
                busy={busy || offline}
                t={t}
              />
            ) : null}
            {screen === "receipt" && receipt ? (
              <>
                <Receipt record={receipt} t={t} locale={locale} />
                {receipt.stopRequired && !receipt.revokedAt ? (
                  <p className="notice" role="status">
                    {t("interview.consent_required_notice")}
                  </p>
                ) : null}
                <div className="actions">
                  {!receipt.revokedAt && !receipt.stopRequired ? (
                    <button
                      className="primary"
                      disabled={busy || offline}
                      onClick={() => setScreen("interview")}
                    >
                      {t("interview.start")}
                      <span aria-hidden="true"> →</span>
                    </button>
                  ) : null}
                  {!receipt.revokedAt ? (
                    <button disabled={busy || offline} onClick={revoke}>
                      {t("consent.revoke")}
                    </button>
                  ) : null}
                  <button onClick={() => clearPatient("registration.cleared")}>
                    {t("registration.finish")}
                  </button>
                </div>
              </>
            ) : null}
            {screen === "interview" && session && identity ? (
              <Interview
                session={session}
                patientId={identity.patientId}
                locale={locale}
                t={t}
                api={api.current}
                onExpired={() => clearPatient("registration.expired")}
                onSubmitted={(result) => {
                  setSubmitResult(result);
                  setScreen("result");
                }}
              />
            ) : null}
            {screen === "result" && submitResult ? (
              <ResultScreen
                result={submitResult}
                t={t}
                onFinish={() => clearPatient("registration.cleared")}
              />
            ) : null}
          </main>
        </div>
      )}
      <footer className="site-footer">
        <span>MediKiosk</span>
        <span>{t("registration.help")}</span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={(event) => event.preventDefault()}
        aria-labelledby="idle-title"
        aria-describedby="idle-description"
      >
        <h2 id="idle-title">{t("registration.idle_title")}</h2>
        <p id="idle-description">
          {t("registration.idle_body", {
            seconds: Math.max(
              0,
              Math.ceil((300000 - (now - activity.current)) / 1000),
            ),
          })}
        </p>
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              activity.current = Date.now();
              setWarning(false);
            }}
          >
            {t("registration.stay")}
          </button>
          <button onClick={() => clearPatient("registration.cleared")}>
            {t("registration.clear")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
