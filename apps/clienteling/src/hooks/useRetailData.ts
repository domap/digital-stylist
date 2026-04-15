import { useQuery } from "@tanstack/react-query";
import type { CustomerProfile } from "@/data/customers";
import type { Product } from "@/data/products";
import { loadCatalogProducts, loadCustomerProfiles } from "@/lib/retail-data";

export const QK_CATALOG_PRODUCTS = ["retail", "catalog", "products"] as const;
export const QK_RETAIL_CUSTOMERS = ["retail", "customers"] as const;

export function useCatalogProducts() {
  return useQuery<Product[]>({
    queryKey: [...QK_CATALOG_PRODUCTS],
    queryFn: loadCatalogProducts,
    staleTime: 60_000,
  });
}

export function useRetailCustomerProfiles() {
  return useQuery<CustomerProfile[]>({
    queryKey: [...QK_RETAIL_CUSTOMERS],
    queryFn: loadCustomerProfiles,
    staleTime: 60_000,
  });
}
