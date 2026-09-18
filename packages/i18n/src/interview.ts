import type { LocaleCode } from "./types";

/** Interview stage is available only where a complete UI translation exists.
 * Hindi and Marathi remain provisional pending native clinical review. */
export const INTERVIEW_LOCALES = ["en-IN", "hi-IN", "mr-IN"] as const;
export type InterviewLocale = (typeof INTERVIEW_LOCALES)[number];
export function isInterviewLocale(
  locale: LocaleCode,
): locale is InterviewLocale {
  return (INTERVIEW_LOCALES as readonly string[]).includes(locale);
}
const en = {
  "interview.title": "Clinical interview",
  "interview.start": "Begin clinical interview",
  "interview.begin": "Start the interview",
  "interview.complaint": "What brings you here today?",
  "interview.complaint_detail":
    "Choose the main reason for this visit. The care team will ask the follow-up questions.",
  "interview.loading": "Preparing your questions…",
  "interview.question_of": "Question {{current}} of {{total}}",
  "interview.yes": "Yes",
  "interview.no": "No",
  "interview.unknown": "I don't know",
  "interview.skip": "Skip",
  "interview.decline": "Prefer not to answer",
  "interview.acknowledge": "OK, continue",
  "interview.unsupported_document":
    "Document upload is not yet available. Please tell a member of staff about this later.",
  "interview.ready_for_review": "Your answers have been reviewed",
  "interview.review_required":
    "A priority assessment is needed. A staff member will see your answers immediately. This is not a diagnosis.",
  "interview.priority_alert":
    "Priority assessment required. A staff member will see your answers immediately.",
  "interview.priority_message":
    "Your answers have been sent to the care team. Please wait and speak with staff.",
  "interview.green": "Proceed to the general queue",
  "interview.amber":
    "You should be seen soon. Please wait near the counter and tell staff if you feel worse",
  "interview.red": "Please wait; staff have been notified",
  "interview.complete": "Interview complete",
  "interview.incomplete": "Interview incomplete",
  "interview.outstanding": "{{count}} question/s still to answer",
  "interview.submit": "Submit answers",
  "interview.finish": "Finish and clear this screen",
  "interview.submitted": "Your answers have been submitted",
  "interview.retry": "Retry",
  "interview.error":
    "The request could not be completed. Check the connection and retry. Your answers so far are kept.",
  "interview.clarification_notice":
    "To be sure I understood, please answer this again.",
  "interview.previous_answer": "Your earlier answer: {{answer}}",
  "interview.consent_required_notice":
    "You did not give permission for your symptoms and history to be used, so the clinical interview cannot begin here. Please tell a staff member if you change your mind.",
  "voice.listen": "Tap and speak your answer",
  "voice.stop_listening": "Stop listening",
  "voice.transcribing": "Processing what you said…",
  "voice.confirm_answer": "I understood this. Is it right?",
  "voice.confirm_yes": "Yes, that is right",
  "voice.retry_voice": "I said something else",
  "voice.type_instead": "Type instead",
  "voice.no_speech":
    "I did not hear anything. Please try again, or use the buttons.",
  "voice.mic_permission":
    "Microphone access was not allowed. Please use the buttons, or allow the microphone and try again.",
  "voice.mic_unsupported":
    "Voice input is not supported on this device. Please use the buttons.",
  "voice.read_aloud": "Read aloud",
  "voice.stop_reading": "Stop reading",
} as const;
type InterviewCatalogue = Record<keyof typeof en, string>;
const hi: InterviewCatalogue = {
  "interview.title": "चिकित्सकीय साक्षात्कार",
  "interview.start": "चिकित्सकीय साक्षात्कार शुरू करें",
  "interview.begin": "साक्षात्कार शुरू करें",
  "interview.complaint": "आज आपको क्या परेशानी है?",
  "interview.complaint_detail":
    "इस मुलाकात का मुख्य कारण चुनें। देखभाल दल आगे के प्रश्न पूछेगा।",
  "interview.loading": "आपके प्रश्न तैयार हो रहे हैं…",
  "interview.question_of": "प्रश्न {{current}} / {{total}}",
  "interview.yes": "हां",
  "interview.no": "नहीं",
  "interview.unknown": "मुझे नहीं पता",
  "interview.skip": "छोड़ें",
  "interview.decline": "जवाब न देना चाहूंगा/चाहूंगी",
  "interview.acknowledge": "ठीक है, जारी रखें",
  "interview.unsupported_document":
    "दस्तावेज़ अपलोड अभी उपलब्ध नहीं है। कृपया बाद में कर्मचारियों को बताएं।",
  "interview.ready_for_review": "आपके उत्तरों की समीक्षा हो चुकी है",
  "interview.review_required":
    "प्राथमिकता मूल्यांकन आवश्यक है। एक कर्मचारी आपके उत्तर तुरंत देखेगा। यह निदान नहीं है।",
  "interview.priority_alert":
    "प्राथमिकता मूल्यांकन आवश्यक है। एक कर्मचारी आपके उत्तर तुरंत देखेगा।",
  "interview.priority_message":
    "आपके उत्तर देखभाल दल को भेज दिए गए हैं। कृपया प्रतीक्षा करें और कर्मचारियों से बात करें।",
  "interview.green": "सामान्य कतार में जाएं",
  "interview.amber":
    "आपको जल्द देखा जाना चाहिए। कृपया काउंटर के पास प्रतीक्षा करें और बदतर महसूस होने पर कर्मचारियों को बताएं",
  "interview.red": "कृपया प्रतीक्षा करें; कर्मचारियों को सूचित कर दिया गया है",
  "interview.complete": "साक्षात्कार पूर्ण",
  "interview.incomplete": "साक्षात्कार अधूरा",
  "interview.outstanding": "{{count}} प्रश्न अभी भी अनुत्तरित हैं",
  "interview.submit": "उत्तर जमा करें",
  "interview.finish": "समाप्त करें और स्क्रीन साफ करें",
  "interview.submitted": "आपके उत्तर जमा कर दिए गए हैं",
  "interview.retry": "फिर प्रयास करें",
  "interview.error":
    "अनुरोध पूरा नहीं हो सका। कनेक्शन जांचकर फिर प्रयास करें। आपके अब तक के उत्तर सुरक्षित हैं।",
  "interview.clarification_notice":
    "सुनिश्चित करने के लिए कृपया इसे फिर से उत्तर दें।",
  "interview.previous_answer": "आपका पिछला उत्तर: {{answer}}",
  "interview.consent_required_notice":
    "आपने अपने लक्षणों और इतिहास के उपयोग की अनुमति नहीं दी, इसलिए चिकित्सकीय साक्षात्कार यहाँ शुरू नहीं हो सकता। मन बदलने पर कृपया कर्मचारियों को बताएं।",
  "voice.listen": "बोलने के लिए दबाएं और अपना उत्तर दें",
  "voice.stop_listening": "सुनना बंद करें",
  "voice.transcribing": "आपकी बात संसाधित हो रही है…",
  "voice.confirm_answer": "मैंने यह समझा। क्या यह सही है?",
  "voice.confirm_yes": "हां, यह सही है",
  "voice.retry_voice": "मैंने कुछ और कहा था",
  "voice.type_instead": "लिखकर बताएं",
  "voice.no_speech":
    "मुझे कुछ सुनाई नहीं दिया। कृपया फिर प्रयास करें, या बटन का उपयोग करें।",
  "voice.mic_permission":
    "माइक्रोफोन की अनुमति नहीं दी गई। कृपया बटन का उपयोग करें, या माइक्रोफोन की अनुमति देकर फिर प्रयास करें।",
  "voice.mic_unsupported":
    "इस डिवाइस पर आवाज इनपुट समर्थित नहीं है। कृपया बटन का उपयोग करें।",
  "voice.read_aloud": "ज़ोर से पढ़ें",
  "voice.stop_reading": "पढ़ना बंद करें",
};
const mr: InterviewCatalogue = {
  "interview.title": "वैद्यकीय मुलाखत",
  "interview.start": "वैद्यकीय मुलाखत सुरू करा",
  "interview.begin": "मुलाखत सुरू करा",
  "interview.complaint": "आज तुम्हाला काय त्रास आहे?",
  "interview.complaint_detail":
    "या भेटीचे मुख्य कारण निवडा. काळजी पथ पुढील प्रश्न विचारेल.",
  "interview.loading": "तुमचे प्रश्न तयार होत आहेत…",
  "interview.question_of": "प्रश्न {{current}} / {{total}}",
  "interview.yes": "होय",
  "interview.no": "नाही",
  "interview.unknown": "मला माहीत नाही",
  "interview.skip": "वगळा",
  "interview.decline": "उत्तर देऊ इच्छित नाही",
  "interview.acknowledge": "ठीक आहे, पुढे जा",
  "interview.unsupported_document":
    "दस्तऐवज अपलोड अद्याप उपलब्ध नाही. कृपया नंतर कर्मचाऱ्यांना सांगा.",
  "interview.ready_for_review": "तुमच्या उत्तरांचे पुनरावलोकन झाले आहे",
  "interview.review_required":
    "प्राधान्य मूल्यांकन आवश्यक आहे. कर्मचारी तुमची उत्तरे लगेच पाहतील. हे निदान नाही.",
  "interview.priority_alert":
    "प्राधान्य मूल्यांकन आवश्यक आहे. कर्मचारी तुमची उत्तरे लगेच पाहतील.",
  "interview.priority_message":
    "तुमची उत्तरे काळजी पथाला पाठवली आहेत. कृपया थांबा आणि कर्मचाऱ्यांशी बोला.",
  "interview.green": "सामान्य रांगेत जा",
  "interview.amber":
    "तुम्हाला लवकर भेटले पाहिजे. कृपया काउंटरजवळ थांबा आणि बरे वाटत नसल्यास कर्मचाऱ्यांना सांगा",
  "interview.red": "कृपया थांबा; कर्मचाऱ्यांना कळवले आहे",
  "interview.complete": "मुलाखत पूर्ण",
  "interview.incomplete": "मुलाखत अपूर्ण",
  "interview.outstanding": "{{count}} प्रश्न अद्याप अनुत्तरित",
  "interview.submit": "उत्तरे सादर करा",
  "interview.finish": "पूर्ण करा आणि स्क्रीन साफ करा",
  "interview.submitted": "तुमची उत्तरे सादर केली आहेत",
  "interview.retry": "पुन्हा प्रयत्न करा",
  "interview.error":
    "विनंती पूर्ण झाली नाही. कनेक्शन तपासून पुन्हा प्रयत्न करा. तुमची आतापर्यंतची उत्तरे सुरक्षित आहेत.",
  "interview.clarification_notice":
    "खात्री करण्यासाठी कृपया पुन्हा उत्तर द्या.",
  "interview.previous_answer": "तुमचे मागील उत्तर: {{answer}}",
  "interview.consent_required_notice":
    "तुम्ही तुमची लक्षणे आणि इतिहास वापरण्याची परवानगी दिली नाही, म्हणून वैद्यकीय मुलाखत येथे सुरू होऊ शकत नाही. मन बदलल्यास कृपया कर्मचाऱ्यांना सांगा.",
  "voice.listen": "बोलण्यासाठी दाबा आणि तुमचे उत्तर द्या",
  "voice.stop_listening": "ऐकणे थांबवा",
  "voice.transcribing": "तुमचे बोलणे प्रक्रिया होत आहे…",
  "voice.confirm_answer": "मी हे समजलो/समजले. बरोबर आहे का?",
  "voice.confirm_yes": "होय, ते बरोबर आहे",
  "voice.retry_voice": "मी काहीतरी वेगळे म्हणालो/म्हणाले",
  "voice.type_instead": "लिहून सांगा",
  "voice.no_speech":
    "मला काही ऐकू आले नाही. कृपया पुन्हा प्रयत्न करा, किंवा बटणे वापरा.",
  "voice.mic_permission":
    "मायक्रोफोनची परवानगी दिली नाही. कृपया बटणे वापरा, किंवा मायक्रोफोन परवानगी देऊन पुन्हा प्रयत्न करा.",
  "voice.mic_unsupported":
    "या डिव्हाइसवर आवाज इनपुट समर्थित नाही. कृपया बटणे वापरा.",
  "voice.read_aloud": "मोठ्याने वाचा",
  "voice.stop_reading": "वाचणे थांबवा",
};
export const INTERVIEW_CATALOGUES = {
  "en-IN": en,
  "hi-IN": hi,
  "mr-IN": mr,
};
