import type { LocaleCode } from "./types";

/** Registration is available only where a complete UI translation exists.
 * Hindi and Marathi remain provisional pending native clinical review. */
export const REGISTRATION_LOCALES = ["en-IN", "hi-IN", "mr-IN"] as const;
export type RegistrationLocale = (typeof REGISTRATION_LOCALES)[number];
export function isRegistrationLocale(
  locale: LocaleCode,
): locale is RegistrationLocale {
  return (REGISTRATION_LOCALES as readonly string[]).includes(locale);
}
const en = {
  "registration.subtitle": "A little preparation. More time for care.",
  "registration.intro":
    "Choose your language, create a visit identity, and decide how your information may be used.",
  "registration.tag": "Patient registration",
  "registration.language": "Language",
  "registration.identity": "Visit identity",
  "registration.consent": "Your choices",
  "registration.receipt": "Saved receipt",
  "registration.start": "Begin registration",
  "registration.unavailable": "Consent translation unavailable",
  "registration.review":
    "Translation is provisional and has not been reviewed by a native-speaking clinician. Ask staff if anything is unclear.",
  "registration.privacy":
    "This screen clears after 5 minutes without activity. Nothing is stored in this browser. Reloading cannot resume your session.",
  "registration.help": "Need a hand? Please ask the reception team.",
  "registration.demo": "Synthetic identity demonstration",
  "registration.demo_notice":
    "Real ABHA verification is unavailable. These demonstrations create synthetic identities only. Do not enter real ABHA or personal details.",
  "registration.guest": "Continue as guest",
  "registration.guest_detail":
    "Create a visit reference without verifying your identity.",
  "registration.otp": "Try synthetic OTP",
  "registration.qr": "Try synthetic QR flow",
  "registration.returning": "Try synthetic returning flow",
  "registration.challenge": "Enter the demonstration code",
  "registration.challenge_detail":
    "Use 123456. No SMS was sent, no QR is scanned, and no real identity is matched.",
  "registration.code": "Six-digit demonstration code",
  "registration.choose_again": "Choose another method",
  "registration.consent_intro":
    "You are in control. Nothing is selected for you. Choose each purpose and the categories you allow, or decline all. Declining is a valid choice.",
  "registration.required": "Needed for future clinical intake; you may decline",
  "registration.allow": "Allow this purpose",
  "registration.action": "Processing action",
  "registration.destination": "Destination",
  "registration.scope.CLINICAL_INTAKE": "Clinical intake for a future visit",
  "registration.scope.RESEARCH": "Research use",
  "registration.scope.AGGREGATE_ANALYTICS": "Aggregated service analytics",
  "registration.scope.TREATING_HOSPITAL": "The treating hospital",
  "registration.scope.HOSPITAL_RESEARCH": "The hospital research team",
  "registration.save": "Save my choices",
  "registration.decline": "Decline all and save",
  "registration.category.session_metrics": "Session usage metrics",
  "registration.saved": "Your choices have been saved",
  "registration.next":
    "Registration and consent are saved. The clinical interview is not available yet. Please speak with the reception team for the next step.",
  "registration.stopped":
    "Your choices were saved. No clinical intake will continue with the consent withheld. Please speak with staff.",
  "registration.revoked":
    "Consent withdrawn. Further consent-dependent processing is stopped. Please speak with staff.",
  "registration.allowed": "Allowed",
  "registration.declined": "Declined",
  "registration.reference": "Receipt reference",
  "registration.saved_at": "Saved at",
  "registration.expires": "Consent expires",
  "registration.finish": "Finish and clear this screen",
  "registration.clear": "End and clear",
  "registration.cleared":
    "This screen has been cleared. Saved registration, consent, and audit records are retained by the service.",
  "registration.wipe_pending":
    "This screen has been cleared. Server cleanup could not be confirmed. Ask staff; the server session still has a finite expiry.",
  "registration.expired":
    "Your session ended and this screen has been cleared. Please start again or ask staff.",
  "registration.remaining": "{{minutes}} min remaining",
  "registration.idle_title": "Are you still here?",
  "registration.idle_body":
    "To protect your privacy, this screen clears in {{seconds}} seconds. The session expiry cannot be extended.",
  "registration.stay": "I am still here",
  "registration.offline":
    "Connection appears offline. No offline registration is available. Your current choices stay on this screen only until it clears.",
  "registration.error":
    "The request could not be completed. Check the connection and retry. Your current choices have not been cleared.",
  "registration.device_rejected":
    "This kiosk's credentials were rejected. Check the kiosk ID and device token with staff, then try again.",
  "registration.otp_error":
    "That demonstration code was not accepted. Use 123456, or choose another method if the code expired.",
  "registration.unavailable_error":
    "This service is unavailable. Please retry or ask reception for help.",
  "registration.loading": "Connecting to the registration service…",
  "registration.empty":
    "Consent wording is not available in this language. Please choose another language or ask staff.",
  "registration.version": "Consent {{version}} · Translation {{translation}}",
  "registration.skip": "Skip to main content",
} as const;
type RegistrationCatalogue = Record<keyof typeof en, string>;
const hi: RegistrationCatalogue = {
  "registration.subtitle": "थोड़ी तैयारी। देखभाल के लिए अधिक समय।",
  "registration.intro":
    "अपनी भाषा चुनें, इस मुलाकात की पहचान बनाएं और तय करें कि आपकी जानकारी का उपयोग कैसे हो।",
  "registration.tag": "रोगी पंजीकरण",
  "registration.language": "भाषा",
  "registration.identity": "मुलाकात की पहचान",
  "registration.consent": "आपके विकल्प",
  "registration.receipt": "सहेजी गई रसीद",
  "registration.start": "पंजीकरण शुरू करें",
  "registration.unavailable": "सहमति का अनुवाद उपलब्ध नहीं है",
  "registration.review":
    "यह अनुवाद अस्थायी है। मातृभाषी चिकित्सक ने इसकी समीक्षा नहीं की है। कुछ अस्पष्ट हो तो कर्मचारियों से पूछें।",
  "registration.privacy":
    "5 मिनट तक कोई गतिविधि न होने पर यह स्क्रीन साफ हो जाती है। ब्राउज़र में कुछ सहेजा नहीं जाता। पेज दोबारा खोलने पर सत्र फिर शुरू नहीं होगा।",
  "registration.help": "मदद चाहिए? कृपया स्वागत कक्ष के कर्मचारियों से पूछें।",
  "registration.demo": "काल्पनिक पहचान का प्रदर्शन",
  "registration.demo_notice":
    "असली ABHA सत्यापन उपलब्ध नहीं है। यह प्रदर्शन केवल काल्पनिक पहचान बनाता है। असली ABHA या निजी जानकारी न डालें।",
  "registration.guest": "अतिथि के रूप में जारी रखें",
  "registration.guest_detail":
    "पहचान सत्यापित किए बिना इस मुलाकात का संदर्भ बनाएं।",
  "registration.otp": "काल्पनिक OTP आज़माएं",
  "registration.qr": "काल्पनिक QR प्रक्रिया आज़माएं",
  "registration.returning": "काल्पनिक दोबारा आने की प्रक्रिया आज़माएं",
  "registration.challenge": "प्रदर्शन का कोड डालें",
  "registration.challenge_detail":
    "123456 डालें। कोई SMS नहीं भेजा गया, कोई QR स्कैन नहीं होगा और किसी असली पहचान से मिलान नहीं होगा।",
  "registration.code": "छह अंकों का प्रदर्शन कोड",
  "registration.choose_again": "दूसरा तरीका चुनें",
  "registration.consent_intro":
    "निर्णय आपका है। कोई विकल्प पहले से नहीं चुना गया है। हर उद्देश्य और जानकारी की श्रेणी चुनें या सभी अस्वीकार करें। अस्वीकार करना मान्य है।",
  "registration.required":
    "आगे की चिकित्सकीय जानकारी के लिए आवश्यक; आप मना कर सकते हैं",
  "registration.allow": "इस उद्देश्य की अनुमति दें",
  "registration.action": "जानकारी पर की जाने वाली प्रक्रिया",
  "registration.destination": "जानकारी का गंतव्य",
  "registration.scope.CLINICAL_INTAKE":
    "आगे की मुलाकात के लिए चिकित्सकीय जानकारी",
  "registration.scope.RESEARCH": "शोध में उपयोग",
  "registration.scope.AGGREGATE_ANALYTICS":
    "सेवा के संयुक्त आंकड़ों का विश्लेषण",
  "registration.scope.TREATING_HOSPITAL": "इलाज करने वाला अस्पताल",
  "registration.scope.HOSPITAL_RESEARCH": "अस्पताल की शोध टीम",
  "registration.save": "मेरे विकल्प सहेजें",
  "registration.decline": "सभी अस्वीकार करके सहेजें",
  "registration.category.session_metrics": "सत्र के उपयोग के आंकड़े",
  "registration.saved": "आपके विकल्प सहेज लिए गए हैं",
  "registration.next":
    "पंजीकरण और सहमति सहेज लिए गए हैं। चिकित्सकीय साक्षात्कार अभी उपलब्ध नहीं है। अगला कदम जानने के लिए स्वागत कक्ष से संपर्क करें।",
  "registration.stopped":
    "आपके विकल्प सहेज लिए गए हैं। सहमति न मिलने पर चिकित्सकीय जानकारी लेना जारी नहीं होगा। कृपया कर्मचारियों से बात करें।",
  "registration.revoked":
    "सहमति वापस ले ली गई है। सहमति पर निर्भर आगे की प्रक्रिया रोक दी गई है। कृपया कर्मचारियों से बात करें।",
  "registration.allowed": "अनुमति दी",
  "registration.declined": "अस्वीकार किया",
  "registration.reference": "रसीद संदर्भ",
  "registration.saved_at": "सहेजने का समय",
  "registration.expires": "सहमति की समाप्ति",
  "registration.finish": "समाप्त करें और स्क्रीन साफ करें",
  "registration.clear": "समाप्त करके साफ करें",
  "registration.cleared":
    "यह स्क्रीन साफ कर दी गई है। सहेजे गए पंजीकरण, सहमति और लेखा रिकॉर्ड सेवा के पास रखे जाते हैं।",
  "registration.wipe_pending":
    "यह स्क्रीन साफ कर दी गई है। सर्वर की सफाई की पुष्टि नहीं हो सकी। कर्मचारियों से पूछें; सर्वर सत्र की समाप्ति तय है।",
  "registration.expired":
    "आपका सत्र समाप्त हुआ और स्क्रीन साफ कर दी गई है। फिर शुरू करें या कर्मचारियों से पूछें।",
  "registration.remaining": "{{minutes}} मिनट बाकी",
  "registration.idle_title": "क्या आप अभी यहां हैं?",
  "registration.idle_body":
    "आपकी गोपनीयता के लिए स्क्रीन {{seconds}} सेकंड में साफ होगी। सत्र की समाप्ति आगे नहीं बढ़ाई जा सकती।",
  "registration.stay": "मैं अभी यहां हूं",
  "registration.offline":
    "कनेक्शन बंद लगता है। ऑफलाइन पंजीकरण उपलब्ध नहीं है। स्क्रीन साफ होने तक आपके विकल्प केवल इसी स्क्रीन पर रहेंगे।",
  "registration.error":
    "अनुरोध पूरा नहीं हो सका। कनेक्शन जांचकर फिर प्रयास करें। आपके वर्तमान विकल्प साफ नहीं किए गए हैं।",
  "registration.device_rejected":
    "इस कियोस्क की जानकारी स्वीकार नहीं हुई। कियोस्क ID और डिवाइस टोकन स्टाफ से जांचकर फिर कोशिश करें।",
  "registration.otp_error":
    "यह प्रदर्शन कोड स्वीकार नहीं हुआ। 123456 डालें या कोड समाप्त होने पर दूसरा तरीका चुनें।",
  "registration.unavailable_error":
    "यह सेवा उपलब्ध नहीं है। फिर प्रयास करें या स्वागत कक्ष से मदद लें।",
  "registration.loading": "पंजीकरण सेवा से जुड़ रहे हैं…",
  "registration.empty":
    "इस भाषा में सहमति का पाठ उपलब्ध नहीं है। दूसरी भाषा चुनें या कर्मचारियों से पूछें।",
  "registration.version": "सहमति {{version}} · अनुवाद {{translation}}",
  "registration.skip": "मुख्य सामग्री पर जाएं",
};
const mr: RegistrationCatalogue = {
  "registration.subtitle": "थोडी तयारी. काळजीसाठी अधिक वेळ.",
  "registration.intro":
    "तुमची भाषा निवडा, या भेटीची ओळख तयार करा आणि तुमची माहिती कशी वापरावी ते ठरवा.",
  "registration.tag": "रुग्ण नोंदणी",
  "registration.language": "भाषा",
  "registration.identity": "भेटीची ओळख",
  "registration.consent": "तुमचे पर्याय",
  "registration.receipt": "जतन केलेली पावती",
  "registration.start": "नोंदणी सुरू करा",
  "registration.unavailable": "संमतीचे भाषांतर उपलब्ध नाही",
  "registration.review":
    "हे भाषांतर तात्पुरते आहे. मातृभाषिक डॉक्टरांनी त्याचे पुनरावलोकन केलेले नाही. काही अस्पष्ट असल्यास कर्मचाऱ्यांना विचारा.",
  "registration.privacy":
    "5 मिनिटे कोणतीही हालचाल नसल्यास ही स्क्रीन साफ होते. ब्राउझरमध्ये काहीही साठवले जात नाही. पान पुन्हा उघडल्यावर सत्र सुरू ठेवता येणार नाही.",
  "registration.help":
    "मदत हवी आहे? कृपया स्वागत कक्षातील कर्मचाऱ्यांना विचारा.",
  "registration.demo": "काल्पनिक ओळखीचे प्रात्यक्षिक",
  "registration.demo_notice":
    "खरे ABHA सत्यापन उपलब्ध नाही. हे प्रात्यक्षिक फक्त काल्पनिक ओळख तयार करते. खरे ABHA किंवा वैयक्तिक माहिती भरू नका.",
  "registration.guest": "अतिथी म्हणून पुढे जा",
  "registration.guest_detail": "ओळख सत्यापित न करता या भेटीचा संदर्भ तयार करा.",
  "registration.otp": "काल्पनिक OTP वापरून पाहा",
  "registration.qr": "काल्पनिक QR प्रक्रिया पाहा",
  "registration.returning": "काल्पनिक पुन्हा भेटीची प्रक्रिया पाहा",
  "registration.challenge": "प्रात्यक्षिकाचा कोड भरा",
  "registration.challenge_detail":
    "123456 भरा. SMS पाठवलेला नाही, QR स्कॅन होणार नाही आणि खऱ्या ओळखीशी जुळवणी होणार नाही.",
  "registration.code": "सहा अंकी प्रात्यक्षिक कोड",
  "registration.choose_again": "दुसरी पद्धत निवडा",
  "registration.consent_intro":
    "निर्णय तुमचा आहे. कोणताही पर्याय आधीच निवडलेला नाही. प्रत्येक उद्देश आणि माहितीची श्रेणी निवडा किंवा सर्व नाकारा. नकार देणे मान्य आहे.",
  "registration.required":
    "पुढील वैद्यकीय माहितीसाठी आवश्यक; तुम्ही नकार देऊ शकता",
  "registration.allow": "या उद्देशाला परवानगी द्या",
  "registration.action": "माहितीवर होणारी प्रक्रिया",
  "registration.destination": "माहितीचे गंतव्य",
  "registration.scope.CLINICAL_INTAKE": "पुढील भेटीसाठी वैद्यकीय माहिती",
  "registration.scope.RESEARCH": "संशोधनासाठी वापर",
  "registration.scope.AGGREGATE_ANALYTICS":
    "सेवेच्या एकत्रित आकडेवारीचे विश्लेषण",
  "registration.scope.TREATING_HOSPITAL": "उपचार करणारे रुग्णालय",
  "registration.scope.HOSPITAL_RESEARCH": "रुग्णालयाचा संशोधन संघ",
  "registration.save": "माझे पर्याय जतन करा",
  "registration.decline": "सर्व नाकारून जतन करा",
  "registration.category.session_metrics": "सत्राच्या वापराची आकडेवारी",
  "registration.saved": "तुमचे पर्याय जतन केले आहेत",
  "registration.next":
    "नोंदणी आणि संमती जतन केली आहे. वैद्यकीय मुलाखत अद्याप उपलब्ध नाही. पुढील टप्प्यासाठी स्वागत कक्षाशी संपर्क साधा.",
  "registration.stopped":
    "तुमचे पर्याय जतन केले आहेत. संमती नसल्याने वैद्यकीय माहिती घेणे पुढे सुरू राहणार नाही. कृपया कर्मचाऱ्यांशी बोला.",
  "registration.revoked":
    "संमती मागे घेतली आहे. संमतीवर अवलंबून पुढील प्रक्रिया थांबवली आहे. कृपया कर्मचाऱ्यांशी बोला.",
  "registration.allowed": "परवानगी दिली",
  "registration.declined": "नाकारले",
  "registration.reference": "पावती संदर्भ",
  "registration.saved_at": "जतन केल्याची वेळ",
  "registration.expires": "संमतीची मुदत",
  "registration.finish": "पूर्ण करा आणि स्क्रीन साफ करा",
  "registration.clear": "समाप्त करून साफ करा",
  "registration.cleared":
    "ही स्क्रीन साफ केली आहे. जतन केलेली नोंदणी, संमती आणि लेखा नोंदी सेवेकडे ठेवल्या जातात.",
  "registration.wipe_pending":
    "ही स्क्रीन साफ केली आहे. सर्व्हर साफ झाल्याची खात्री नाही. कर्मचाऱ्यांना विचारा; सर्व्हर सत्राची मुदत निश्चित आहे.",
  "registration.expired":
    "तुमचे सत्र संपले आणि स्क्रीन साफ केली आहे. पुन्हा सुरू करा किंवा कर्मचाऱ्यांना विचारा.",
  "registration.remaining": "{{minutes}} मिनिटे बाकी",
  "registration.idle_title": "तुम्ही अजून येथे आहात का?",
  "registration.idle_body":
    "गोपनीयतेसाठी ही स्क्रीन {{seconds}} सेकंदांत साफ होईल. सत्राची मुदत वाढवता येत नाही.",
  "registration.stay": "मी अजून येथे आहे",
  "registration.offline":
    "कनेक्शन बंद वाटते. ऑफलाइन नोंदणी उपलब्ध नाही. स्क्रीन साफ होईपर्यंत तुमचे पर्याय फक्त याच स्क्रीनवर राहतील.",
  "registration.error":
    "विनंती पूर्ण झाली नाही. कनेक्शन तपासून पुन्हा प्रयत्न करा. तुमचे सध्याचे पर्याय साफ केलेले नाहीत.",
  "registration.device_rejected":
    "या कियोस्कची माहिती स्वीकारली गेली नाही. कियोस्क ID आणि डिवाइस टोकन कर्मचाऱ्यांकडून तपासून पुन्हा प्रयत्न करा.",
  "registration.otp_error":
    "हा प्रात्यक्षिक कोड स्वीकारला नाही. 123456 भरा किंवा मुदत संपल्यास दुसरी पद्धत निवडा.",
  "registration.unavailable_error":
    "ही सेवा उपलब्ध नाही. पुन्हा प्रयत्न करा किंवा स्वागत कक्षाची मदत घ्या.",
  "registration.loading": "नोंदणी सेवेशी जोडत आहोत…",
  "registration.empty":
    "या भाषेत संमतीचा मजकूर उपलब्ध नाही. दुसरी भाषा निवडा किंवा कर्मचाऱ्यांना विचारा.",
  "registration.version": "संमती {{version}} · भाषांतर {{translation}}",
  "registration.skip": "मुख्य मजकुराकडे जा",
};
export const REGISTRATION_CATALOGUES = {
  "en-IN": en,
  "hi-IN": hi,
  "mr-IN": mr,
};
