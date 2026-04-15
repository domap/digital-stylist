import { useNavigate } from "react-router-dom";
import type { Product } from "@/data/products";
import { Button } from "@/components/ui/button";
import { Heart, Send } from "lucide-react";

interface ProductCardProps {
  product: Product;
  onSuggest?: (product: Product) => void;
  onViewDetails?: (product: Product) => void;
  compact?: boolean;
  returnView?: "catalog" | "stylist";
  /** Associate multi-select (e.g. select many recommended items for cart). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (product: Product) => void;
}

export function ProductCard({
  product,
  onSuggest,
  onViewDetails,
  compact,
  returnView = "catalog",
  selectable,
  selected,
  onToggleSelect,
}: ProductCardProps) {
  const navigate = useNavigate();
  const handleViewDetails = () => navigate(`/product/${product.id}`, { state: { returnView } });
  if (compact) {
    return (
      <div className="w-full text-left flex gap-3 p-3 rounded-2xl border border-border bg-card/90 animate-fade-in-up hover:border-secondary/40 transition-colors">
        {selectable ? (
          <button
            type="button"
            className={`mt-1 h-5 w-5 rounded border flex items-center justify-center ${
              selected ? "bg-secondary/20 border-secondary" : "bg-background border-border"
            }`}
            aria-label={selected ? "Deselect product" : "Select product"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(product);
            }}
          >
            {selected ? <span className="text-[10px] font-bold leading-none">✓</span> : null}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (onViewDetails) return onViewDetails(product);
            handleViewDetails();
          }}
          className="flex-1 min-w-0 flex gap-3 text-left touch-target"
        >
          <img
            src={product.image}
            alt={product.name}
            className="w-16 h-20 object-cover rounded-xl"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-display text-sm font-semibold text-foreground truncate">{product.name}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">${product.price}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mt-1.5">{product.category}</p>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      className="group border border-border rounded-2xl overflow-hidden bg-card/90 hover:shadow-lg transition-all animate-fade-in-up cursor-pointer"
      onClick={handleViewDetails}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <button
          className="absolute top-2 right-2 w-9 h-9 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors touch-target"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <Heart className="h-3.5 w-3.5 text-foreground" />
        </button>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{product.category}</p>
        <h4 className="font-display text-xs font-semibold text-foreground leading-tight truncate">{product.name}</h4>
        <p className="text-xs font-semibold text-foreground">${product.price}</p>
        {onSuggest && (
          <Button
            size="sm"
            variant="default"
            className="w-full text-xs font-body mt-1"
            onClick={(e) => { e.stopPropagation(); onSuggest(product); }}
          >
            <Send className="h-3 w-3 mr-1" />
            Suggest
          </Button>
        )}
      </div>
    </div>
  );
}
