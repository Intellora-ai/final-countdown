/**
 * OFFICIAL CURRICULUM SOURCES — CBSE 2026-27
 *
 * Every entry is a document CBSE itself published. No coaching site, no
 * summary, no aggregator. The URLs were read off the official index at
 * https://cbseacademic.nic.in/curriculum_2027.html on 2026-08-25.
 *
 * TWO PARTS, AND THE DIFFERENCE MATTERS
 *     SecPart1 documents cover Classes IX-X. SecPart2 documents cover Classes
 *     XI-XII, usually in a single PDF for both years. The `classes` field on
 *     each entry records which years the document actually governs, so a
 *     Class 9 student is never planned against a Class 12 chapter list.
 *
 * WHY SCIENCE APPEARS TWICE
 *     CBSE publishes both a combined IX-X "Science" document and a Class X
 *     document bundled with reading material. They are not copies: the Class X
 *     one carries the formative-only boxes and the Note for Teachers. Both are
 *     fetched so the extractor can cross-check them against each other.
 */

const P1 = 'https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart1/'
const P2 = 'https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/'

export const MANIFEST = [
  /* ---- Classes IX-X ---- */
  { slug: 'maths-ix', subject: 'Mathematics', classes: [9], url: `${P1}Maths_SecP1IX_2026-27.pdf` },
  { slug: 'maths-x', subject: 'Mathematics', classes: [10], url: `${P1}Maths_SecP1X_2026-27.pdf` },
  { slug: 'maths-advanced', subject: 'Mathematics at Advanced Level', classes: [9, 10], url: `${P1}MathsAd_SecP1_2026-27.pdf` },
  { slug: 'science-ix-x', subject: 'Science', classes: [9, 10], url: `${P1}ScienceSt_SecP1_2026-27.pdf` },
  { slug: 'science-x', subject: 'Science', classes: [10], url: `${P1}Science_SecP1_2026-27.pdf` },
  { slug: 'science-advanced', subject: 'Science at Advanced Level', classes: [9, 10], url: `${P1}ScienceAd_SecP1_2026-27.pdf` },
  { slug: 'social-science-ix', subject: 'Social Science', classes: [9], url: `${P1}SocialScience_SecP1IX_2026-27.pdf` },
  { slug: 'social-science-x', subject: 'Social Science', classes: [10], url: `${P1}SocialScience_SecP1X_2026-27.pdf` },
  { slug: 'english-ix', subject: 'English Language and Literature', classes: [9], url: `${P1}English_LL_SecP1IX_2026-27.pdf` },
  { slug: 'english-x', subject: 'English Language and Literature', classes: [10], url: `${P1}English_LL_SecP1_2026-27.pdf` },
  { slug: 'computer-applications-ix', subject: 'Computer Applications', classes: [9], url: `${P1}Computer_Applications_SecP1IX_2026-27.pdf` },
  { slug: 'computer-applications-x', subject: 'Computer Applications', classes: [10], url: `${P1}Computer_Applications_SecP1X_2026-27.pdf` },
  { slug: 'elements-of-business-ix', subject: 'Elements of Business', classes: [9], url: `${P1}Elements_of_Business_SecP1IX_2026-27.pdf` },
  { slug: 'elements-of-business-x', subject: 'Elements of Business', classes: [10], url: `${P1}Elements_of_Business_SecP1X_2026-27.pdf` },
  { slug: 'elements-of-accountancy-ix', subject: 'Elements of Book Keeping & Accountancy', classes: [9], url: `${P1}Elements_of_BK_Acc_SecP1IX_2026-27.pdf` },
  { slug: 'elements-of-accountancy-x', subject: 'Elements of Book Keeping & Accountancy', classes: [10], url: `${P1}Elements_of_BK_Acc_SecP1X_2026-27.pdf` },

  /* ---- Classes XI-XII ---- */
  { slug: 'physics', subject: 'Physics', classes: [11, 12], url: `${P2}Physics_SecP2_2026-27.pdf` },
  { slug: 'chemistry', subject: 'Chemistry', classes: [11, 12], url: `${P2}Chemistry_SecP2_2026-27.pdf` },
  { slug: 'biology', subject: 'Biology', classes: [11, 12], url: `${P2}Biology_SecP2_2026-27.pdf` },
  { slug: 'biotechnology', subject: 'Biotechnology', classes: [11, 12], url: `${P2}BioTechnology_SecP2_2026-27.pdf` },
  { slug: 'maths-senior', subject: 'Mathematics', classes: [11, 12], url: `${P2}Maths_SecP2_2026-27.pdf` },
  { slug: 'applied-maths', subject: 'Applied Mathematics', classes: [11, 12], url: `${P2}Applied_Mathematics_SecP2_2026-27.pdf` },
  { slug: 'accountancy', subject: 'Accountancy', classes: [11, 12], url: `${P2}Accountancy_SecP2_2026-27.pdf` },
  { slug: 'business-studies', subject: 'Business Studies', classes: [11, 12], url: `${P2}BusinessStudies_SecP2_2026-27.pdf` },
  { slug: 'economics', subject: 'Economics', classes: [11, 12], url: `${P2}Economics_SecP2_2026-27.pdf` },
  { slug: 'history', subject: 'History', classes: [11, 12], url: `${P2}History_SecP2_2026-27.pdf` },
  { slug: 'geography', subject: 'Geography', classes: [11, 12], url: `${P2}Geography_SecP2_2026-27.pdf` },
  { slug: 'political-science', subject: 'Political Science', classes: [11, 12], url: `${P2}PoliticalScience_SecP2_2026-27.pdf` },
  { slug: 'sociology', subject: 'Sociology', classes: [11, 12], url: `${P2}Sociology_SecP2_2026-27.pdf` },
  { slug: 'psychology', subject: 'Psychology', classes: [11, 12], url: `${P2}Psychology_SecP2_2026-27.pdf` },
  { slug: 'legal-studies', subject: 'Legal Studies', classes: [11, 12], url: `${P2}LegalStudies_SecP2_2026-27.pdf` },
  { slug: 'computer-science', subject: 'Computer Science', classes: [11, 12], url: `${P2}Computer_Science_SecP2_2026-27.pdf` },
  { slug: 'informatics-practices', subject: 'Informatics Practices', classes: [11, 12], url: `${P2}Informatics_Practices_SecP2_2026-27.pdf` },
  { slug: 'english-core', subject: 'English Core', classes: [11, 12], url: `${P2}English_core_SecP2_2026-27.pdf` },
  { slug: 'entrepreneurship', subject: 'Entrepreneurship', classes: [11, 12], url: `${P2}Enterprenuership_SecP2_2026-27.pdf` },
  { slug: 'physical-education', subject: 'Physical Education', classes: [11, 12], url: `${P2}PhysicalEducation_SecP2_2026-27.pdf` },
  { slug: 'home-science', subject: 'Home Science', classes: [11, 12], url: `${P2}Home_Science_SecP2_2026-27.pdf` },
]
