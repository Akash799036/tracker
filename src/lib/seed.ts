import type { Project } from './types';

const RAW_CSV = `Project name,Start Date,Platform,Figma Approval Date,Html Approval Date,Cms Approval Date,Project Live Date,Project Manager,Project Scope,Google Drive link,Developer,Status,Last Working day,Current Update,Domain Name,Hosting,Hosting Detail,Domain,SSL Status,Admin Access,Editor Access,Dummy content used,Content copied from existing website,Content provided by client in document,Content written by our team,Social Links Available,Email id Provided by client,Phone Numbers Client provided,Privacy Policy,Terms & Conditions,Refund / Shipping Policy,Payment Gateway Setup and name,Shipping Settings Provided by client,Start Date of Maintenance,End Date of Maintenance,Maintenance Duration
VoipRemedy,,Wordpress,,,2025-09-23,03-12-2025,Debjoti Dutta,Yes,,,,Delivered,,,https://voipremedy.com.au/,,,,Active,,,NO,NO,Yes,NO,Yes,NO,Yes,NO,Yes,NO,,,,,
Dr smile newport,01/09/2025,Wordpress,,,01/09/2025,08/12/2025,Sibam Sinha,,,,,,,http://drsmilenewport.com/,,,,,,,,,,,,,,,,,,,,,
Diningwithdog-ma,10-11-2025,Wordpress,03-12-2025,24-11-2025,25-11-2025,10/12/2025,Pinak Choudhuri,,,,,,,diningwithdog-ma.com,,,,,,,,,,,,,,,,,,,,,
Bonanzadealz,16/10/2025,Shopify,,,21/10/2025,28/10/2025,Akash Nag,,,,,,,https://bonanzadealz.com/,,,,,,,,,,,,,,,,,,,,,
Mentoria Guru,11/11/2025,Wordpress,,18/11/2025,30/12/2025,05/01/2026,Sibam Sinha,,,,,,,https://contests.mentoria.guru/,,,,,,,,,,,,,,,,,,,,,
Truly Epic LLC,05/09/2025,Wordpress,,10/10/2025,09/10/2025,30/10/2025,Akash Nag,,,,,,,https://trulyepicfirearms.com/,,,,,,,,,,,,,,,,,,,,,
Spot This Space,5-12-2025,Wordpress,,5-12-2025,22-12-2025,07/01/2025,Debjoti Dutta,,,,,,,http://spotthisspace.com,,,,,,,,,,,,,,,,,,,,,
iconhq,20-11-2025,Wordpress,,,1-6-2026,13/01/2026,Surajit Basak,,,,,,,https://iconhq.com.au/,,,,,,,,,,,,,,,,,,,,,
Omni Beach Life,29-10-2025,Shopify,,,16-01-2026,16/01/2026,Kapil Kumar,,,,,,,https://www.omnibeachlife.com/,,,,,,,,,,,,,,,,,,,,,
Thin Films Research,,Wordpress,,,23-01-2026,16/01/2026,Sibam Sinha,,,,,,,http://thinfilmsresearch.com/,,,,,,,,,,,,,,,,,,,,,
SHIELD COSMETICS,23-01-2025,Shopify,,,23-01-2026,27/01/2026,Sibam Sinha,,,,,,,https://www.shieldbeauty.net/,,,,,,,,,,,,,,,,,,,,,
AC NOLA,16-12-2025,Wordpress,06-01-2026,06-01-2026,07-01-2026,28/01/2026,Akash Nag,,,,,,,acnola.com,,,,,,,,,,,,,,,,,,,,,
Dr. Smile Torrance,01.09.2025,Wordpress,,,01.09.2025,27/01/2026,Sibam Sinha,,,,,,,http://drsmiletorrance.com/,,,,,,,,,,,,,,,,,,,,,
Dr. Smile Sanpedro,01.09.2025,Wordpress,,,01.09.2025,27/01/2026,Sibam Sinha,,,,,,,https://drsmilesanpedro.com/,,,,,,,,,,,,,,,,,,,,,
Dr. Smile Lomita,01.09.2025,Wordpress,,,01.09.2025,27/01/2026,Sibam Sinha,,,,,,,https://drsmilelomita.com/,,,,,,,,,,,,,,,,,,,,,
Western Eye,22-01-2026,Wordpress,23-01-2026,02-02-2026,05-02-2026,10/02/2026,Debjoti Dutta,,,,,,,https://western-eye.com,,,,,,,,,,,,,,,,,,,,,
Morris O Nelson & Sons Inc,10-11-2025,Wordpress,23-10-2025,06-02-2026,05-02-2026,12/02/2026,Rajdeep Sarkar,,,,,,,https://www.monelsontrucking.com/,,,,,,,,,,,,,,,,,,,,,
kkappliances,28/01/2026,Wordpress,06/02/2026,12/02/2026,16/02/2026,17/02/2026,Akash Nag,,,,,,,https://kkappliancesllc.bizzrus.com,,,,,,,,,,,,,,,,,,,,,
Full Circle Cs,14/10/2026,Wordpress,16/10/2025,18/02/2025,21/10/2025,23/02/2026,Sibam Sinha,,,,,,,https://fullcirclecs.com/,,,,,,,,,,,,,,,,,,,,,
Sat Accounts,18.02.2026,Wordpress,,,27.02.2026,13/03/2026,Jyotismita Sarkar,,,,,,,https://sataccounts.co.uk/,,,,,,,,,,,,,,,,,,,,,
We Got The Sauce,25/10/2025,Shopify,30/12/2025,,05/02/2026,05/02/2026,Sibam Sinha,,,,Live,,,https://wegotthesauce.com/,,,,,,,,,,,,,,,,,,,,,
Canadian Institute of stress,22/01/2026,Wordpress,29/01/2026,06/03/2026,11/03/2026,14/04/2026,Akash Nag,,,,,,,https://stresscanada.org/,,,,,,,,,,,,,,,,,,,,,
Dave Pycz Construction,14/02/2026,Wordpress,05/03/2026,09/03/2026,13/03/2026,,Akash Nag,,,,,,,,,,,,,,,,,,,,,,,,,,,,
The Blessed Hope Organization,31/03/2026,Wordpress,,06/04/2026,17/04/2026,,Jyotismita Sarkar,,,,,,,https://theblessedhope.webartlab.tech/,,,,,,,,,,,,,,,,,,,,,
Vibe Wear Fashuons,19/03/2026,Shopify,,,16/04/2026,20/04/2026,Megha Dhara,,,,,,,https://vibewearfashions.com/,,,,,,,,,,,,,,,,,,,,,
Nmdrone4hire,01/04/2026,Wordpress,,,06/04/2026,22/04/2026,Kapil Kumar,,,,,,,NMDRONE4.COM,,,,,,,,,,,,,,,,,,,,,
Weston Seed,28/03/2026,Wordpress,,,,23/04/2026,Rajdeep Sarkar,,,,,,,Live website - maintenance,,,,,,,,,,,,,,,,,,,,,
aussieswings,23/10/2025,Shopify,,,04/11/2025,24/04/2026,Surajit Basak,,,,,,,https://aussieswings.com.au/,,,,,,,,,,,,,,,,,,,,,
Suchir,,Wordpress,,,,28/04/2026,Akash Nag,,,,,,,https://suchir.org/,,,,,,,,,,,,,,,,,,,,,
Lifeline Management Group,28/02/2026,Godaddy,,,,,Rajdeep Sarkar,,,,,,,https://lifelinemanagementgroup.com/,,,,,,,,,,,,,,,,,,,,,
Draigai,01/05/2026,HTML,,01/05/2026,,08/05/2026,Jyotismita Sarkar,,,,,,,https://draigai.com/,,,,,,,,,,,,,,,,,,,,,
AWAL-NKS,09/08/2025,Wordpress,21/08/2025,03/09/2025,07/10/2025,06/05/2026,Kusum Gurung,,,,,,,http://awalnks.com/,,,,,,,,,,,,,,,,,,,,,
The Mosaic Mind,24/02/2026,Wordpress,25/02/2026,13/03/2026,25/03/2026,07/05/2026,Rajdeep Sarkar,,,,,,,https://themosaicminds.com/,,,,,,,,,,,,,,,,,,,,,
Benefits Health,06/03/2026,Wordpress,06/03/2026,09/03/2026,12/03/2026,07/05/2026,Megha Dhara,,,,,,,https://benefitshealth.com/,,,,,,,,,,,,,,,,,,,,,
Atlas International Mail,11/02/2026,Wordpress,13/02/2026,20/04/2026,05/05/2026,08/05/2026,Pritam Sen,,,,,,,https://atlasintlmail.com/,,,,,,,,,,,,,,,,,,,,,
Choice Family Medicine,17/02/2026,WIX,,01/04/2026,28/04/2026,07/05/2026,Sibam Sinha,,,,,,,https://www.choicefamilymedicineclinic.com/,,,,,,,,,,,,,,,,,,,,,
Crest Property,24/02/2026,Wordpress,,26/02/2026,11/05/2026,22/05/2026,Debjoti Dutta,,,,,,,https://crestpropertyconsultants.com/,,,,,,,,,,,,,,,,,,,,,
cceenailsacademy,18/03/2026,Wordpress,,03/19/2026,20/03/2026,21/05/2026,Pinak Choudhuri,,,,,,,https://www.cceenailsacademy.com/,,,,,,,,,,,,,,,,,,,,,
EyeOn Equine Care,27/02/2026,Wordpress,04/03/2026,23/03/2026,01/04/2026,26/05/2026,Rajdeep Sarkar,,,,,,,https://eyeonequinecare.com/,,,,,,,,,,,,,,,,,,,,,
HoopsCamp,05/03/2026,Wordpress,09/03/2026,20/03/2026,18/05/2026,28/05/2026,Pinak Choudhuri,,,,,,,https://hoopscamp.net/,,,,,,,,,,,,,,,,,,,,,
Magnolia Community Care,14/05/2026,Wordpress,,14/05/2026,28/05/2026,04/06/2026,Sibam Sinha,,,,,,,https://magnoliacommunitycare.com/,,,,,,,,,,,,,,,,,,,,,
Medlandpharmacy,03/01/2026,Wordpress,21/01/2026,09/03/2026,13/03/2026,11/06/2026,Pinak Choudhuri,,,,,,,medlandpharmacy.com,,,,,,,,,,,,,,,,,,,,,
Semitic Tribes,26/03/2026,Shopify,,,15/06/2026,16/06/2026,Kapil Kumar,,,,,,,https://www.semitictribes.com/,,,,,,,,,,,,,,,,,,,,,
CCUS Experts,30/01/2026,Wordpress,02/02/2026,17/02/2026,15/05/2026,17/06/2026,Kapil Kumar,,,,,,,https://www.ccusexperts.com/,,,,,,,,,,,,,,,,,,,,,
Balloon Antics,11/06/2026,Wordpress,,,17/06/2026,22/06/2026,Jyotismita Sarkar,,,,,,,https://www.balloonantics.com.au/,,,,,,,,,,,,,,,,,,,,,
Resource4u Landing,07/04/2026,HTML,,30/06/2026,,30/06/2026,Debjoti Dutta,,,,,,,https://resource4uhub.com/,,,,,,,,,,,,,,,,,,,,,`;

const FIELD_ORDER = [
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

const DATE_FIELDS = new Set(['startDate','figmaApproval','htmlApproval','cmsApproval','liveDate','lastWorkingDay','maintenanceStart','maintenanceEnd']);
const BOOL_FIELDS = new Set(['dummyContent','contentCopied','contentFromClient','contentByTeam']);

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQ) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(raw: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s || /^n\/a$/i.test(s)) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y > 3000) y = y % 3000 + 2000;
    if (b > 12 && a <= 12) [a, b] = [b, a];
    return iso(y, b, a);
  }
  return '';
}
function iso(y: number, mo: number, d: number) {
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function seedProjects(): Project[] {
  const rows = parseCSV(RAW_CSV.trim());
  rows.shift();
  const now = Date.now();
  return rows
    .filter(r => r.some(c => (c || '').trim()))
    .map((cells, idx) => {
      const p: Project = { id: `seed-${(idx + 1).toString(36)}` };
      for (let i = 0; i < FIELD_ORDER.length; i++) {
        const key = FIELD_ORDER[i];
        const raw = (cells[i] ?? '').trim();
        if (DATE_FIELDS.has(key)) (p as any)[key] = parseDate(raw);
        else if (BOOL_FIELDS.has(key)) (p as any)[key] = /^y(es)?$/i.test(raw);
        else (p as any)[key] = /^n\/a$/i.test(raw) ? '' : raw;
      }
      if (!p.status) {
        if (p.liveDate && new Date(p.liveDate).getTime() < now) p.status = 'Live';
        else if (p.cmsApproval || p.htmlApproval || p.figmaApproval) p.status = 'Development';
        else if (p.startDate) p.status = 'In Progress';
        else p.status = 'Not Started';
      }
      p.createdAt = now - (rows.length - idx) * 60_000;
      p.updatedAt = p.createdAt;
      return p;
    });
}
