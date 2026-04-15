/** Product shape for catalog / PDP / bag — rows come from GET /api/v1/catalog/products. */

export interface Product {
  id: string;
  name: string;
  brand?: "AnnTaylor" | "Loft";
  price: number;
  category: string;
  occasion: string[];
  style: string[];
  sizes: string[];
  colors: string[];
  image: string;
  description: string;
  fit: string;
  fabric?: string;
  careInstructions?: string;
  stylingTips?: string;
}
