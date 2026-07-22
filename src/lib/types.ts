export type Project = {
  id: string;
  projectName?: string;
  startDate?: string;
  platform?: string;
  figmaApproval?: string;
  htmlApproval?: string;
  cmsApproval?: string;
  liveDate?: string;
  projectManager?: string;
  projectScope?: string;
  driveLink?: string;
  developer?: string;
  status?: string;
  lastWorkingDay?: string;
  currentUpdate?: string;
  domainName?: string;
  hosting?: string;
  hostingDetail?: string;
  domain?: string;
  sslStatus?: string;
  adminAccess?: string;
  editorAccess?: string;
  dummyContent?: boolean;
  contentCopied?: boolean;
  contentFromClient?: boolean;
  contentByTeam?: boolean;
  socialLinks?: string;
  clientEmail?: string;
  clientPhone?: string;
  privacyPolicy?: string;
  terms?: string;
  refundPolicy?: string;
  paymentGateway?: string;
  shippingSettings?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  maintenanceDuration?: string;
  projectCategory?: string;
  websiteLink?: string;
  loginUrl?: string;
  username?: string;
  password?: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
};

export const FIELDS = [
  'projectName','startDate','platform','figmaApproval','htmlApproval',
  'cmsApproval','liveDate','projectManager','projectScope','driveLink',
  'developer','status','lastWorkingDay','currentUpdate','domainName',
  'hosting','hostingDetail','domain','sslStatus','adminAccess',
  'editorAccess','dummyContent','contentCopied','contentFromClient',
  'contentByTeam','socialLinks','clientEmail','clientPhone',
  'privacyPolicy','terms','refundPolicy','paymentGateway',
  'shippingSettings','maintenanceStart','maintenanceEnd','maintenanceDuration',
  'projectCategory','websiteLink','loginUrl','username','password',
] as const;

export const CSV_HEADERS = [
  'Project name','Start Date','Platform','Figma Approval Date','Html Approval Date',
  'Cms Approval Date','Project Live Date','Project Manager','Project Scope',
  'Document Upload','Developer','Status','Last Working day',
  'Current Update','Domain Name','Hosting','Hosting Detail','Domain','SSL Status',
  'Admin Access','Editor Access','Dummy content used','Content copied from existing website',
  'Content provided by client in document','Content written by our team','Social Links Available',
  'Email id Provided by client','Phone Numbers Client provided','Privacy Policy',
  'Terms & Conditions','Refund / Shipping Policy','Payment Gateway Setup and name',
  'Shipping Settings Provided by client','Start Date of Maintenance','End Date of Maintenance',
  'Maintenance Duration','Project Category','Website Link','Login URL','Username/ID','Password',
];

export const PLATFORM_OPTIONS = ['WordPress','Shopify','Custom HTML','React','Next.js','Laravel','WooCommerce','Wix','Squarespace','Webflow','Other'];
export const DEVELOPER_OPTIONS = [
  'Akash Chakraborty',
  'Dipraj Sarkar',
  'Ramakrushna Behera',
  'Soham Paul',
  'Sakhil Mondal',
  'Kritika Roy',
  'Sonali Kumari',
  'Sourav Metya',
  'Sayandip Saha',
  'Subham Dey',
  'Amit Saha',
  'Sagnik Dey',
  'Safikul Islam',
  'Richa Sinha',
  'Bhumi Sankar',
  'Riya Pahan',
  'Manaswita Karar',
  'Tiasha Karmakar',
  'Biswajit Mondal',
  'Subhadeep Das',
  'Tarasankar Dey',
  'Monoti Mondal',
  'Bibek Kotal',
];
export const STATUS_OPTIONS = ['Not Started','In Progress','Design Phase','Development','Client Review','Testing','Live','On Hold','Cancelled'];
export const SSL_OPTIONS = ['Active','Pending','Expired','Not Applicable'];
export const CATEGORY_OPTIONS = ['Ongoing','Pending','Hold','Dead'];
export const SCOPE_OPTIONS = ['Yes','No'];

export const PM_OPTIONS = [
  'Debjoti Dutta',
  'Sibam Sinha',
  'Pinak Choudhuri',
  'Akash Nag',
  'Surajit Basak',
  'Kapil Kumar',
  'Rajdeep Sarkar',
  'Jyotismita Sarkar',
  'Megha Dhara',
  'Kusum Gurung',
  'Pritam Sen',
  'Biswajit Mondal',
  'Sayandip Saha',
  'Other',
];

export function isPlatformHeader(header: string): boolean {
  return /\bplatform\b/i.test(header || '');
}

export function isPMHeader(header: string): boolean {
  return /(project manager|\bpm\b)/i.test(header || '');
}

export function isDeveloperHeader(header: string): boolean {
  return /\b(developer|dev)\b/i.test(header || '');
}

export function isStatusHeader(header: string): boolean {
  return /\bstatus\b/i.test(header || '');
}

// The Project Scope column is a Yes/No dropdown, distinct from the file/drive
// columns handled by isDriveOrScopeHeader below.
export function isScopeHeader(header: string): boolean {
  return /project scope|\bscope\b/i.test(header || '');
}

export function isDriveOrScopeHeader(header: string): boolean {
  // Scope is deliberately excluded — it renders as a Yes/No dropdown, not a file
  // upload — so an early return keeps it out of the drive/document match below.
  if (isScopeHeader(header)) return false;
  return /(google drive|drive link|drive|document upload|document)/i.test(header || '');
}
