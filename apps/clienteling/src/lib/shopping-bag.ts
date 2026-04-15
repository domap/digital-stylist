export type BagLine = {
  lineId: string;
  productId: string;
  name: string;
  brand: "AnnTaylor" | "Loft";
  image: string;
  price: number;
  size: string;
  color: string;
  quantity: number;
  fulfillment: "online" | "store";
};

function activeBagKey(): string {
  if (typeof window === "undefined") return "clienteling.shopping_bag.guest";
  const customerId = window.localStorage.getItem("clienteling.selectedCustomerId");
  if (customerId && customerId.trim()) return `clienteling.shopping_bag.customer.${customerId.trim()}`;
  const guestId = window.localStorage.getItem("clienteling.guestContextId");
  if (guestId && guestId.trim()) return `clienteling.shopping_bag.guest.${guestId.trim()}`;
  return "clienteling.shopping_bag.guest";
}

function parseBag(raw: string | null): BagLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is BagLine =>
        typeof row === "object" &&
        row !== null &&
        "lineId" in row &&
        "productId" in row &&
        "quantity" in row
    );
  } catch {
    return [];
  }
}

export function getShoppingBag(): BagLine[] {
  if (typeof window === "undefined") return [];
  return parseBag(window.localStorage.getItem(activeBagKey()));
}

export function setShoppingBag(lines: BagLine[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeBagKey(), JSON.stringify(lines));
  window.dispatchEvent(new Event("shopping-bag-changed"));
}

export function addLineToBag(line: Omit<BagLine, "lineId">): BagLine {
  const next: BagLine = { ...line, lineId: crypto.randomUUID() };
  const lines = getShoppingBag();
  lines.push(next);
  setShoppingBag(lines);
  return next;
}

export function removeLineFromBag(lineId: string) {
  setShoppingBag(getShoppingBag().filter((l) => l.lineId !== lineId));
}

export function updateLineQuantity(lineId: string, quantity: number) {
  if (quantity < 1) {
    removeLineFromBag(lineId);
    return;
  }
  setShoppingBag(
    getShoppingBag().map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(99, quantity) } : l))
  );
}

export function clearShoppingBag() {
  setShoppingBag([]);
}

export function bagItemCount(lines: BagLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

export function bagSubtotal(lines: BagLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
}
