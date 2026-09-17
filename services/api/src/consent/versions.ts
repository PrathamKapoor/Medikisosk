export const CONSENT_VERSION = "1.1.0";
export const TRANSLATION_VERSION = "1.1.0-draft";
export const CONSENT_LOCALES = ["en-IN", "hi-IN", "mr-IN"] as const;
const wording: Record<string, readonly string[]> = {
  "en-IN": [
    "I allow the treating hospital to collect and use only the selected data categories for clinical intake. This demo currently records synthetic registration and consent only; it does not provide medical care.",
    "I separately allow the selected data categories to be used for hospital research. Declining does not affect treatment.",
    "I separately allow session metrics to be used for aggregate hospital analytics. Declining does not affect treatment.",
  ],
  "hi-IN": [
    "मैं इलाज करने वाले अस्पताल को केवल चुनी गई डेटा श्रेणियों को नैदानिक जानकारी लेने के लिए एकत्र और उपयोग करने की अनुमति देता/देती हूँ। यह डेमो अभी केवल काल्पनिक पंजीकरण और सहमति दर्ज करता है; यह चिकित्सा सेवा नहीं देता।",
    "मैं चुनी गई डेटा श्रेणियों को अस्पताल के शोध के लिए अलग से अनुमति देता/देती हूँ। मना करने से इलाज प्रभावित नहीं होगा।",
    "मैं सत्र के आँकड़ों को अस्पताल के सामूहिक विश्लेषण के लिए अलग से अनुमति देता/देती हूँ। मना करने से इलाज प्रभावित नहीं होगा।",
  ],
  "mr-IN": [
    "मी उपचार करणाऱ्या रुग्णालयाला केवळ निवडलेल्या डेटा श्रेणी वैद्यकीय माहिती संकलनासाठी गोळा करण्याची आणि वापरण्याची परवानगी देतो/देते. हा डेमो सध्या फक्त काल्पनिक नोंदणी आणि संमती नोंदवतो; वैद्यकीय सेवा देत नाही.",
    "मी निवडलेल्या डेटा श्रेणी रुग्णालयाच्या संशोधनासाठी वापरण्यास स्वतंत्र परवानगी देतो/देते. नकार दिल्याने उपचारांवर परिणाम होणार नाही.",
    "मी सत्राची आकडेवारी रुग्णालयाच्या एकत्रित विश्लेषणासाठी वापरण्यास स्वतंत्र परवानगी देतो/देते. नकार दिल्याने उपचारांवर परिणाम होणार नाही.",
  ],
};
export function consentPurposes(locale: string) {
  const statements = wording[locale];
  if (!statements) throw new Error("Unsupported consent locale");
  return [
    {
      key: "treatment",
      required: true,
      categories: ["IDENTITY", "SYMPTOMS", "DOCUMENTS", "VOICE", "VITALS"],
      action: "CLINICAL_INTAKE",
      destination: "TREATING_HOSPITAL",
    },
    {
      key: "research",
      required: false,
      categories: ["SYMPTOMS", "VITALS"],
      action: "RESEARCH",
      destination: "HOSPITAL_RESEARCH",
    },
    {
      key: "analytics",
      required: false,
      categories: ["SESSION_METRICS"],
      action: "AGGREGATE_ANALYTICS",
      destination: "TREATING_HOSPITAL",
    },
  ].map((purpose, index) => ({
    ...purpose,
    statementKey: `consent.purpose.${purpose.key}`,
    statement: statements[index]!,
    translationVersion: TRANSLATION_VERSION,
  }));
}
