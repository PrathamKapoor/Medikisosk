import type { Catalogue } from "../types";

/**
 * English (India) - the reference catalogue.
 *
 * Every other catalogue is diffed against this key set, and this is the source
 * of the clinical wording: translations must carry the intent of this text
 * rather than re-interpret it. The values here are the reviewed ones, so editing
 * them is effectively editing the product's patient-facing voice.
 */
export const enIN: Catalogue = {
  // --- common.* -----------------------------------------------------------
  "common.continue": "Continue",
  "common.back": "Back",
  "common.next": "Next",
  "common.yes": "Yes",
  "common.no": "No",
  "common.dont_know": "I don't know",
  "common.skip": "Skip",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.retry": "Retry",
  "common.close": "Close",
  "common.save": "Save",
  "common.edit": "Edit",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.of": "of",
  "common.step": "Step",
  "common.optional": "Optional",
  "common.required": "Required",
  "common.minutes_short": "min",
  "common.today": "Today",
  "common.yesterday": "Yesterday",

  // --- kiosk.* ------------------------------------------------------------
  "kiosk.welcome.title": "Welcome",
  "kiosk.welcome.subtitle": "Let's get you checked in",
  "kiosk.welcome.start": "Start",
  "kiosk.language.title": "Choose your language",
  "kiosk.language.prompt": "Select the language you are most comfortable with",
  "kiosk.identity.title": "Identify yourself",
  "kiosk.identity.choose_abha": "Use ABHA number",
  "kiosk.identity.choose_guest": "Continue as guest",
  "kiosk.identity.choose_returning": "I have visited before",
  "kiosk.identity.abha_number": "ABHA number",
  "kiosk.identity.otp": "One-time password (OTP)",
  "kiosk.identity.otp_sent":
    "An OTP has been sent to your registered mobile number",
  "kiosk.identity.otp_invalid": "The OTP you entered is not correct",
  "kiosk.identity.otp_expired": "The OTP has expired. Please request a new one",
  "kiosk.identity.otp_attempts_exceeded":
    "Too many incorrect attempts. Please ask the front desk for help",
  "kiosk.identity.verify": "Verify",
  "kiosk.identity.guest_notice":
    "As a guest, your details will be kept only for this visit",
  "kiosk.identity.mock_notice":
    "Demo mode: no real ABHA verification is performed",
  "kiosk.identity.network_failure":
    "We could not reach the identity service. Please try again or continue as a guest",
  "kiosk.progress": "Progress",
  "kiosk.mic_start": "Tap to speak",
  "kiosk.mic_stop": "Tap to stop",
  "kiosk.listening": "Listening…",
  "kiosk.transcribing": "Writing down what you said…",
  "kiosk.understanding": "Understanding your answer…",
  "kiosk.checking": "Checking a few things…",
  "kiosk.did_i_understand": "Did I understand you correctly?",
  "kiosk.tap_to_correct": "Tap to correct",
  "kiosk.voice_unavailable": "Voice input is not available right now",
  "kiosk.switch_to_touch": "Switch to touch",
  "kiosk.finish": "Finish",
  "kiosk.session_ending": "Ending your session…",
  "kiosk.session_ended":
    "Your session has ended. Please proceed to the counter",

  // --- consent.* ----------------------------------------------------------
  "consent.title": "Consent",
  "consent.intro":
    "We will ask you about your health and record what you tell us. Please read and choose what you agree to",
  "consent.purpose.treatment": "Treatment",
  "consent.purpose.treatment_desc":
    "Your health information will be used by the doctor and care team to treat you",
  "consent.purpose.research": "Research",
  "consent.purpose.research_desc":
    "De-identified information may be used to improve care. This is optional",
  "consent.purpose.analytics": "Service analytics",
  "consent.purpose.analytics_desc":
    "Anonymous usage data may be used to improve this service. This is optional",
  "consent.category.identity": "Identity details",
  "consent.category.symptoms": "Symptoms and history",
  "consent.category.documents": "Documents you upload",
  "consent.category.voice": "Voice recordings",
  "consent.category.vitals": "Vitals measured here",
  "consent.accept_all": "Accept all",
  "consent.partial_notice":
    "You may accept some items and decline others. Declining optional items will not stop your treatment",
  "consent.decline": "Decline",
  "consent.revoke": "Withdraw consent",
  "consent.revoked_notice": "Your consent has been withdrawn",
  "consent.must_accept_to_continue":
    "Consent for treatment is required to continue",
  "consent.version_label": "Consent version {{version}}",
  "consent.audio_explain": "Hear this explained",
  // --- interview.* --------------------------------------------------------
  "interview.chief_complaint.ask": "What brings you in today?",
  "interview.chief_complaint.placeholder":
    "For example: chest pain since this morning",
  "interview.history.medical.ask":
    "Do you have any long-term medical conditions?",
  "interview.history.medical.ask_family":
    "Does anyone in your family have a long-term medical condition?",
  "interview.history.surgical.ask": "Have you had any surgeries or operations?",
  "interview.history.family.ask":
    "Are there any illnesses that run in your family?",
  "interview.history.personal.ask":
    "Tell me about your daily routine, work and sleep",
  "interview.history.smoking.ask": "Do you smoke or use tobacco?",
  "interview.history.alcohol.ask": "Do you drink alcohol?",
  "interview.history.tobacco_chewing.ask": "Do you chew tobacco or gutkha?",
  "interview.medication.ask": "Are you taking any medicines?",
  "interview.medication.ask_names":
    "Please tell me the names of your medicines, or show the strip or the prescription",
  "interview.allergy.ask": "Are you allergic to anything?",
  "interview.allergy.no_known": "No known allergies",
  "interview.allergy.not_asked": "Not asked",
  "interview.allergy.drug": "Medicine",
  "interview.allergy.food": "Food",
  "interview.allergy.environmental": "Environmental (dust, pollen)",
  "interview.ros.ask": "Do you have any other symptoms anywhere in your body?",
  "interview.duration.ask": "How long has this been going on?",
  "interview.severity.ask": "How bad is it?",
  "interview.pregnancy.ask": "Are you pregnant?",
  "interview.age.ask": "How old are you?",
  "interview.sex.ask": "Please select your sex",
  "interview.notes.ask":
    "Is there anything else you would like the doctor to know?",
  "interview.closing.thank_you": "Thank you. Your answers have been recorded",
  "interview.closing.summary_ready": "Your summary is ready for the care team",

  // --- severity.* ---------------------------------------------------------
  "severity.none": "None",
  "severity.mild": "Mild",
  "severity.moderate": "Moderate",
  "severity.severe": "Severe",
  "severity.very_severe": "Very severe",
  "severity.unknown": "Not known",

  // --- triage.* -----------------------------------------------------------
  "triage.green.patient_message":
    "You can wait to be seen. Please take a seat near the waiting area",
  "triage.green.staff_message":
    "Routine. Escalate immediately if the condition changes",
  "triage.amber.patient_message":
    "You should be seen soon. Please wait near the counter and tell staff if you feel worse",
  "triage.amber.staff_message": "Urgent. Review within the target time",
  // SAFETY-CRITICAL WORDING: this string must not name a disease, must not
  // assert that an emergency exists (the system cannot know that), and must
  // direct the patient to a human. It says only that a priority assessment is
  // needed and that a clinician must decide. Do not "improve" this by adding
  // a diagnosis - an incorrect reassurance in a patient's face is the single
  // most dangerous failure mode in this product.
  "triage.red.patient_message":
    "Your answers suggest that a priority assessment is needed. Please go to the counter immediately and show this screen to the staff. This is not a diagnosis.",
  "triage.red.staff_message":
    "Priority assessment required. Immediate clinician review",
  "triage.red.heading": "Priority assessment required",
  "triage.red.action": "Go to the counter now",
  "triage.amberg.heading": "Urgent - needs review",
  "triage.evidence_heading": "Why this level",
  "triage.rule_label": "Rule",
  "triage.overridden_notice": "A clinician has changed this level",
  "triage.go_to_counter": "Go to the counter",
  "triage.staff_notified": "Staff have been notified",

  // --- evidence.* ---------------------------------------------------------
  "evidence.heading": "Evidence",
  "evidence.source.patient_response": "Patient's answer",
  "evidence.source.document": "Uploaded document",
  "evidence.source.vital": "Vital measurement",
  "evidence.source.prior_encounter": "Previous visit",
  "evidence.source.clinician": "Clinician entry",
  "evidence.confidence_high": "High confidence",
  "evidence.confidence_moderate": "Moderate confidence",
  "evidence.confidence_low": "Low confidence",
  "evidence.origin.patient_reported": "Reported by patient",
  "evidence.origin.document_derived": "From a document",
  "evidence.origin.clinician_entered": "Entered by clinician",
  "evidence.origin.ai_inferred": "Suggested by the system",
  "evidence.not_established": "Not established",
  "evidence.verbatim_label": "Original words",
  "evidence.trace_title": "Trace to source",
  // --- document.* ---------------------------------------------------------
  "document.upload.title": "Add a document",
  "document.upload.instruction":
    "Place the paper flat, keep it well lit, and photograph the whole page",
  "document.upload.choose_file": "Choose a file",
  "document.upload.processing": "Processing…",
  "document.upload.extracting": "Reading the text…",
  "document.type.prescription": "Prescription",
  "document.type.lab_report": "Lab report",
  "document.type.discharge_summary": "Discharge summary",
  "document.type.certificate": "Certificate",
  "document.type.other": "Other",
  "document.quality.poor_too_blurry": "The photo is too blurry",
  "document.quality.poor_too_dark": "The photo is too dark",
  "document.quality.poor_too_small": "The text is too small to read",
  "document.quality.retake": "Retake photo",
  "document.quality.continue_anyway": "Continue anyway",
  "document.extraction.heading": "What we read from the document",
  "document.verify.accept": "Accept",
  "document.verify.edit": "Edit",
  "document.verify.reject": "Reject",
  "document.verify.uncertain": "Not sure",
  "document.failure.generic": "We could not read this document",
  "document.failure.retry": "Try again",
  "document.failure.continue_without": "Continue without it",

  // --- physician.* --------------------------------------------------------
  "physician.header.patient": "Patient",
  "physician.header.age": "Age",
  "physician.header.sex": "Sex",
  "physician.header.encounter": "Encounter",
  "physician.header.triage": "Triage",
  "physician.summary.heading": "Summary",
  "physician.hpi.heading": "History of presenting illness",
  "physician.socrates.heading": "SOCRATES",
  "physician.vitals.heading": "Vitals",
  "physician.labs.heading": "Laboratory results",
  "physician.abnormal_labs.heading": "Abnormal results",
  "physician.medications.heading": "Medications",
  "physician.allergies.heading": "Allergies",
  "physician.contradictions.heading": "Conflicts",
  "physician.timeline.heading": "Timeline",
  "physician.what_changed.heading": "What changed",
  "physician.soap.subjective": "Subjective",
  "physician.soap.objective": "Objective",
  "physician.soap.assessment": "Assessment",
  "physician.soap.plan": "Plan",
  "physician.soap.assessment_not_established": "Assessment not established",
  "physician.soap.ai_suggested": "System suggested",
  "physician.action.accept": "Accept",
  "physician.action.reject": "Reject",
  "physician.action.verify": "Verify",
  "physician.action.edit": "Edit",
  "physician.action.override_triage": "Change triage level",
  "physician.action.override_reason": "Reason for change",
  "physician.review.confirm_verify": "Confirm and verify",
  "physician.review.verified_by": "Verified by",
  "physician.review.audit_notice": "This action is recorded in the audit log",
  "physician.empty.no_documents": "No documents",
  "physician.empty.no_labs": "No laboratory results",
  "physician.empty.no_history": "No history recorded",
  "physician.empty.no_timeline": "No timeline entries",
  "physician.empty.no_summary": "No summary yet",
  // --- whatchanged.* ------------------------------------------------------
  "whatchanged.new": "New",
  "whatchanged.resolved": "Resolved",
  "whatchanged.worsened": "Worse",
  "whatchanged.improved": "Better",
  "whatchanged.unchanged": "Unchanged",
  "whatchanged.conflicting": "Conflicting",
  "whatchanged.no_previous_visit": "No previous visit to compare",
  "whatchanged.evidence_link": "See evidence",

  // --- contradiction.* ----------------------------------------------------
  "contradiction.heading": "Conflict",
  // {{item}} is filled by the caller with the field or fact that conflicts.
  "contradiction.patient_says_none_but_record_has":
    "The patient reports none, but the record contains {{item}}",
  "contradiction.date_mismatch": "The dates do not match",
  "contradiction.lab_discordance":
    "The laboratory result does not match the reported value",
  "contradiction.needs_resolution": "This needs to be resolved",
  "contradiction.resolve": "Resolve",
  "contradiction.dismiss": "Dismiss",

  // --- offline.* ----------------------------------------------------------
  "offline.status_online": "Online",
  "offline.status_degraded": "Limited connection",
  "offline.status_offline": "Offline",
  "offline.queued_notice":
    "Your answers are saved on this device and will be sent when the connection returns",
  "offline.syncing": "Sending…",
  "offline.synced": "Sent",
  "offline.will_sync_later": "Will be sent later",
  "offline.local_processing_notice": "Working on this device only",

  // --- auth.* -------------------------------------------------------------
  "auth.login.title": "Sign in",
  "auth.login.username": "Username",
  "auth.login.password": "Password",
  "auth.login.submit": "Sign in",
  "auth.login.invalid": "Incorrect username or password",
  "auth.login.session_expired":
    "Your session has expired. Please sign in again",
  "auth.logout": "Sign out",
  "auth.role.physician": "Physician",
  "auth.role.nurse": "Nurse",
  "auth.role.triage": "Triage",
  "auth.role.admin": "Administrator",
  "auth.role.kiosk": "Kiosk",

  // --- error.* ------------------------------------------------------------
  "error.generic": "Something went wrong. Please try again",
  "error.validation": "Please check what you entered",
  "error.not_found": "Not found",
  "error.forbidden": "You do not have permission to do this",
  "error.consent_required": "Consent is required before continuing",
  "error.provider_unavailable": "This service is not available right now",
  "error.document_processing_failed": "The document could not be processed",
  "error.ai_unavailable":
    "The assistant is not available right now. You can continue without it",
  "error.network": "No connection. Please check your network",
  "error.try_again": "Try again",
  "error.contact_staff": "Please speak to a member of staff",

  // --- a11y.* -------------------------------------------------------------
  "a11y.screen_reader_hint": "This screen works with a screen reader",
  "a11y.large_text": "Large text",
  "a11y.contrast_high": "High contrast",
  "a11y.language_switch": "Change language",
  "a11y.keyboard_hint": "Use the arrow keys to move and Enter to select",
  "a11y.audio_icon_label": "Play audio",
  // --- q.* pathway questions (demo-critical pathways) ---------------------
  "q.chest_pain.site": "Where do you feel the pain?",
  "q.chest_pain.onset": "When did it start?",
  "q.chest_pain.character": "What does it feel like?",
  "q.chest_pain.radiation": "Does it spread anywhere?",
  "q.chest_pain.associated": "Do you have any other symptoms with it?",
  "q.chest_pain.timing": "Is it there all the time, or does it come and go?",
  "q.chest_pain.exertion": "Does it come on when you walk or work?",
  "q.chest_pain.severity": "How bad is the pain right now?",
  "q.chest_pain.safety_dyspnoea": "Are you short of breath?",
  "q.chest_pain.safety_sweating": "Are you sweating heavily?",
  "q.chest_pain.safety_syncope": "Have you fainted, or nearly fainted?",
  "q.chest_pain.safety_cardiac_history":
    "Has a doctor ever told you that you have a heart problem?",
  "q.chest_pain.relief": "Does anything make it better?",
  "q.chest_pain.character.opt.pressure": "Pressure or tightness",
  "q.chest_pain.character.opt.sharp": "Sharp or stabbing",
  "q.chest_pain.character.opt.burning": "Burning",
  "q.chest_pain.character.opt.heaviness": "Heaviness",
  "q.chest_pain.character.opt.tearing": "Tearing",
  "q.chest_pain.radiation.opt.left_arm": "Left arm",
  "q.chest_pain.radiation.opt.jaw": "Jaw or neck",
  "q.chest_pain.radiation.opt.back": "Back",
  "q.chest_pain.radiation.opt.none": "Nowhere",
  "q.chest_pain.timing.opt.continuous": "All the time",
  "q.chest_pain.timing.opt.intermittent": "Comes and goes",
  "q.chest_pain.timing.opt.episodic": "In episodes",
  "q.chest_pain.timing.opt.nocturnal": "At night",
  "q.chest_pain.timing.opt.exertional": "When I exert myself",
  "q.chest_pain.safety_dyspnoea.opt.yes": "Yes",
  "q.chest_pain.safety_dyspnoea.opt.no": "No",

  // --- q.fever.* ----------------------------------------------------------
  "q.fever.onset": "When did the fever start?",
  "q.fever.duration": "How many days have you had the fever?",
  "q.fever.severity": "How high has the temperature been?",
  "q.fever.pattern": "Is the fever continuous, or does it come and go?",
  "q.fever.rash": "Do you have a rash anywhere?",
  "q.fever.headache_with_fever": "Do you have a headache with the fever?",
  "q.fever.neck_stiffness": "Is your neck stiff or painful to bend?",
  "q.fever.travel": "Have you travelled anywhere in the last month?",
  "q.fever.mosquito_exposure":
    "Have you been somewhere with a lot of mosquitoes?",
  "q.fever.water_intake": "Are you able to drink water and keep it down?",

  // --- q.respiratory.* ----------------------------------------------------
  "q.respiratory.onset": "When did the breathing problem start?",
  "q.respiratory.duration": "How long have you had this cough?",
  "q.respiratory.sputum": "Do you cough up phlegm?",
  "q.respiratory.sputum_colour": "What colour is the phlegm?",
  "q.respiratory.blood_in_sputum": "Have you seen blood in the phlegm?",
  "q.respiratory.wheeze": "Do you hear a whistling sound when you breathe?",
  "q.respiratory.night_symptoms": "Does it wake you at night?",
  "q.respiratory.smoking": "Do you smoke?",
  "q.respiratory.chest_tightness": "Does your chest feel tight?",

  // --- q.headache.* -------------------------------------------------------
  "q.headache.onset": "When did the headache start?",
  "q.headache.sudden_severe": "Did it come on suddenly and very severely?",
  "q.headache.character": "What kind of pain is it?",
  "q.headache.location": "Where do you feel it?",
  "q.headache.associated": "Do you have other symptoms with it?",
  "q.headache.vision_change": "Has your vision changed?",
  "q.headache.neck_stiffness": "Is your neck stiff?",
  "q.headache.neuro_deficit":
    "Do you have weakness, numbness or difficulty speaking?",
  "q.headache.drug_use": "Do you take any medicines for headaches?",
  "q.headache.relief": "Does anything make the headache better?",

  // --- q.abdominal.* ------------------------------------------------------
  "q.abdominal.site": "Where does your stomach hurt?",
  "q.abdominal.onset": "When did the pain start?",
  "q.abdominal.character": "What does the pain feel like?",
  "q.abdominal.migration": "Has the pain moved from one place to another?",
  "q.abdominal.relation_to_food": "Does it get better or worse with food?",
  "q.abdominal.vomiting": "Have you been vomiting?",
  "q.abdominal.bowel_change": "Has your stool changed?",
  "q.abdominal.blood_in_stool": "Have you seen blood in your stool?",
  "q.abdominal.urinary_symptoms": "Any burning or difficulty passing urine?",
  "q.abdominal.burden": "How much is this affecting your daily activities?",

  // --- q.history.* --------------------------------------------------------
  "q.history.pmh": "Do you have any long-term medical conditions?",
  "q.history.pmsh": "Have you had any operations or surgeries?",
  "q.history.family": "Are there any illnesses that run in your family?",
  "q.history.smoking": "Do you smoke or use tobacco?",
  "q.history.alcohol": "Do you drink alcohol?",
  "q.history.tobacco_chewing": "Do you chew tobacco or gutkha?",
  "q.history.medications": "Are you taking any medicines?",
  "q.history.allergies": "Do you have any allergies?",
  "q.history.allergies_detail":
    "What are you allergic to, and what happens when you come into contact with it?",
  "q.history.pregnant": "Are you pregnant?",
  "q.history.ros": "Any other symptoms anywhere in your body?",
  "q.history.notes": "Anything else you would like the doctor to know?",
};
