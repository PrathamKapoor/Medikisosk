import type { Catalogue } from "../types";

/**
 * Marathi (मराठी) catalogue - PROVISIONAL.
 *
 * Machine-drafted. NOT reviewed by a Marathi-speaking clinician; see
 * PROVISIONAL_LOCALES in ../types.ts. Key set is kept identical to en-IN by
 * construction and enforced by verifyAllLocales().
 *
 * Register: conversational Marathi as spoken in Maharashtra (including the
 * "तुम्ही" respectful address), avoiding Sanskrit-heavy clinical vocabulary that
 * patients rarely use aloud.
 */
export const mrIN: Catalogue = {
  // --- common.* -----------------------------------------------------------
  "common.continue": "सुरू ठेवा",
  "common.back": "मागे",
  "common.next": "पुढे",
  "common.yes": "होय",
  "common.no": "नाही",
  "common.dont_know": "मला माहीत नाही",
  "common.skip": "वगळा",
  "common.cancel": "रद्द करा",
  "common.confirm": "पुष्टी करा",
  "common.retry": "पुन्हा प्रयत्न करा",
  "common.close": "बंद करा",
  "common.save": "जतन करा",
  "common.edit": "बदला",
  "common.search": "शोधा",
  "common.loading": "लोड होत आहे…",
  "common.of": "पैकी",
  "common.step": "पायरी",
  "common.optional": "च्छिक",
  "common.required": "आवश्यक",
  "common.minutes_short": "मिनिे",
  "common.today": "आज",
  "common.yesterday": "काल",

  // --- kiosk.* ------------------------------------------------------------
  "kiosk.welcome.title": "स्वागत आहे",
  "kiosk.welcome.subtitle": "चला तुमची नोंदणी करू",
  "kiosk.welcome.start": "सुरू करा",
  "kiosk.language.title": "तुमची भाषा निवडा",
  "kiosk.language.prompt": "ज्या भाषेत तुम्हाला सर्वात सोयीचे वाटते ती निवडा",
  "kiosk.identity.title": "तुमची ओळख सांगा",
  "kiosk.identity.choose_abha": "आभा क्रमांक वापरा",
  "kiosk.identity.choose_guest": "पाहुणा म्हणून सुरू ठेवा",
  "kiosk.identity.choose_returning": "माझी यापूर्वी येथे भेट ाली आहे",
  "kiosk.identity.abha_number": "आभा क्रमांक",
  "kiosk.identity.otp": "एकवेळ पासवर्ड (OTP)",
  "kiosk.identity.otp_sent":
    "तुमच्या नोंदणीकृत मोबाइल क्रमांकावर OTP पाठवला आहे",
  "kiosk.identity.otp_invalid": "तुम्ही टाकलेला OTP बरोबर नाही",
  "kiosk.identity.otp_expired": "OTP ची मुदत संपली आहे. कृपया नवीन OTP मागा",
  "kiosk.identity.otp_attempts_exceeded":
    "खूप वेळा चुकीचा प्रयत्न ाला. कृपया स्वागत काउंटरवर मदत मागा",
  "kiosk.identity.verify": "पडताळा",
  "kiosk.identity.guest_notice":
    "पाहुणा म्हणून तुमची माहिती फक्त या भेटीसाठी ठेवली जाईल",
  "kiosk.identity.mock_notice": "डेमो मोड: खरी आभा पडताळणी केली जात नाही",
  "kiosk.identity.network_failure":
    "ओळख सेवेशी संपर्क ाला नाही. कृपया पुन्हा प्रयत्न करा किंवा पाहुणा म्हणून सुरू ेवा",
  "kiosk.progress": "प्रगती",
  "kiosk.mic_start": "बोलण्यासाठी टॅप करा",
  "kiosk.mic_stop": "थांबवण्यासाठी टॅप करा",
  "kiosk.listening": "ऐकत आहोत…",
  "kiosk.transcribing": "तुमचे बोलणे लिहिले जात आहे…",
  "kiosk.understanding": "तुमचे उत्तर समजून घेत आहोत…",
  "kiosk.checking": "काही गोष्टी तपासत आहोत…",
  "kiosk.did_i_understand": "मी तुम्हाला बरोबर समजलो का?",
  "kiosk.tap_to_correct": "दुरुस्त करण्यासाठी टॅप करा",
  "kiosk.voice_unavailable": "सध्या व्हॉइस इनपुट उपलब्ध नाही",
  "kiosk.switch_to_touch": "टचवर जा",
  "kiosk.finish": "संपवा",
  "kiosk.session_ending": "तुमचे सत्र संपत आहे…",
  "kiosk.session_ended": "तुमचे सत्र संपले आहे. कृपया काउंटरवर जा",

  // --- consent.* ----------------------------------------------------------
  "consent.title": "संमती",
  "consent.intro":
    "आम्ही तुमच्या आरोग्याद्दल विचारू आणि तुम्ही सांगितलेले नोंदवू. कृपया वाचा आणि तुम्ही कशाला संमती देता ते निवडा",
  "consent.purpose.treatment": "उपचार",
  "consent.purpose.treatment_desc":
    "तुमची आरोग्य माहिती डॉक्टर व काजी घेणारा सं तुमच्या उपचारासाठी वापरेल",
  "consent.purpose.research": "संशोधन",
  "consent.purpose.research_desc":
    "ळख काढलेली माहिती काळजी सुधारण्यासाी वापरली जाऊ शकते. हे ऐच्छिक आहे",
  "consent.purpose.analytics": "सेवा विश्लेषण",
  "consent.purpose.analytics_desc":
    "ही सेवा सुधारण्यासाठी नाव न देता वापरलेला डेटा वापरला जा शकतो. हे ऐच्छिक आहे",
  "consent.category.identity": "ओळखीची माहिती",
  "consent.category.symptoms": "लक्षणे व इतिहास",
  "consent.category.documents": "तुम्ही अपलोड केलेली कागदपत्रे",
  "consent.category.voice": "व्हॉइस रेकॉर्डिंग",
  "consent.category.vitals": "इथे मोजलेली व्हायटल्स",
  "consent.accept_all": "सर्व स्वीकारा",
  "consent.partial_notice":
    "तुम्ही काही मुद्दे स्वीकारू शकता आणि काही नाकारू शकता. ऐच्छिक मुद्दे नाकारल्याने उपचार थांबणार नाही",
  "consent.decline": "नाकारा",
  "consent.revoke": "संमती मागे घ्या",
  "consent.revoked_notice": "तुमची संमती मागे घेतली आहे",
  "consent.must_accept_to_continue":
    "पुढे जाण्यासाठी उपचाराची संमती आवश्यक आहे",
  "consent.version_label": "संमती आवृत्ती {{version}}",
  "consent.audio_explain": "हे ऐकून समजून घ्या",
  // --- interview.* --------------------------------------------------------
  "interview.chief_complaint.ask": "आज तुम्ही कशासाठी आले आहात?",
  "interview.chief_complaint.placeholder": "उदाहरण: आज सकाळपासून छातीत दुखणे",
  "interview.history.medical.ask": "तुम्हाला कोणता दीर्घकालीन आजार आहे का?",
  "interview.history.medical.ask_family":
    "तुमच्या कुटुंबात कोणाला दीर्घकालीन आजार आहे का?",
  "interview.history.surgical.ask": "तुमचे काही ऑपरेशन झाले आहे का?",
  "interview.history.family.ask": "कुटुंबात कोणता आजार चालतो का?",
  "interview.history.personal.ask": "तुमची दिनचर्या, काम आणि झोप याबद्दल सांगा",
  "interview.history.smoking.ask": "तुम्ही धूम्रपान किंवा तंबाखू वापरता का?",
  "interview.history.alcohol.ask": "तुम्ही दारू पिता का?",
  "interview.history.tobacco_chewing.ask":
    "तुम्ही तंबाखू किंवा गुटखा चावता का?",
  "interview.medication.ask": "तुम्ही कोणतीही औषधे घेत आहात का?",
  "interview.medication.ask_names":
    "कृपया तुमच्या औषधांची नावे सांगा, किंवा पत्ता किंवा प्रिस्क्रिप्शन दाखवा",
  "interview.allergy.ask": "तुम्हाला कोणत्याही गोष्टीची अ‍ॅलर्जी आहे का?",
  "interview.allergy.no_known": "कोणतीही माहीत अ‍ॅलर्जी नाही",
  "interview.allergy.not_asked": "विचारले नाही",
  "interview.allergy.drug": "औषध",
  "interview.allergy.food": "अन्न",
  "interview.allergy.environmental": "पर्यावरणीय (धूळ, परागकण)",
  "interview.ros.ask": "शरीरात इतर कुठे लक्षणे आहेत का?",
  "interview.duration.ask": "हे किती काळापासून आहे?",
  "interview.severity.ask": "हे किती गंभीर आहे?",
  "interview.pregnancy.ask": "तुम्ही गर्भवती आहात का?",
  "interview.age.ask": "तुमचे वय किती आहे?",
  "interview.sex.ask": "कृपया तुमचे लिंग निवडा",
  "interview.notes.ask": "डॉक्टरांना आणखी काही सांगायचे आहे का?",
  "interview.closing.thank_you": "धन्यवाद. तुमची उत्तरे नोंदवली गेली आहेत",
  "interview.closing.summary_ready":
    "तुमचा सारांश काळजी घेणाऱ्या संघासाठी तयार आहे",

  // --- severity.* ---------------------------------------------------------
  "severity.none": "काही नाही",
  "severity.mild": "सौम्य",
  "severity.moderate": "मध्यम",
  "severity.severe": "गंभीर",
  "severity.very_severe": "अत्यंत गंभीर",
  "severity.unknown": "माहीत नाही",

  // --- triage.* -----------------------------------------------------------
  "triage.green.patient_message":
    "तुम्हाला तपासणीसाठी थांबावे लागेल. कृपया प्रतीक्षा क्षेत्राजवळ बसा",
  "triage.green.staff_message": "नेहमीचे. स्थिती बदलल्यास तात्काळ पुढे पाठवा",
  "triage.amber.patient_message":
    "तुमची लवकर तपासणी होईल. कृपया काउंटरजवळ थांबा आणि तब्येत बिघडल्यास कर्मचाऱ्यांना सांगा",
  "triage.amber.staff_message": "तातडीचे. ठरलेल्या वेळेत तपासणी करा",
  // सुरक्षा-महत्त्वाचे: या वाक्यात रोगाचे नाव नाही आणि आपत्कालीन स्थिती असल्याचा
  // दावाही नाही. फक्त प्राधान्य तपासणी आवश्यक असल्याचे सांगितले आहे.
  "triage.red.patient_message":
    "तुमच्या उत्तरांवरून असे दिसते की प्राधान्य तपासणी आवश्यक आहे. कृपया ताबडतोब काउंटरवर जा आणि ही स्क्रीन कर्मचाऱ्यांना दाखवा. हे निदान नाही.",
  "triage.red.staff_message":
    "प्राधान्य तपासणी आवश्यक. तात्काळ वैद्यकीय तपासणी करा",
  "triage.red.heading": "प्राधान्य तपासणी आवश्यक",
  "triage.red.action": "आता काउंटरवर जा",
  "triage.amberg.heading": "तातडीचे - तपासणी आवश्यक",
  "triage.evidence_heading": "हा स्तर का",
  "triage.rule_label": "नियम",
  "triage.overridden_notice": "वैद्याने हा स्तर बदलला आहे",
  "triage.go_to_counter": "काउंटरवर जा",
  "triage.staff_notified": "कर्मचाऱ्यांना कळवले आहे",
  // --- evidence.* ---------------------------------------------------------
  "evidence.heading": "पुरावा",
  "evidence.source.patient_response": "रुग्ाचे उत्तर",
  "evidence.source.document": "अपलोड केलेले कागदपत्र",
  "evidence.source.vital": "व्हायटल मापन",
  "evidence.source.prior_encounter": "मागील भेट",
  "evidence.source.clinician": "वैद्याची नोंद",
  "evidence.confidence_high": "उच्च विश्वास",
  "evidence.confidence_moderate": "मध्यम विश्वास",
  "evidence.confidence_low": "कमी विश्वास",
  "evidence.origin.patient_reported": "रुग्णाने सांगितलेले",
  "evidence.origin.document_derived": "कागदपत्रावरून घेतलेले",
  "evidence.origin.clinician_entered": "वैद्याने नोंदवलेले",
  "evidence.origin.ai_inferred": "प्रणालीने सुचवलेले",
  "evidence.not_established": "स्थापित नाही",
  "evidence.verbatim_label": "मूळ शब्द",
  "evidence.trace_title": "स्रोतापर्यंत पाहा",

  // --- document.* ---------------------------------------------------------
  "document.upload.title": "कागदपत्र जोडा",
  "document.upload.instruction":
    "कागद सपाट ठेवा, चांगला प्रकाश ठेवा आणि संपूर्ण पानाचा फोटो घ्या",
  "document.upload.choose_file": "फाइल निवडा",
  "document.upload.processing": "प्रक्रिया सुरू आहे…",
  "document.upload.extracting": "मजकूर वाचला जात आहे…",
  "document.type.prescription": "प्रिस्क्रिप्शन",
  "document.type.lab_report": "लॅब रिपोर्ट",
  "document.type.discharge_summary": "डिस्चार्ज सारांश",
  "document.type.certificate": "प्रमाणपत्र",
  "document.type.other": "इतर",
  "document.quality.poor_too_blurry": "फोटो खूप अस्पष्ट आहे",
  "document.quality.poor_too_dark": "फोटो खूप अंधारा आहे",
  "document.quality.poor_too_small": "मजकूर वाचण्यासाठी खूप लहान आहे",
  "document.quality.retake": "फोटो पुन्हा घ्या",
  "document.quality.continue_anyway": "तरीही सुरू ेवा",
  "document.extraction.heading": "कागदपत्रातून जे वाचले",
  "document.verify.accept": "स्वीकारा",
  "document.verify.edit": "बदला",
  "document.verify.reject": "नाकारा",
  "document.verify.uncertain": "निश्चित नाही",
  "document.failure.generic": "हे कागदपत्र वाचता आले नाही",
  "document.failure.retry": "पुन्हा प्रयत्न करा",
  "document.failure.continue_without": "याशिवाय सुरू ठेवा",
  // --- physician.* --------------------------------------------------------
  "physician.header.patient": "रुग्ण",
  "physician.header.age": "वय",
  "physician.header.sex": "लिंग",
  "physician.header.encounter": "भेट",
  "physician.header.triage": "ट्रायाज",
  "physician.summary.heading": "सारांश",
  "physician.hpi.heading": "सध्याच्या आजाराचा इतिहास",
  "physician.socrates.heading": "SOCRATES",
  "physician.vitals.heading": "व्हायटल्स",
  "physician.labs.heading": "प्रयोगशाळेचे निकाल",
  "physician.abnormal_labs.heading": "असामान्य निकाल",
  "physician.medications.heading": "औषधे",
  "physician.allergies.heading": "अ‍ॅलर्जी",
  "physician.contradictions.heading": "विसंगती",
  "physician.timeline.heading": "कालरेषा",
  "physician.what_changed.heading": "काय बदलले",
  "physician.soap.subjective": "व्यक्तिनिष्ठ",
  "physician.soap.objective": "वस्तुनिष्ठ",
  "physician.soap.assessment": "निष्कर्ष",
  "physician.soap.plan": "योजना",
  "physician.soap.assessment_not_established": "निष्कर्ष स्पष्ट नाही",
  "physician.soap.ai_suggested": "प्रणालीने सुचवलेले",
  "physician.action.accept": "स्वीकारा",
  "physician.action.reject": "नाकारा",
  "physician.action.verify": "पडताळा",
  "physician.action.edit": "बदला",
  "physician.action.override_triage": "ट्रायाज स्तर बदला",
  "physician.action.override_reason": "बदलाचे कारण",
  "physician.review.confirm_verify": "पुष्टी करा आणि पडताळा",
  "physician.review.verified_by": "पडताळणी करणारे",
  "physician.review.audit_notice": "ही कृती ऑडिट लॉगमध्ये नोंदवली जाते",
  "physician.empty.no_documents": "कागदपत्रे नाहीत",
  "physician.empty.no_labs": "प्रयोगशाळेचे निकाल नाहीत",
  "physician.empty.no_history": "इतिहास नोंदवलेला नाही",
  "physician.empty.no_timeline": "कालरेषेत काही नाही",
  "physician.empty.no_summary": "अजून सारांश नाही",
  // --- whatchanged.* ------------------------------------------------------
  "whatchanged.new": "नवीन",
  "whatchanged.resolved": "निकालात निघाले",
  "whatchanged.worsened": "बिघडले",
  "whatchanged.improved": "सुधारले",
  "whatchanged.unchanged": "बदलले नाही",
  "whatchanged.conflicting": "परस्पर विरोधी",
  "whatchanged.no_previous_visit": "तुलनेसाठी मागील भेट नाही",
  "whatchanged.evidence_link": "पुरावा पाहा",

  // --- contradiction.* ----------------------------------------------------
  "contradiction.heading": "विसंगती",
  "contradiction.patient_says_none_but_record_has":
    "रुग्ण सांगतो काही नाही, पण नोंदीत {{item}} आहे",
  "contradiction.date_mismatch": "तारखा जुळत नाहीत",
  "contradiction.lab_discordance":
    "प्रयोगशाळेचा निकाल सांगितलेल्या मूल्याशी जुळत नाही",
  "contradiction.needs_resolution": "हे सोडवणे आवश्यक आहे",
  "contradiction.resolve": "सोडवा",
  "contradiction.dismiss": "दुर्लक्ष करा",

  // --- offline.* ----------------------------------------------------------
  "offline.status_online": "ऑनलाइन",
  "offline.status_degraded": "मर्यादित कनेक्शन",
  "offline.status_offline": "ऑफलाइन",
  "offline.queued_notice":
    "तुमची उत्तरे या उपकरणावर सुरक्षित आहेत आणि कनेक्शन आल्यावर पाठवली जातील",
  "offline.syncing": "पाठवत आहे…",
  "offline.synced": "पाठवले",
  "offline.will_sync_later": "नंतर पाठवले जाईल",
  "offline.local_processing_notice": "काम फक्त या उपकरणावर चालू आहे",

  // --- auth.* -------------------------------------------------------------
  "auth.login.title": "साइन इन",
  "auth.login.username": "वापरकर्तानाव",
  "auth.login.password": "पासवर्ड",
  "auth.login.submit": "साइन इन करा",
  "auth.login.invalid": "वापरकर्तानाव किंवा पासवर्ड चुकीचा आहे",
  "auth.login.session_expired":
    "तुमचे सत्र संपले आहे. कृपया पुन्हा साइन इन करा",
  "auth.logout": "साइन आउट",
  "auth.role.physician": "वैद्य",
  "auth.role.nurse": "परिचारिका",
  "auth.role.triage": "ट्रायाज",
  "auth.role.admin": "प्रशासक",
  "auth.role.kiosk": "कियोस्क",

  // --- error.* ------------------------------------------------------------
  "error.generic": "काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा",
  "error.validation": "कृपया तुम्ही भरलेले तपासा",
  "error.not_found": "सापडले नाही",
  "error.forbidden": "हे करण्याची तुम्हाला परवानगी नाही",
  "error.consent_required": "पुढे जाण्यापूर्वी संमती आवश्यक आहे",
  "error.provider_unavailable": "ही सेवा सध्या उपलब्ध नाही",
  "error.document_processing_failed": "कागदपत्र प्रक्रिया करता आले नाही",
  "error.ai_unavailable":
    "सहाय्यक सध्या उपलब्ध नाही. तुम्ही त्याशिवाय पुढे जाऊ शकता",
  "error.network": "कनेक्शन नाही. कृपया नेटवर्क तपासा",
  "error.try_again": "पुन्हा प्रयत्न करा",
  "error.contact_staff": "कृपया कर्मचाऱ्याशी बोला",

  // --- a11y.* -------------------------------------------------------------
  "a11y.screen_reader_hint": "ही स्क्रीन स्क्रीन रीडरसह चालते",
  "a11y.large_text": "मोठा मजकूर",
  "a11y.contrast_high": "उच्च कॉन्ट्रास्ट",
  "a11y.language_switch": "भाषा बदला",
  "a11y.keyboard_hint": "पुढे जाण्यासाठी बाण की आणि निवडण्यासाठी Enter दाबा",
  "a11y.audio_icon_label": "ऑडिओ लावा",
  // --- q.chest_pain.* -----------------------------------------------------
  "q.chest_pain.site": "दुखणे कुठे आहे?",
  "q.chest_pain.onset": "हे कधी सुरू झाले?",
  "q.chest_pain.character": "हे कसे वाटते?",
  "q.chest_pain.radiation": "हे इतर कुठे पसरते का?",
  "q.chest_pain.associated": "यासोबत इतर लक्षणे आहेत का?",
  "q.chest_pain.timing": "हे सतत असते की येऊन जाते?",
  "q.chest_pain.exertion": "चालल्यावर किंवा काम केल्यावर हे सुरू होते का?",
  "q.chest_pain.severity": "आत्ता दुखणे किती आहे?",
  "q.chest_pain.safety_dyspnoea": "तुम्हाला श्वास लागतो का?",
  "q.chest_pain.safety_sweating": "तुम्हाला खूप घाम येतो का?",
  "q.chest_pain.safety_syncope":
    "तुम्ही बेशुद्ध पडले आहात का किंवा बेशुद्ध होण्यासारखे वाटले का?",
  "q.chest_pain.safety_cardiac_history":
    "डॉक्टरांनी कधी सांगितले आहे का की तुम्हाला हृदयाचा त्रास आहे?",
  "q.chest_pain.relief": "काही केल्याने हे बरे होते का?",
  "q.chest_pain.character.opt.pressure": "दाब किंवा आवळणे",
  "q.chest_pain.character.opt.sharp": "तीक्ष्ण किंवा टोचणारे",
  "q.chest_pain.character.opt.burning": "जळजळ",
  "q.chest_pain.character.opt.heaviness": "जडपणा",
  "q.chest_pain.character.opt.tearing": "फाटण्यासारखे",
  "q.chest_pain.radiation.opt.left_arm": "डाव्या हातात",
  "q.chest_pain.radiation.opt.jaw": "जबडा किंवा मानेत",
  "q.chest_pain.radiation.opt.back": "पाठीत",
  "q.chest_pain.radiation.opt.none": "कुठेही नाही",
  "q.chest_pain.timing.opt.continuous": "सतत",
  "q.chest_pain.timing.opt.intermittent": "येऊन जाते",
  "q.chest_pain.timing.opt.episodic": "झटक्यात",
  "q.chest_pain.timing.opt.nocturnal": "रात्री",
  "q.chest_pain.timing.opt.exertional": "श्रम केल्यावर",
  "q.chest_pain.safety_dyspnoea.opt.yes": "होय",
  "q.chest_pain.safety_dyspnoea.opt.no": "नाही",

  // --- q.fever.* ----------------------------------------------------------
  "q.fever.onset": "ताप कधी सुरू झाला?",
  "q.fever.duration": "ताप किती दिवसांपासून आहे?",
  "q.fever.severity": "तापमान किती वाढले होते?",
  "q.fever.pattern": "ताप सतत आहे की येऊन जातो?",
  "q.fever.rash": "कुठे पुरळ उठले आहे का?",
  "q.fever.headache_with_fever": "तापासोबत डोकेदुखी आहे का?",
  "q.fever.neck_stiffness": "मानेत ताठरपणा किंवा वाकवताना दुखणे आहे का?",
  "q.fever.travel": "गेल्या महिन्यात तुम्ही कुठे प्रवास केला होता का?",
  "q.fever.mosquito_exposure": "खूप डास असलेल्या ठिकाणी तुम्ही राहिला आहात का?",
  "q.fever.water_intake": "तुम्ही पाणी पिऊ शकता आणि ते पचते का?",
  // __END__
};
