// Definition of the "Website Delivery (Copy)" handover form.
//
// This project has no dynamic form-builder — every form is a hand-written page.
// So this form is described as data here (fields, options, required/encrypted
// flags, and conditional show-when rules) and rendered by a single generic
// component (see src/app/website-delivery-2/page.tsx). Keeping the shape as data
// means the conditional logic and validation are driven from one source.
//
// Submissions are written to the "Deliveries 2" Google-Sheet-backed tab under the
// `website-delivery-2` page key, via the existing /api/sheet-rows plumbing. The
// cell key for each field is its `label` (headers are the cell keys in this app),
// so a submission reads naturally in the sheet/table.

export const WEBSITE_DELIVERY_FORM = {
  name: 'Website Delivery (Copy)',
  slug: 'website-delivery-2',
  description: 'Website delivery status & handover checklist.',
  sheetTab: 'Deliveries 2',
  isPublished: true,
} as const;

/** The page key the submissions API and sheet storage use for this form. */
export const WEBSITE_DELIVERY_PAGE_KEY = 'website-delivery-2';

export type FieldType = 'text' | 'textarea' | 'date' | 'url' | 'select';

export type ConditionOp = 'equals' | 'contains';

export type ShowWhen = {
  /** `name` of the field this condition targets. */
  field: string;
  op: ConditionOp;
  value: string;
};

export type FormField = {
  /** Machine name — stable, used for condition targeting and encryption lookup. */
  name: string;
  /** Human label — also the cell key (column header) the value is stored under. */
  label: string;
  type: FieldType;
  required?: boolean;
  /** Stored encrypted at rest, hidden from CSV export, blank-to-keep on edit. */
  encrypted?: boolean;
  placeholder?: string;
  options?: string[];
  /** The field is only shown (and validated) when this condition holds. */
  showWhen?: ShowWhen;
};

const PLATFORM_OPTIONS = [
  'WordPress', 'PHP / Laravel', 'Shopify', 'Next / React', 'Mobile Application', 'Other',
];
const CONTENT_TYPE_OPTIONS = [
  'Dummy', 'Copy From existing site', 'Client Provided',
  'Webart Wrote for the client', 'Mixed (dummy+genuine)', 'Other',
];
const YES_NO = ['Yes', 'No'];
const DELEGATE_TO_OPTIONS = ['Hostinger', 'GoDaddy', 'Namecheap', 'Other'];
const DOMAIN_PROVIDER_OPTIONS = [
  'Delegate Access', 'Username Password Provided', 'We Bought for Client',
];
const HOSTING_PROVIDER_OPTIONS = [
  'Webart - Host74 With Cpanel', 'Webart - Host75 With Cpanel', 'Webart - VPS', "Client's Own",
];
const CLIENT_ACCESS_OPTIONS = ['Delegate Access', 'Username Password Provided'];
const DELIVERY_TYPE_OPTIONS = ['Zip and Send to the client', 'We Host It'];

// A `showWhen` shorthand.
const eq = (field: string, value: string): ShowWhen => ({ field, op: 'equals', value });

// Fields in the exact order given by the spec. The built-in required
// "Email Address" system field is added automatically by the renderer and is not
// listed here.
export const WEBSITE_DELIVERY_FIELDS: FormField[] = [
  { name: 'project_name', label: 'Project Name', type: 'text', required: true, placeholder: 'Enter the full project name' },
  { name: 'project_started_date', label: 'Project Started Date', type: 'date' },
  { name: 'platform', label: 'Platform', type: 'select', required: true, options: PLATFORM_OPTIONS },
  { name: 'platform_other', label: 'Specify Other Platform', type: 'text', showWhen: eq('platform', 'Other') },
  { name: 'figma_approved_date', label: 'Figma/Mockup Approved Date', type: 'date' },
  { name: 'html_approved_date', label: 'Html/UX Approved Date', type: 'date' },
  { name: 'delivery_date', label: 'Delivery Date', type: 'date', required: true },
  { name: 'message', label: 'Message', type: 'textarea', placeholder: 'Any notes, context, or special instructions for this handover' },
  { name: 'admin_url', label: 'Admin URL', type: 'url', placeholder: 'https://example.com/wp-admin' },
  { name: 'admin_username', label: 'Admin Username', type: 'text' },
  { name: 'admin_password', label: 'Admin Password', type: 'text', encrypted: true },
  { name: 'content_type', label: 'Content Type', type: 'select', options: CONTENT_TYPE_OPTIONS },
  { name: 'content_type_other', label: 'Specify Other Content Type', type: 'text', showWhen: eq('content_type', 'Other') },
  { name: 'social_links_available', label: 'Social Links', type: 'select', options: YES_NO },
  { name: 'email_provided', label: 'Client Email ID', type: 'select', options: YES_NO },
  { name: 'phone_numbers_available', label: 'Phone Numbers', type: 'select', options: YES_NO },
  { name: 'privacy_policy_available', label: 'Privacy Policy', type: 'select', options: YES_NO },
  { name: 'terms_conditions_available', label: 'Terms & Conditions', type: 'select', options: YES_NO },
  { name: 'refund_policy_available', label: 'Refund/Shipping', type: 'select', options: YES_NO },
  { name: 'payment_gateway_available', label: 'Payment Gateway', type: 'select', options: YES_NO },
  { name: 'shipping_feature_available', label: 'Shipping Feature', type: 'select', options: YES_NO },
  { name: 'project_delivery_type', label: 'Project Delivery Type', type: 'select', options: DELIVERY_TYPE_OPTIONS },

  { name: 'file_sent_to', label: 'Whom or Where the file Sent', type: 'text', placeholder: 'Email, name, or group name', showWhen: eq('project_delivery_type', 'Zip and Send to the client') },

  // DOMAIN block — all gated on "We Host It"
  { name: 'domain_name', label: 'Domain Name', type: 'text', placeholder: 'example.com', showWhen: eq('project_delivery_type', 'We Host It') },
  { name: 'domain_provider_type', label: 'Domain Provider', type: 'select', options: DOMAIN_PROVIDER_OPTIONS, showWhen: eq('project_delivery_type', 'We Host It') },
  { name: 'domain_delegate_to', label: 'Delegate Access taken to', type: 'select', options: DELEGATE_TO_OPTIONS, showWhen: eq('domain_provider_type', 'Delegate Access') },
  { name: 'domain_delegate_other', label: 'Specify Other Domain Delegate', type: 'text', showWhen: eq('domain_delegate_to', 'Other') },
  { name: 'domain_delegate_email', label: 'Delegate Name/Email', type: 'text', showWhen: eq('domain_provider_type', 'Delegate Access') },
  { name: 'domain_portal_url', label: 'Portal URL', type: 'text', showWhen: eq('domain_provider_type', 'Username Password Provided') },
  { name: 'domain_username', label: 'Username', type: 'text', showWhen: eq('domain_provider_type', 'Username Password Provided') },
  { name: 'domain_password', label: 'Password', type: 'text', encrypted: true, showWhen: eq('domain_provider_type', 'Username Password Provided') },

  // HOSTING block — gated on "We Host It"
  { name: 'hosting_provider_type', label: 'Hosting Provider', type: 'select', options: HOSTING_PROVIDER_OPTIONS, showWhen: eq('project_delivery_type', 'We Host It') },
  { name: 'hosting_cpanel_url', label: 'cPanel URL', type: 'url', showWhen: { field: 'hosting_provider_type', op: 'contains', value: 'With Cpanel' } },
  { name: 'hosting_cpanel_username', label: 'cPanel Username', type: 'text', showWhen: { field: 'hosting_provider_type', op: 'contains', value: 'With Cpanel' } },
  { name: 'hosting_cpanel_password', label: 'cPanel Password', type: 'text', encrypted: true, showWhen: { field: 'hosting_provider_type', op: 'contains', value: 'With Cpanel' } },
  { name: 'hosting_vps_ip', label: 'IP Address', type: 'text', showWhen: eq('hosting_provider_type', 'Webart - VPS') },
  { name: 'hosting_vps_port', label: 'Port', type: 'text', showWhen: eq('hosting_provider_type', 'Webart - VPS') },
  { name: 'hosting_client_own_type', label: 'Client Hosting Access Method', type: 'select', options: CLIENT_ACCESS_OPTIONS, showWhen: eq('hosting_provider_type', "Client's Own") },
  // The hosting-VPS and client-hosting credential/delegate fields were removed:
  // their labels (Username, Password, Portal URL, Delegate Access taken to,
  // Delegate Name/Email) duplicated the domain block's fields, and the Google
  // Sheet has one column per label — so both blocks wrote to the same columns.
  // The domain block's fields (above) own those columns now.

  { name: 'ssl_status', label: 'SSL Status', type: 'select', options: ['Active', 'Inactive'], showWhen: eq('project_delivery_type', 'We Host It') },
];

/** The built-in system field every form gets: required Email Address, rendered first. */
export const EMAIL_FIELD: FormField = {
  name: 'email',
  label: 'Email Address',
  type: 'text',
  required: true,
  placeholder: 'you@company.com',
};

/**
 * Evaluate a field's `showWhen` against the current values. A field with no
 * condition is always visible. Conditions target other fields by `name`.
 */
export function isFieldVisible(
  field: FormField,
  valuesByName: Record<string, string>
): boolean {
  const cond = field.showWhen;
  if (!cond) return true;
  const target = valuesByName[cond.field] ?? '';
  if (cond.op === 'contains') return target.includes(cond.value);
  return target === cond.value;
}

/** Labels of every encrypted field — used to redact them from exports. */
export const WEBSITE_DELIVERY_ENCRYPTED_LABELS: string[] = WEBSITE_DELIVERY_FIELDS
  .filter(f => f.encrypted)
  .map(f => f.label);
