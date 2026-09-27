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
