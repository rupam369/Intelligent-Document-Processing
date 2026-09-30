/**
 * Bundled demo corpus.
 *
 * Powers two things:
 *   1. DEMO MODE OCR - when no OCR provider is configured, a plausible OCR
 *      transcript is returned so the whole pipeline can be demonstrated.
 *   2. Seed data - so the dashboard is never empty on a fresh install.
 *
 * Everything here is clearly labelled as demo data in the UI.
 */

export const DEMO_DOCUMENTS = [
  {
    id: 'demo-invoice-1023',
    fileName: 'invoice.pdf',
    label: 'Sample Invoice (clean)',
    documentType: 'invoice',
    pages: 1,
    tags: ['invoice', 'inv', 'bill', 'tax'],
    ocrText: [
      'NEXORA TECHNOLOGIES PRIVATE LIMITED',
      '42 Residency Road, Bengaluru, Karnataka 560025',
      'GSTIN: 29ABCDE1234F1Z5   |   hello@nexora.tech',
      '',
      'TAX INVOICE',
      'Invoice No: INV-1023',
      'Invoice Date: 30/09/2026',
      'Due Date: 14/10/2026',
      '',
      'Billed To:',
      'Rahul Kumar',
      '12 MG Road, Pune, Maharashtra 411001',
      '',
      'Description                 Qty   Rate      Amount',
      'Cloud Storage Subscription    1    2500.00   2500.00',
      'Priority Support Plan         1    2500.00   2500.00',
      '',
      'Subtotal: 5000.00',
      'CGST @ 9%: 450.00',
      'SGST @ 9%: 450.00',
      'Total GST: 900.00',
      'Total Amount: 5900.00',
      'Currency: INR',
      '',
      'Payment due within 14 days. Thank you for your business.',
    ].join('\n'),
  },
  {
    id: 'demo-invoice-1044',
    fileName: 'invoice_discrepancy.pdf',
    label: 'Sample Invoice (intentional discrepancy)',
    documentType: 'invoice',
    pages: 1,
    tags: ['invoice', 'discrepancy', 'inv', 'mismatch'],
    ocrText: [
      'VERTEX SUPPLY CO.',
      '88 Industrial Estate, Ahmedabad, Gujarat 380015',
      '',
      'TAX INVOICE',
      'Invoice No: INV-1044',
      'Invoice Date: 28/09/2026',
      'Due Date: 12/10/2026',
      '',
      'Billed To:',
      'Ananya Iyer',
      '5 Linking Road, Mumbai, Maharashtra 400050',
      '',
      'Description                  Qty   Rate      Amount',
      'Consulting Services            1    5000.00    5000.00',
      '',
      'Subtotal: 5000.00',
      'GST @ 18%: 900.00',
      'Total Amount: 7500.00',
      'Currency: INR',
    ].join('\n'),
  },
  {
    id: 'demo-receipt-001',
    fileName: 'receipt.jpg',
    label: 'Sample Receipt',
    documentType: 'receipt',
    pages: 1,
    tags: ['receipt', 'grocery', 'mart', 'pos'],
    ocrText: [
      'GREEN LEAF MARKET',
      'Store #214 - Sector 18, Noida, UP 201301',
      'Tel: 0120-4455667',
      '',
      'RECEIPT',
      'Receipt No: RCPT-8891',
      'Date: 29/09/2026   18:42',
      'Cashier: Meera',
      '',
      'Organic Bananas      1.2 kg    96.00',
      'Whole Wheat Bread     1         45.00',
      'Almond Milk 1L       2        180.00',
      'Dark Chocolate 70%    3        210.00',
      '',
      'Subtotal:            531.00',
      'GST @ 5%:             26.55',
      'TOTAL:               557.55',
      '',
      'Paid by UPI ****4421',
      'Thank you, visit again!',
    ].join('\n'),
  },
  {
    id: 'demo-resume-001',
    fileName: 'resume.pdf',
    label: 'Sample Resume',
    documentType: 'resume',
    pages: 2,
    tags: ['resume', 'cv', 'curriculum'],
    ocrText: [
      'PRIYA SHARMA',
      'Senior Full-Stack Engineer',
      'priya.sharma@example.com | +91 98765 43210',
      'Bengaluru, Karnataka, India',
      'LinkedIn: linkedin.com/in/priyasharma | GitHub: github.com/priyasharma',
      '',
      'PROFESSIONAL SUMMARY',
      'Full-stack engineer with 6 years of experience building scalable web platforms',
      'in React, Node.js and cloud infrastructure. Led three product launches serving',
      'over 2 million monthly users.',
      '',
      'TECHNICAL SKILLS',
      'JavaScript, TypeScript, React, Next.js, Node.js, Express, Python, PostgreSQL,',
      'MongoDB, Redis, AWS, Docker, Kubernetes, GraphQL, CI/CD, Jest, Playwright',
      '',
      'PROFESSIONAL EXPERIENCE',
      'Senior Software Engineer - Lumen Labs (2022 - Present)',
      '- Architected a multi-tenant document processing platform handling 40k docs/day',
      '- Cut p95 API latency by 62% through query optimisation and caching',
      '- Mentored 5 engineers and introduced the company-wide code review standard',
      '',
      'Software Engineer - Brightwave Digital (2019 - 2022)',
      '- Built a customer analytics dashboard used by 300+ enterprise clients',
      '- Migrated a legacy monolith to microservices with zero downtime',
      '',
      'EDUCATION',
      'B.Tech in Computer Science - National Institute of Technology, Surathkal (2015 - 2019)',
      'CGPA: 8.7/10',
      '',
      'PROJECTS',
      'DocuMind - AI document classifier with 94% accuracy on 12 document classes',
      'OpenMetrics - Open-source observability dashboard with 3.2k GitHub stars',
      '',
      'CERTIFICATIONS',
      'AWS Certified Solutions Architect - Associate (2023)',
    ].join('\n'),
  },
  {
    id: 'demo-contract-001',
    fileName: 'contract.pdf',
    label: 'Sample Contract',
    documentType: 'contract',
    pages: 4,
    tags: ['contract', 'agreement', 'msa', 'nda'],
    ocrText: [
      'MASTER SERVICES AGREEMENT',
      '',
      'This Master Services Agreement ("Agreement") is entered into on 01/01/2026',
      'by and between:',
      '',
      '(1) LUMEN LABS PRIVATE LIMITED, a company incorporated in India with its',
      '    registered office at 7 Embassy Golf Links, Bengaluru 560071 ("Client"); and',
      '',
      '(2) PRIYA SHARMA, an independent consultant residing in Bengaluru ("Consultant").',
      '',
      '1. SCOPE OF SERVICES',
      'The Consultant shall provide software engineering and technical advisory',
      'services as described in each Statement of Work executed under this Agreement.',
      '',
      '2. TERM',
      'This Agreement commences on 01/01/2026 and continues for an initial term of',
      'one (1) year, ending on 31/12/2026, unless terminated earlier under Clause 8.',
      '',
      '3. FEES AND PAYMENT',
      'The Client shall pay the Consultant a monthly retainer of INR 40,000, payable',
      'within 15 days of receipt of a valid invoice. Payment frequency: monthly.',
      '',
      '4. CONFIDENTIALITY',
      'Each party shall keep confidential all non-public information disclosed by the',
      'other party for a period of three (3) years following termination.',
      '',
      '5. INTELLECTUAL PROPERTY',
      'All deliverables created specifically for the Client shall be assigned to the',
      'Client upon full payment. The Consultant retains rights to pre-existing',
      'generic tools and libraries.',
      '',
      '6. INDEMNITY',
      'The Consultant shall indemnify the Client against third-party claims arising',
      'from gross negligence or wilful misconduct, capped at the total fees paid in',
      'the preceding six (6) months.',
      '',
      '7. LIMITATION OF LIABILITY',
      'Neither party shall be liable for indirect, incidental or consequential damages.',
      '',
      '8. TERMINATION',
      'Either party may terminate this Agreement by giving thirty (30) days prior',
      'written notice. Termination notice period: 30 days.',
      '',
      '9. GOVERNING LAW',
      'This Agreement is governed by the laws of India. Disputes shall be resolved by',
      'arbitration seated in Bengaluru under the Arbitration and Conciliation Act, 1996.',
      '',
      'Signed for and on behalf of both parties on 01/01/2026.',
    ].join('\n'),
  },
  {
    id: 'demo-bank-statement-001',
    fileName: 'bank_statement.pdf',
    label: 'Sample Bank Statement',
    documentType: 'bank_statement',
    pages: 3,
    tags: ['bank', 'statement', 'account', 'transaction'],
    ocrText: [
      'MERIDIAN BANK',
      'Statement of Account',
      '',
      'Account Holder: ARJUN MEHTA',
      'Account Number: XXXX XXXX XXXX 7788',
      'Statement Period: 01/09/2026 to 30/09/2026',
      'Branch: Koramangala, Bengaluru',
      '',
      'Date        Description                    Debit      Credit     Balance',
      '01/09/2026  Opening Balance                                      45200.00',
      '03/09/2026  Salary Credit - Lumen Labs                285000.00   330200.00',
      '05/09/2026  Rent - UPI/P2M/88213             45000.00              285200.00',
      '08/09/2026  Grocery - Green Leaf Market       2340.00              282860.00',
      '12/09/2026  Electricity Bill - BESCOM         3120.50              279739.50',
      '15/09/2026  SIP - Nifty 50 Index Fund        25000.00              254739.50',
      '18/09/2026  Freelance Invoice INV-0992                     96000.00   350739.50',
      '21/09/2026  Card Payment - Amazon            4899.00              345840.50',
      '24/09/2026  ATM Withdrawal                  10000.00              335840.50',
      '27/09/2026  Mutual Fund Redemption                     60000.00   395840.50',
      '30/09/2026  Closing Balance                                     395840.50',
      '',
      'Total Debits: 90359.50   Total Credits: 441000.00',
    ].join('\n'),
  },
  {
    id: 'demo-certificate-001',
    fileName: 'certificate.png',
    label: 'Sample Certificate',
    documentType: 'certificate',
    pages: 1,
    tags: ['certificate', 'certification', 'award'],
    ocrText: [
      'CERTIFICATE OF COMPLETION',
      '',
      'This is to certify that',
      'PRIYA SHARMA',
      'has successfully completed the professional certification programme',
      '"AWS Certified Solutions Architect - Associate"',
      '',
      'Issued by: Amazon Web Services',
      'Issue Date: 15/03/2023',
      'Certificate ID: AWS-SAA-2023-88213',
      'Valid Until: 15/03/2026',
      '',
      'Verified at: aws.amazon.com/verification',
    ].join('\n'),
  },
  {
    id: 'demo-application-001',
    fileName: 'application_form.pdf',
    label: 'Sample Application Form',
    documentType: 'application_form',
    pages: 2,
    tags: ['application', 'form', 'apply', 'kyc'],
    ocrText: [
      'TECHNOVATE VENTURES - INCUBATOR APPLICATION FORM',
      'Cohort 2026-B',
      '',
      'Applicant Name: ROHIT DESAI',
      'Email: rohit.desai@example.com',
      'Phone: +91 90080 70707',
      'Date of Birth: 12/08/1994',
      'Address: 201 Palm Grove, Whitefield, Bengaluru 560066',
      '',
      'Startup Name: FlowForge Analytics',
      'Startup Stage: Seed',
      'Sector: B2B SaaS',
      'Team Size: 7',
      'Funding Sought: INR 2,50,00,000',
      '',
      'Problem Statement:',
      'Mid-market manufacturers lack real-time visibility into production quality.',
      '',
      'Solution Summary:',
      'FlowForge ingests machine sensor data and surfaces defect trends within 30 seconds.',
      '',
      'Website: https://flowforge.example.com',
      'Submitted On: 26/09/2026',
    ].join('\n'),
  },
];

/** Keyword hints used to pick a demo document from an uploaded file name. */
const TYPE_KEYWORDS = {
  invoice: ['invoice', 'inv', 'bill', 'tax'],
  receipt: ['receipt', 'rcpt', 'grocery', 'mart', 'pos'],
  resume: ['resume', 'cv', 'curriculum', 'vitae'],
  contract: ['contract', 'agreement', 'msa', 'nda', 'terms'],
  bank_statement: ['bank', 'statement', 'account', 'transaction'],
  certificate: ['certificate', 'certification', 'award', 'diploma'],
  application_form: ['application', 'form', 'apply', 'kyc', 'onboarding'],
};

/**
 * Picks the most relevant demo document for a file name.
 *
 * Returns `null` when the file name gives no signal at all. The OCR layer then
 * reports the document as unreadable rather than silently pretending a random
 * upload is an invoice - guessing would produce confidently wrong data.
 */
export function getDemoDocumentForFile(fileName = '') {
  const haystack = fileName.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const demo of DEMO_DOCUMENTS) {
    let score = 0;
    if (haystack.includes(demo.fileName.toLowerCase())) score += 100;
    for (const tag of demo.tags) {
      if (haystack.includes(tag)) score += 10;
    }
    if (score > bestScore) {
      best = demo;
      bestScore = score;
    }
  }

  return bestScore >= 10 ? best : null;
}

/** Message used when demo OCR genuinely cannot read a document. */
export function unreadableDocumentText(fileName, reason) {
  return [
    '[Document could not be read automatically]',
    `File name: ${fileName}`,
    reason,
    '',
    'No extracted values are available for this document.',
    'Configure an OCR provider (OCR_PROVIDER) to read it, or review it manually.',
  ].join('\n');
}

export const getDemoDocuments = () => DEMO_DOCUMENTS;

export const findDemoDocument = (id) => DEMO_DOCUMENTS.find((demo) => demo.id === id);

export default {
  DEMO_DOCUMENTS,
  getDemoDocumentForFile,
  getDemoDocuments,
  findDemoDocument,
  unreadableDocumentText,
  TYPE_KEYWORDS,
};
