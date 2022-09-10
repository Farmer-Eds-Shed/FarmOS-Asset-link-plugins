/**
 * Searches for animals by name.
 */
export default class NamedBasedAnimalSearcher {

  static searchEntities(assetLink, searchRequest, searchPhase) {
    if (searchRequest.type !== 'animal-search') {
      return undefined;
    }

    const term = searchRequest.term;
    const additionalFilters = searchRequest.additionalFilters || [];

    async function* iteratePaginatedResults() {
      let entityBundles = searchRequest.entityBundles;

      if (!entityBundles && searchRequest.entityType === 'asset') {
        entityBundles = (await assetLink.getAssetTypes()).map(t => t.attributes.drupal_internal__id);
      }

      if (!entityBundles && searchRequest.entityType === 'log') {
        entityBundles = (await assetLink.getLogTypes()).map(t => t.attributes.drupal_internal__id);
      }

      if (!entityBundles && searchRequest.entityType === 'taxonomy_term') {
        entityBundles = (await assetLink.getTaxonomyVocabularies()).map(t => t.attributes.drupal_internal__vid);
      }

      if (!entityBundles || !entityBundles.length) {
        return;
      }

      const entitySource = searchPhase === 'local' ? assetLink.entitySource.cache : assetLink.entitySource;

      const results = await entitySource.query(q => entityBundles.flatMap(entityBundle => {
        const typeName = `asset--animal`;

        const model = assetLink.getEntityModelSync(typeName);

        const sortingKey = Object.keys(model.attributes).find(k => /^drupal_internal__.?id$/.test(k)) || 'id';

        if (!model?.attributes?.name) {
          return [];
        }

        let baseQuery = q
          .findRecords(typeName)

        if (term) {
          baseQuery = baseQuery.filter({ attribute: 'name', op: 'CONTAINS', value: term });
        }

        return [additionalFilters
          .reduce((query, f) => query.filter(f), baseQuery)
          .sort(sortingKey)];
      }));

      const entities = results.flatMap(l => l);

      for (let entity of entities) {
        yield {
          weight: 1,
          weightText: `Name contains term "${term}"`,
          entity,
        };
      }
    }

    return iteratePaginatedResults();
  }
}
