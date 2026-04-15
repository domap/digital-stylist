import { useCallback, useEffect, useState } from "react";
import {
  addLineToBag,
  bagItemCount,
  bagSubtotal,
  clearShoppingBag,
  getShoppingBag,
  removeLineFromBag,
  updateLineQuantity,
  type BagLine,
} from "@/lib/shopping-bag";

export function useShoppingBag() {
  const [lines, setLines] = useState<BagLine[]>(() => getShoppingBag());

  const refresh = useCallback(() => setLines(getShoppingBag()), []);

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener("shopping-bag-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("shopping-bag-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  return {
    lines,
    itemCount: bagItemCount(lines),
    subtotal: bagSubtotal(lines),
    refresh,
    addLine: (line: Omit<BagLine, "lineId">) => addLineToBag(line),
    removeLine: removeLineFromBag,
    setQuantity: updateLineQuantity,
    clear: clearShoppingBag,
  };
}
