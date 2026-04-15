import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { products } from "../data/products.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] ?? join(__dirname, "../fixtures/products.json");

function stableAssetPath(bundledImage: string): string {
  const file = bundledImage.split(/[/\\]/).pop() ?? bundledImage;
  const stable = file.replace(/-[A-Z0-9]{6,}(\.jpe?g)$/i, "$1");
  return `../assets/products/${stable}`;
}

const rows = products.map((p) => ({
  sku: p.id,
  name: p.name,
  description: p.description,
  price: p.price,
  brand: p.brand ?? null,
  category: p.category,
  sizes: p.sizes,
  inventory_status: "in_stock",
  images: [stableAssetPath(typeof p.image === "string" ? p.image : String(p.image))],
  attributes: {
    occasion: p.occasion.join(", "),
    style: p.style.join(", "),
    colors: p.colors.join(", "),
    fit: p.fit,
    ...(p.fabric ? { fabric: p.fabric } : {}),
    ...(p.careInstructions ? { care_instructions: p.careInstructions } : {}),
    ...(p.stylingTips ? { styling_tips: p.stylingTips } : {}),
  },
}));

writeFileSync(outPath, JSON.stringify({ products: rows }, null, 2), "utf-8");
console.error(`Wrote ${rows.length} products to ${outPath}`);
