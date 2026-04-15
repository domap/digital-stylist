import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/data/products";
import { occasions } from "@/data/catalog-ui";
import type { CustomerProfile } from "@/data/customers";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, ArrowLeft, SlidersHorizontalIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

function personalizationScore(product: Product, customer: CustomerProfile): number {
  let s = 0;
  const styles = new Set(customer.stylePreferences.map((x) => x.toLowerCase()));
  for (const st of product.style) {
    if (styles.has(st.toLowerCase())) s += 3;
  }
  for (const c of product.colors) {
    const cl = c.toLowerCase();
    for (const pref of customer.colorPreferences) {
      const pl = pref.toLowerCase();
      if (cl === pl || cl.includes(pl) || pl.includes(cl)) s += 2;
    }
  }
  return s;
}

interface ProductCatalogProps {
  products: Product[];
  onSuggestProduct: (product: Product) => void;
  /** When this changes, search/filters reset and ranking personalizes to the customer. */
  customer?: CustomerProfile | null;
}

const PAGE_SIZE = 8;
const LISTING_OCCASIONS = occasions.filter((occasion) => !["Garden Party", "New Year", "Tour"].includes(occasion));
const NAV_GROUPS = ["All New Arrivals", "New Petite Styles", "New Shoes & Accessories", "The Preview"];

export function ProductCatalog({ products, onSuggestProduct, customer = null }: ProductCatalogProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setSearch("");
    setSelectedOccasion(null);
    setCurrentPage(1);
  }, [customer?.id ?? "guest"]);

  const filtered = useMemo(() => {
    const base = products.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      const matchesOccasion = !selectedOccasion || p.occasion.includes(selectedOccasion);
      return matchesSearch && matchesOccasion;
    });
    if (!customer) return base;
    return [...base].sort(
      (a, b) =>
        personalizationScore(b, customer) -
          personalizationScore(a, customer) || a.name.localeCompare(b.name)
    );
  }, [customer, search, selectedOccasion]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const handleOccasionChange = (occasion: string | null) => {
    setSelectedOccasion(occasion);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  return (
    <div className="ios-card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] min-h-[72vh]">
        <aside className="border-r border-border bg-white/85">
          <div className="h-14 border-b border-border px-4 flex items-center gap-3 text-sm">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">New Arrivals</span>
            <button
              type="button"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch("");
                handleOccasionChange(null);
              }}
            >
              Reset
            </button>
          </div>

          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search catalog..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 pr-20 font-body text-sm h-11 rounded-xl"
              />
              <button
                type="button"
                className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowFilters((prev) => !prev)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SlidersHorizontalIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-border">
            {NAV_GROUPS.map((group) => (
              <button key={group} className="w-full text-left px-4 py-3.5 text-sm hover:bg-muted/40 transition-colors touch-target">
                {group}
              </button>
            ))}
          </div>

          {showFilters && (
            <div className="p-3 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Occasion</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleOccasionChange(null)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors touch-target ${
                    !selectedOccasion ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All
                </button>
                {LISTING_OCCASIONS.map((o) => (
                  <button
                    key={o}
                    onClick={() => handleOccasionChange(selectedOccasion === o ? null : o)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors touch-target ${
                      selectedOccasion === o ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section>
          <div className="h-14 border-b border-border px-4 flex items-center justify-between bg-white/80">
            <p className="text-sm font-semibold">
              {customer && !search && !selectedOccasion ? (
                <>
                  Personalized for{" "}
                  <span className="font-normal text-secondary">{customer.name}</span>
                  <span className="font-normal text-muted-foreground font-body text-xs ml-2">
                    (styles & colors you love first)
                  </span>
                </>
              ) : (
                <>
                  Results for:{" "}
                  <span className="font-normal">{search || selectedOccasion || (customer ? "All — filtered for you" : "All Products")}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages} · {filtered.length} total</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
            {visible.map((product) => (
              <button
                key={product.id}
                onClick={() => navigate(`/product/${product.id}`)}
                className="w-full px-4 py-3.5 text-left border border-border rounded-xl bg-white/80 hover:bg-muted/30 transition-colors touch-target"
              >
                <div className="grid grid-cols-[72px_1fr] gap-4 items-start">
                  <img src={product.image} alt={product.name} className="w-[72px] h-[96px] object-cover rounded-lg border border-border" />
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">{product.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">${product.price}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {product.colors.slice(0, 6).map((color) => (
                        <span
                          key={color}
                          title={color}
                          className="w-3.5 h-3.5 rounded-full border border-border bg-muted"
                        />
                      ))}
                      {product.colors.length > 6 && (
                        <span className="text-xs text-muted-foreground">+{product.colors.length - 6}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm font-body">No products match your filters</p>
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="flex items-center justify-end gap-2 px-3 pb-3">
              <button
                type="button"
                className="h-9 px-3 rounded-md border border-border bg-white text-sm inline-flex items-center gap-1 disabled:opacity-50"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-md border border-border bg-white text-sm inline-flex items-center gap-1 disabled:opacity-50"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
