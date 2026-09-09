export type AdminProductSearchItem = {
  name: string;
  externalProductId?: string;
  variantLabel: string | null;
  unitLabel: string | null;
};

export function filterAdminProducts<T extends AdminProductSearchItem>(products: T[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalizedQuery) return products;
  return products.filter(product => [product.name, product.externalProductId, product.variantLabel, product.unitLabel]
    .filter(Boolean)
    .some(value => value!.toLocaleLowerCase("ko-KR").includes(normalizedQuery)));
}
