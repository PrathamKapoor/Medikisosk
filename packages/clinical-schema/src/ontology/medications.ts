/**
 * Medication vocabulary.
 *
 * Includes generic names, common Indian brand names and class membership, because a patient
 * brings a handwritten prescription that says a brand, and reconciling brands against generics is
 * where medication errors are created and prevented. Brand names are listed as synonyms for
 * matching only; the record always stores the generic concept code so that reconciliation and
 * interaction reasoning operate on the ingredient rather than on a trade name.
 *
 * IMPORTANT: MediKiosk performs no autonomous prescribing and no autonomous dose calculation. This
 * vocabulary exists to read, reconcile and display what a clinician or a document already stated.
 */

import type { ClinicalConcept } from "../concept";

const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";

function medication(
  code: string,
  display: string,
  drugClass: string,
  synonyms: readonly string[],
  rxnorm?: string,
): ClinicalConcept {
  return {
    code,
    category: "MEDICATION",
    display,
    synonyms: [...synonyms],
    standardCoding: rxnorm ? [{ system: RXNORM, code: rxnorm, display }] : [],
    pathways: [],
    redFlagRelevant: false,
    potentiallyEmergent: false,
    notes: `Drug class: ${drugClass}.`,
  };
}

export const MEDICATION_CONCEPTS: readonly ClinicalConcept[] = [
  medication(
    "MK-MED-001",
    "Metformin",
    "Biguanide",
    [
      "metformin",
      "glycomet",
      "glucophage",
      "metformin hydrochloride",
      "मेटफॉर्मिन",
    ],
    "6809",
  ),
  medication(
    "MK-MED-002",
    "Glimepiride",
    "Sulfonylurea",
    ["glimepiride", "amaryl", "glimperide"],
    "25789",
  ),
  medication("MK-MED-003", "Insulin", "Insulin", [
    "insulin",
    "human insulin",
    "insulin regular",
    "इंसुलिन",
  ]),
  medication(
    "MK-MED-004",
    "Amlodipine",
    "Calcium channel blocker",
    ["amlodipine", "amlopres", "amlokind", "एम्लोडिपिन"],
    "17767",
  ),
  medication(
    "MK-MED-005",
    "Telmisartan",
    "Angiotensin receptor blocker",
    ["telmisartan", "telma", "telmikind"],
    "73494",
  ),
  medication(
    "MK-MED-006",
    "Losartan",
    "Angiotensin receptor blocker",
    ["losartan", "losar", "repace"],
    "52175",
  ),
  medication(
    "MK-MED-007",
    "Ramipril",
    "ACE inhibitor",
    ["ramipril", "cardace", "ramicard"],
    "35296",
  ),
  medication(
    "MK-MED-008",
    "Enalapril",
    "ACE inhibitor",
    ["enalapril", "envas"],
    "3827",
  ),
  medication(
    "MK-MED-009",
    "Atenolol",
    "Beta blocker",
    ["atenolol", "aten", "टेनोलोल"],
    "1202",
  ),
  medication(
    "MK-MED-010",
    "Metoprolol",
    "Beta blocker",
    ["metoprolol", "metolar", "metoprolol succinate"],
    "6918",
  ),
  medication(
    "MK-MED-011",
    "Atorvastatin",
    "Statin",
    ["atorvastatin", "atorva", "storvas", "एटोरवास्टेटिन"],
    "83367",
  ),
  medication(
    "MK-MED-012",
    "Aspirin",
    "Antiplatelet",
    ["aspirin", "ecosprin", "disprin", "acetylsalicylic acid", "एस्पिरिन"],
    "1191",
  ),
  medication(
    "MK-MED-013",
    "Clopidogrel",
    "Antiplatelet",
    ["clopidogrel", "clopilet", "deplatt"],
    "32968",
  ),
  medication(
    "MK-MED-014",
    "Warfarin",
    "Anticoagulant",
    ["warfarin", "warf", "वारफारिन"],
    "11289",
  ),
  medication(
    "MK-MED-015",
    "Furosemide",
    "Loop diuretic",
    ["furosemide", "frusemide", "lasix"],
    "4603",
  ),
  medication(
    "MK-MED-016",
    "Hydrochlorothiazide",
    "Thiazide diuretic",
    ["hydrochlorothiazide", "hctz", "aquazide"],
    "5487",
  ),
  medication(
    "MK-MED-017",
    "Paracetamol",
    "Analgesic and antipyretic",
    ["paracetamol", "acetaminophen", "crocin", "dolo", "calpol", "पैरासिटामोल"],
    "161",
  ),
  medication(
    "MK-MED-018",
    "Ibuprofen",
    "NSAID",
    ["ibuprofen", "brufen", "combiflam"],
    "5640",
  ),
  medication(
    "MK-MED-019",
    "Diclofenac",
    "NSAID",
    ["diclofenac", "voveran", "dynapar"],
    "3355",
  ),
  medication(
    "MK-MED-020",
    "Amoxicillin",
    "Penicillin antibiotic",
    ["amoxicillin", "mox", "novamox"],
    "723",
  ),
  medication(
    "MK-MED-021",
    "Amoxicillin and clavulanate",
    "Penicillin antibiotic",
    ["amoxicillin clavulanate", "co-amoxiclav", "augmentin", "clavam"],
    "19711",
  ),
  medication(
    "MK-MED-022",
    "Azithromycin",
    "Macrolide antibiotic",
    ["azithromycin", "azithral", "zithromax"],
    "18631",
  ),
  medication(
    "MK-MED-023",
    "Ceftriaxone",
    "Cephalosporin antibiotic",
    ["ceftriaxone", "monocef", "intacef"],
    "2193",
  ),
  medication(
    "MK-MED-024",
    "Metronidazole",
    "Nitroimidazole antibiotic",
    ["metronidazole", "flagyl", "metrogyl"],
    "6922",
  ),
  medication(
    "MK-MED-025",
    "Cotrimoxazole",
    "Sulfonamide antibiotic",
    ["cotrimoxazole", "trimethoprim sulfamethoxazole", "septran", "bactrim"],
    "10180",
  ),
  medication(
    "MK-MED-026",
    "Salbutamol",
    "Short acting beta agonist",
    ["salbutamol", "albuterol", "asthalin", "ventorlin"],
    "435",
  ),
  medication(
    "MK-MED-027",
    "Budesonide and formoterol",
    "Inhaled corticosteroid combination",
    ["budesonide formoterol", "foracort", "symbicort"],
    "1768882",
  ),
  medication(
    "MK-MED-028",
    "Prednisolone",
    "Corticosteroid",
    ["prednisolone", "omnacortil", "wysolone"],
    "8638",
  ),
  medication(
    "MK-MED-029",
    "Levothyroxine",
    "Thyroid hormone",
    ["levothyroxine", "thyronorm", "eltroxin", "थायरॉक्सिन"],
    "10582",
  ),
  medication(
    "MK-MED-030",
    "Pantoprazole",
    "Proton pump inhibitor",
    ["pantoprazole", "pan", "pantop"],
    "40790",
  ),
  medication(
    "MK-MED-031",
    "Omeprazole",
    "Proton pump inhibitor",
    ["omeprazole", "omez"],
    "7646",
  ),
  medication(
    "MK-MED-032",
    "Ondansetron",
    "Antiemetic",
    ["ondansetron", "emeset", "vomikind"],
    "26225",
  ),
  medication(
    "MK-MED-033",
    "Cetirizine",
    "Antihistamine",
    ["cetirizine", "cetzine", "alerid"],
    "20610",
  ),
  medication(
    "MK-MED-034",
    "Isoniazid",
    "Antitubercular",
    ["isoniazid", "inh"],
    "6038",
  ),
  medication(
    "MK-MED-035",
    "Rifampicin",
    "Antitubercular",
    ["rifampicin", "rifampin", "rimactane"],
    "9384",
  ),
  medication(
    "MK-MED-036",
    "Pyrazinamide",
    "Antitubercular",
    ["pyrazinamide", "pza"],
    "8976",
  ),
  medication(
    "MK-MED-037",
    "Ethambutol",
    "Antitubercular",
    ["ethambutol", "combutol"],
    "4110",
  ),
  medication(
    "MK-MED-038",
    "Clonazepam",
    "Benzodiazepine",
    ["clonazepam", "rivotril", "clonotril"],
    "2598",
  ),
  medication(
    "MK-MED-039",
    "Phenytoin",
    "Antiepileptic",
    ["phenytoin", "eptoin", "dilantin"],
    "8183",
  ),
  medication(
    "MK-MED-040",
    "Levetiracetam",
    "Antiepileptic",
    ["levetiracetam", "levipil", "keppra"],
    "114477",
  ),
];
