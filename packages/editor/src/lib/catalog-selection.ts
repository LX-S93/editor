import type { CatalogItem } from '@pascal-app/core/catalog'

export function isCatalogItemSelected(
  item: Pick<CatalogItem, 'id'>,
  selected: Pick<CatalogItem, 'id'> | null,
) {
  return selected != null && item.id === selected.id
}
