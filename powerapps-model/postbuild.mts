// Finishes what build-model-app.js leaves behind on a rebuild: the builder reuses an existing web
// resource without refreshing its content, and it wires form event handlers without declaring the
// library in <formLibraries>, so the handlers would reference a script the form never loads.
// Run after `build-model-app.js --apply --publish`. Idempotent.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataverseClient, configFromEnv } from '../dataverse/scripts/dataverse.ts';

const LIBRARY = 'kyc_casecommands.js';
const FORM = { entity: 'kyc_case', name: 'KYC Case review' };

interface WebResource { webresourceid: string; content: string }
interface SystemForm { formid: string; formxml: string }

const dv = new DataverseClient(configFromEnv());
const here = dirname(fileURLToPath(import.meta.url));

const [wr] = await dv.getAll<WebResource>(`webresourceset?$select=webresourceid,content&$filter=name eq '${LIBRARY}'`);
if (!wr) throw new Error(`Web resource ${LIBRARY} not found — run build-model-app.js first`);
const content = readFileSync(join(here, LIBRARY)).toString('base64');
if (wr.content !== content) {
  await dv.patch(`webresourceset(${wr.webresourceid})`, { content });
  await dv.action('PublishXml', { ParameterXml: `<importexportxml><webresources><webresource>{${wr.webresourceid}}</webresource></webresources></importexportxml>` });
  console.log(`Updated web resource ${LIBRARY}`);
} else {
  console.log(`Web resource ${LIBRARY} is current`);
}

const [form] = await dv.getAll<SystemForm>(
  `systemforms?$select=formid,formxml&$filter=objecttypecode eq '${FORM.entity}' and type eq 2 and name eq '${FORM.name}'`,
);
if (!form) throw new Error(`Form "${FORM.name}" on ${FORM.entity} not found`);
const library = `<Library name="${LIBRARY}" libraryUniqueId="{${wr.webresourceid}}" />`;
if (form.formxml.includes(`<Library name="${LIBRARY}"`)) {
  console.log(`Form "${FORM.name}" already declares ${LIBRARY}`);
} else {
  const formxml = form.formxml.includes('<formLibraries>')
    ? form.formxml.replace('<formLibraries>', `<formLibraries>${library}`)
    : form.formxml.replace('</form>', `<formLibraries>${library}</formLibraries></form>`);
  await dv.patch(`systemforms(${form.formid})`, { formxml });
  await dv.action('PublishXml', { ParameterXml: `<importexportxml><entities><entity>${FORM.entity}</entity></entities></importexportxml>` });
  console.log(`Declared ${LIBRARY} on form "${FORM.name}"`);
}

// Views: the builder leaves the platform's stock "Active <Entity>" view (primary column + Created On)
// as the default, so the app opened on a list of bare case references. Make the Review queue the
// default, teach Quick Find (the grid's "Filter by keyword" box) to search applicant/reviewer/email
// and show queue columns, and retire the stock views that the declared ones replace.
interface SavedQuery {
  savedqueryid: string;
  name: string;
  isdefault: boolean;
  statecode: number;
  fetchxml: string;
  layoutxml: string;
}

const CASE_ENTITY = 'kyc_case';
const QUEUE_VIEW = 'Review queue';
const QUEUE_COLUMNS = [
  'kyc_name',
  'kyc_applicantname',
  'kyc_status',
  'kyc_risklevel',
  'kyc_flagged',
  'kyc_assignedreviewer',
  'kyc_submittedat',
];
const QUICK_FIND_FIELDS = ['kyc_name', 'kyc_applicantname', 'kyc_email', 'kyc_assignedreviewer'];
const RETIRED_VIEWS = ['Active KYC Cases', 'Inactive KYC Cases'];

const views = await dv.getAll<SavedQuery>(
  `savedqueries?$select=savedqueryid,name,isdefault,statecode,fetchxml,layoutxml&$filter=returnedtypecode eq '${CASE_ENTITY}'`,
);
const view = (name: string): SavedQuery => {
  const found = views.find((v) => v.name === name);
  if (!found) throw new Error(`View "${name}" on ${CASE_ENTITY} not found — run build-model-app.js first`);
  return found;
};
let viewsChanged = false;

const queue = view(QUEUE_VIEW);
if (queue.isdefault) {
  console.log(`"${QUEUE_VIEW}" is already the default view`);
} else {
  await dv.patch(`savedqueries(${queue.savedqueryid})`, { isdefault: true });
  viewsChanged = true;
  console.log(`Made "${QUEUE_VIEW}" the default view`);
}

// Dataverse rejects every fetchxml PATCH on a Quick Find view here (HTTP 400 0x80040216, even an
// unchanged payload, on every table), while creating one works — so a new Quick Find view is created
// and made the default instead of editing the stock one.
const quickName = 'Quick Find KYC Cases';
let quick = views.find((v) => v.name === quickName);
if (!quick) {
  const objectCode = /object="(\d+)"/.exec(view('Quick Find Active KYC Cases').layoutxml)?.[1] ?? '10688';
  const fetchxml =
    `<fetch version="1.0" mapping="logical"><entity name="${CASE_ENTITY}"><attribute name="${CASE_ENTITY}id" />` +
    QUEUE_COLUMNS.map((c) => `<attribute name="${c}" />`).join('') +
    `<order attribute="kyc_name" descending="false" />` +
    `<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>` +
    `<filter type="or" isquickfindfields="1">` +
    QUICK_FIND_FIELDS.map((f) => `<condition attribute="${f}" operator="like" value="{0}" />`).join('') +
    `</filter></entity></fetch>`;
  const layoutxml =
    `<grid name="resultset" jump="kyc_name" select="1" icon="1" preview="1" object="${objectCode}">` +
    `<row name="result" id="${CASE_ENTITY}id">` +
    QUEUE_COLUMNS.map((c, i) => `<cell name="${c}" width="${i === 0 ? 120 : 150}" />`).join('') +
    `</row></grid>`;
  const savedqueryid = await dv.create('savedqueries', {
    name: quickName,
    returnedtypecode: CASE_ENTITY,
    querytype: 4,
    isquickfindquery: true,
    fetchxml,
    layoutxml,
  });
  quick = { savedqueryid, name: quickName, isdefault: false, statecode: 0, fetchxml, layoutxml };
  viewsChanged = true;
  console.log(`Created "${quickName}" searching ${QUICK_FIND_FIELDS.join(', ')}`);
}
if (quick.isdefault) {
  console.log(`"${quickName}" is already the default Quick Find view`);
} else {
  await dv.patch(`savedqueries(${quick.savedqueryid})`, { isdefault: true });
  viewsChanged = true;
  console.log(`Made "${quickName}" the default Quick Find view`);
}
// The stock Quick Find view is not public, so it cannot be deactivated; only its default flag is cleared.
for (const other of views.filter((v) => v.isdefault && v !== quick && /^Quick Find /.test(v.name))) {
  await dv.patch(`savedqueries(${other.savedqueryid})`, { isdefault: false });
  viewsChanged = true;
  console.log(`"${other.name}" is no longer the default Quick Find view`);
}

for (const name of RETIRED_VIEWS) {
  const stock = views.find((v) => v.name === name);
  if (!stock || stock.statecode === 1) continue;
  // isdefault is not exclusive: promoting another view leaves this flag set, and a default cannot be deactivated.
  if (stock.isdefault) await dv.patch(`savedqueries(${stock.savedqueryid})`, { isdefault: false });
  await dv.patch(`savedqueries(${stock.savedqueryid})`, { statecode: 1, statuscode: 2 });
  viewsChanged = true;
  console.log(`Deactivated stock view "${name}"`);
}

if (viewsChanged) {
  await dv.action('PublishXml', {
    ParameterXml: `<importexportxml><entities><entity>${CASE_ENTITY}</entity></entities></importexportxml>`,
  });
}
