// Creates (idempotently) the publisher, unmanaged solution and Dataverse tables for the
// Power Apps version of the KYC review queue, then publishes the customizations.
//
//   PP_ENV_URL=https://org64ad231d.crm11.dynamics.com PP_TENANT_ID=... \
//   PP_CLIENT_ID=... PP_CLIENT_SECRET=... npm run provision -w powerapps

import { DataverseClient, configFromEnv, label } from './dataverse.ts';
import {
  CASE_LOOKUP,
  CASE_TABLE,
  PUBLISHER,
  RELATIONSHIPS,
  SOLUTION,
  TABLES,
  type ColumnDef,
  type OptionMap,
  type TableDef,
} from './schema.ts';

const dv = new DataverseClient(configFromEnv());
const solutionHeader = { 'MSCRM.SolutionUniqueName': SOLUTION.uniqueName };

function optionSet(options: OptionMap) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
    IsGlobal: false,
    OptionSetType: 'Picklist',
    Options: Object.values(options).map((o) => ({ Value: o.value, Label: label(o.label) })),
  };
}

function attributeMetadata(col: ColumnDef): Record<string, unknown> {
  const common = {
    SchemaName: col.schemaName,
    DisplayName: label(col.displayName),
    Description: label(col.description ?? col.displayName),
    RequiredLevel: { Value: col.required ? 'ApplicationRequired' : 'None' },
  };
  switch (col.type) {
    case 'string':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        MaxLength: col.maxLength ?? 100,
        FormatName: { Value: col.format ?? 'Text' },
      };
    case 'memo':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
        MaxLength: col.maxLength ?? 2000,
        Format: 'TextArea',
      };
    case 'dateonly':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
        Format: 'DateOnly',
        DateTimeBehavior: { Value: 'DateOnly' },
      };
    case 'datetime':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
        Format: 'DateAndTime',
        DateTimeBehavior: { Value: 'UserLocal' },
      };
    case 'picklist':
      if (!col.options) throw new Error(`${col.schemaName}: picklist without options`);
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
        OptionSet: optionSet(col.options),
      };
    case 'boolean':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        DefaultValue: false,
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
          TrueOption: { Value: 1, Label: label('Yes') },
          FalseOption: { Value: 0, Label: label('No') },
        },
      };
    case 'integer':
      return {
        ...common,
        '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
        Format: 'None',
        MinValue: 0,
        MaxValue: 1000000,
      };
  }
}

interface EntityRow {
  LogicalName: string;
  MetadataId: string;
}

async function ensurePublisher(): Promise<string> {
  const existing = await dv.getAll<{ publisherid: string }>(
    `publishers?$select=publisherid&$filter=uniquename eq '${PUBLISHER.uniqueName}'`,
  );
  if (existing[0]) return existing[0].publisherid;
  console.log(`Creating publisher ${PUBLISHER.uniqueName}`);
  return dv.create('publishers', {
    uniquename: PUBLISHER.uniqueName,
    friendlyname: PUBLISHER.friendlyName,
    customizationprefix: PUBLISHER.prefix,
    customizationoptionvalueprefix: PUBLISHER.optionValuePrefix,
    description: 'Publisher for the KYC review queue prototype (synthetic data only).',
  });
}

async function ensureSolution(publisherId: string): Promise<void> {
  const existing = await dv.getAll<{ solutionid: string }>(
    `solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION.uniqueName}'`,
  );
  if (existing[0]) return;
  console.log(`Creating solution ${SOLUTION.uniqueName}`);
  await dv.create('solutions', {
    uniquename: SOLUTION.uniqueName,
    friendlyname: SOLUTION.friendlyName,
    version: SOLUTION.version,
    description: 'KYC review queue as a Power Apps canvas app backed by Dataverse.',
    'publisherid@odata.bind': `/publishers(${publisherId})`,
  });
}

async function findEntity(logicalName: string): Promise<EntityRow | null> {
  const res = await dv.get<{ value: EntityRow[] }>(
    `EntityDefinitions?$select=LogicalName,MetadataId&$filter=LogicalName eq '${logicalName}'`,
  );
  return res.value[0] ?? null;
}

async function ensureTable(table: TableDef): Promise<void> {
  const logicalName = table.schemaName.toLowerCase();
  let entity = await findEntity(logicalName);
  if (!entity) {
    console.log(`Creating table ${table.schemaName}`);
    await dv.create(
      'EntityDefinitions',
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
        SchemaName: table.schemaName,
        DisplayName: label(table.displayName),
        DisplayCollectionName: label(table.pluralName),
        Description: label(table.description),
        OwnershipType: 'OrganizationOwned',
        IsActivity: false,
        HasActivities: false,
        HasNotes: false,
        Attributes: [
          {
            '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
            SchemaName: table.primaryName.schemaName,
            IsPrimaryName: true,
            MaxLength: table.primaryName.maxLength,
            FormatName: { Value: 'Text' },
            RequiredLevel: { Value: 'ApplicationRequired' },
            DisplayName: label(table.primaryName.displayName),
            Description: label(table.primaryName.displayName),
          },
        ],
      },
      solutionHeader,
    );
    entity = await findEntity(logicalName);
    if (!entity) throw new Error(`Table ${logicalName} not found after creation`);
  }

  const existingAttrs = await dv.get<{ value: { LogicalName: string }[] }>(
    `EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName`,
  );
  const have = new Set(existingAttrs.value.map((a) => a.LogicalName));
  for (const col of table.columns) {
    if (have.has(col.schemaName.toLowerCase())) continue;
    console.log(`  Adding column ${table.schemaName}.${col.schemaName}`);
    await dv.request('POST', `EntityDefinitions(LogicalName='${logicalName}')/Attributes`, attributeMetadata(col), solutionHeader);
  }
}

async function ensureRelationship(schemaName: string, referencing: TableDef): Promise<void> {
  const existing = await dv.get<{ value: { SchemaName: string }[] }>(
    `RelationshipDefinitions?$select=SchemaName&$filter=SchemaName eq '${schemaName}'`,
  );
  if (existing.value[0]) return;
  console.log(`Creating relationship ${schemaName}`);
  await dv.request(
    'POST',
    'RelationshipDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: schemaName,
      ReferencedEntity: CASE_TABLE.schemaName.toLowerCase(),
      ReferencingEntity: referencing.schemaName.toLowerCase(),
      CascadeConfiguration: {
        Assign: 'NoCascade',
        Delete: 'Cascade',
        Merge: 'NoCascade',
        Reparent: 'NoCascade',
        Share: 'NoCascade',
        Unshare: 'NoCascade',
      },
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: CASE_LOOKUP.schemaName,
        DisplayName: label(CASE_LOOKUP.displayName),
        Description: label(`The KYC case this ${referencing.displayName.toLowerCase()} belongs to.`),
        RequiredLevel: { Value: 'ApplicationRequired' },
      },
    },
    solutionHeader,
  );
}

async function main(): Promise<void> {
  const publisherId = await ensurePublisher();
  await ensureSolution(publisherId);
  for (const table of TABLES) await ensureTable(table);
  for (const rel of RELATIONSHIPS) await ensureRelationship(rel.schemaName, rel.referencing);
  console.log('Publishing customizations…');
  await dv.action('PublishAllXml', {});
  console.log('Done.');
}

await main();
