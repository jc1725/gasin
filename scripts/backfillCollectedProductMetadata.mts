import { eq } from "drizzle-orm";
import { products } from "../drizzle/schema";
import { getDb } from "../server/db";
import { describeProductVariant, getProductFamilyKey } from "../server/productVariant";

const database = await getDb();
if (!database) throw new Error("Database is unavailable");

const collectionProducts = await database
  .select({
    id: products.id,
    externalProductId: products.externalProductId,
    name: products.name,
    categoryName: products.categoryName,
    currentPrice: products.currentPrice,
    variantLabel: products.variantLabel,
    unitPrice: products.unitPrice,
    unitLabel: products.unitLabel,
  })
  .from(products)
  .where(eq(products.source, "collection"));

let updated = 0;
let metadataFound = 0;
for (const product of collectionProducts) {
  const variant = describeProductVariant(product.name, product.currentPrice, product.categoryName);
  const familyKey = getProductFamilyKey(product.name) ?? `collection:${product.externalProductId}`;
  if (variant.variantLabel) metadataFound += 1;
  await database.update(products).set({
    familyKey,
    variantLabel: variant.variantLabel ?? product.variantLabel,
    unitPrice: variant.unitPrice ?? product.unitPrice,
    unitLabel: variant.unitLabel ?? product.unitLabel,
  }).where(eq(products.id, product.id));
  updated += 1;
}

console.log(JSON.stringify({ collectionProducts: collectionProducts.length, updated, metadataFound }, null, 2));
process.exit(0);
