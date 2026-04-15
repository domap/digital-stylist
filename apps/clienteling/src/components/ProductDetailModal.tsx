import type { Product } from "@/data/products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Send, Heart, Ruler, Shirt, Sparkles, Package } from "lucide-react";

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuggest?: (product: Product) => void;
}

export function ProductDetailModal({ product, open, onOpenChange, onSuggest }: ProductDetailModalProps) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Image */}
          <div className="aspect-[4/5] overflow-hidden bg-muted">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Details */}
          <div className="p-6 space-y-4 overflow-y-auto">
            <DialogHeader className="space-y-1 p-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-body">{product.category}</p>
              <DialogTitle className="font-display text-xl font-semibold text-foreground leading-tight">
                {product.name}
              </DialogTitle>
              <p className="text-lg font-semibold text-foreground">${product.price}</p>
            </DialogHeader>

            <p className="text-sm text-muted-foreground font-body leading-relaxed">{product.description}</p>

            <Separator />

            {/* Fit & Sizes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Ruler className="h-3.5 w-3.5" />
                Fit & Sizing
              </div>
              <p className="text-sm font-body"><span className="font-semibold text-foreground">Fit:</span> {product.fit}</p>
              <div className="flex flex-wrap gap-1.5">
                {product.sizes.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-md border border-border text-xs font-body text-foreground">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colors</p>
              <div className="flex flex-wrap gap-1.5">
                {product.colors.map((c) => (
                  <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Occasions */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Perfect For
              </div>
              <div className="flex flex-wrap gap-1.5">
                {product.occasion.map((o) => (
                  <Badge key={o} variant="outline" className="text-xs">{o}</Badge>
                ))}
              </div>
            </div>

            {/* Fabric */}
            {product.fabric && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Shirt className="h-3.5 w-3.5" />
                  Fabric
                </div>
                <p className="text-sm text-muted-foreground font-body">{product.fabric}</p>
              </div>
            )}

            {/* Care */}
            {product.careInstructions && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  Care Instructions
                </div>
                <p className="text-sm text-muted-foreground font-body">{product.careInstructions}</p>
              </div>
            )}

            {/* Styling Tips */}
            {product.stylingTips && (
              <div className="space-y-1 bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  ✨ Stylist Tip
                </p>
                <p className="text-sm text-foreground font-body italic leading-relaxed">{product.stylingTips}</p>
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {onSuggest && (
                <Button className="flex-1 font-body" onClick={() => { onSuggest(product); onOpenChange(false); }}>
                  <Send className="h-4 w-4 mr-2" />
                  Suggest to Customer
                </Button>
              )}
              <Button variant="outline" size="icon">
                <Heart className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
