// File: popup.js
// Neutralize
// privacy-first, zero cloud calls • minimal UI • kind to the reader

/* Popup responsibilities:
   - Builds the little control center (chips, scan buttons)
   - Injects/contacts content.js to scan the active tab
   - Offers paste-text mode for quick drafts
   - Exports a tidy Markdown report
*/

const CATEGORIES = [
  { id: "gender", label: "Gendered" },
  { id: "race", label: "Race/Nationality" },
  { id: "age", label: "Age" },
  { id: "disability", label: "Disability" },
  { id: "religion", label: "Religion" },
  { id: "lgbtq", label: "LGBTQIA+" },
  { id: "socio", label: "Socioeconomic" },
  { id: "legal", label: "Employment/Legal" }
];
