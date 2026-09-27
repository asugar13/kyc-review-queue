// Regenerates canvas-app/pkgs/TableDefinitions/<table>.json and the
// NativeCDSDataSourceInfoNameMapping in canvas-app/DataSources/<table>.json from
// live Dataverse metadata. Power Apps Studio/Player expect the same Web API
// payloads a Studio-authored app embeds (entity definition, option sets, views,
// forms); without them the .msapp cannot be opened.
//
//   PP_ENV_URL=... PP_TENANT_ID=... PP_CLIENT_ID=... PP_CLIENT_SECRET=... node scripts/tabledefs.ts

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DataverseClient, configFromEnv } from './dataverse.ts';

interface LocalizedLabel {
  UserLocalizedLabel: { Label: string } | null;
}
interface AttributeMeta {
  LogicalName: string;
  AttributeType: string;
  DisplayName: LocalizedLabel;
}
interface RelationshipMeta {
  SchemaName: string;
  ReferencingEntity: string;
  ReferencedEntity: string;
  ReferencingEntityNavigationPropertyName?: string;
  ReferencedEntityNavigationPropertyName?: string;
}
interface EntityMeta {
  Attributes: AttributeMeta[];
  OneToManyRelationships: RelationshipMeta[];
  ManyToOneRelationships: RelationshipMeta[];
  EntitySetName: string;
}
interface DataSourceDef {
  Name: string;
  LogicalName?: string;
  Type: string;
  NativeCDSDataSourceInfoNameMapping?: Record<string, string>;
  [k: string]: unknown;
}

const HERE = join(import.meta.dirname, '..', 'canvas-app');
const cfg = configFromEnv();
const client = new DataverseClient(cfg);
const api = `${cfg.envUrl}/api/data/v9.0`;

const ENTITY_SELECT =
  'MetadataId,LogicalName,DisplayCollectionName,EntitySetName,Description,HasNotes,IsActivity,IsIntersect,IsManaged,TableType,IsPrivate,IsLogicalEntity,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,Privileges,IsAvailableOffline,IsOfflineInMobileClient';
const OPTIONSET_TYPES = {
  PicklistOptionSetAttribute: 'PicklistAttributeMetadata',
  MultiSelectPicklistOptionSetAttribute: 'MultiSelectPicklistAttributeMetadata',
  StateOptionSetAttribute: 'StateAttributeMetadata',
  StatusOptionSetAttribute: 'StatusAttributeMetadata',
  BooleanOptionSetAttribute: 'BooleanAttributeMetadata',
  EntityNameOptionSetAttribute: 'EntityNameAttributeMetadata',
} as const;

async function tableDefinition(logicalName: string): Promise<{ def: Record<string, string>; entity: EntityMeta }> {
  const entity = await client.get<EntityMeta>(
    `${api}/EntityDefinitions(LogicalName='${logicalName}')?$select=${ENTITY_SELECT}&$expand=Attributes,ManyToOneRelationships,OneToManyRelationships,ManyToManyRelationships`,
  );
  const def: Record<string, string> = { TableName: logicalName, EntityMetadata: JSON.stringify(entity) };
  for (const [key, type] of Object.entries(OPTIONSET_TYPES)) {
    def[key] = JSON.stringify(
      await client.get(
        `${api}/EntityDefinitions(LogicalName='${logicalName}')/Attributes/Microsoft.Dynamics.CRM.${type}?$select=MetadataId,LogicalName,SchemaName,DisplayName&$expand=OptionSet`,
      ),
    );
  }
  def.Views = JSON.stringify(
    await client.get(`${api}/savedqueries?$select=savedqueryid,name,querytype&$filter=returnedtypecode eq '${logicalName}'`),
  );
  def.DefaultPublicView = JSON.stringify(
    await client.get(
      `${api}/savedqueries?$select=layoutxml&$filter=returnedtypecode eq '${logicalName}' and isdefault eq true and querytype eq 0`,
    ),
  );
  def.IconUrl = '';
  def.Forms = JSON.stringify(
    await client.get(`${api}/systemforms?$select=name,formid,type&$filter=objecttypecode eq '${logicalName}'`),
  );
  return { def, entity };
}

function nameMapping(entity: EntityMeta): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of entity.Attributes) {
    const label = a.DisplayName.UserLocalizedLabel?.Label;
    if (!label) continue;
    map[a.LogicalName] = label;
    if (a.AttributeType === 'Lookup' || a.AttributeType === 'Owner' || a.AttributeType === 'Customer') {
      map[`_${a.LogicalName}_value`] = label;
    }
  }
  for (const r of entity.OneToManyRelationships) map[r.SchemaName] = r.ReferencingEntity;
  for (const r of entity.ManyToOneRelationships) map[r.SchemaName] = r.ReferencedEntity;
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
}

const dsDir = join(HERE, 'DataSources');
for (const file of readdirSync(dsDir)) {
  const path = join(dsDir, file);
  const sources = JSON.parse(readFileSync(path, 'utf8')) as DataSourceDef[];
  let changed = false;
  for (const ds of sources) {
    if (ds.Type !== 'NativeCDSDataSourceInfo' || !ds.LogicalName) continue;
    const { def, entity } = await tableDefinition(ds.LogicalName);
    const tdPath = join(HERE, 'pkgs', 'TableDefinitions', `${ds.Name}.json`);
    writeFileSync(
      tdPath,
      JSON.stringify(
        {
          DatasetName: 'default.cds',
          EntityName: ds.Name,
          InstanceUrl: `${cfg.envUrl}/`,
          LocalReferenceDSJson: { entitySetName: entity.EntitySetName, logicalName: ds.LogicalName },
          state: 'Configured',
          TableDefinition: def,
          UnusedDataSources: {},
          webApiVersion: 'v9.0',
        },
        null,
        2,
      ) + '\n',
    );
    ds.NativeCDSDataSourceInfoNameMapping = nameMapping(entity);
    changed = true;
    console.log(`${ds.LogicalName}: ${entity.Attributes.length} attributes -> ${tdPath}`);
  }
  if (changed) {
    writeFileSync(
      path,
      JSON.stringify(sources.map((d) => Object.fromEntries(Object.entries(d).sort(([a], [b]) => a.localeCompare(b)))), null, 2) + '\n',
    );
  }
}
