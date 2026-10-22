"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CATALOG,
  SHIPPING_FREE_OVER,
  type Product,
  type ProductId,
  type Variant,
} from "../data/catalog";

export type CartLine = { productId: ProductId; variantId: string; qty: number };
export type HydratedLine = { product: Product; variant: Variant; qty: number };

export type CartTotals = {
  subtotal: number;
  shipping: number;
  total: number;
  totalStr: string;
  itemCount: number;
  freeShippingProgress: number;
};

/**
 * `addLine` merges into an existing line with the same variant, up to 9.
 * `setQty` to zero or below removes the line.
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);

  const hydrated = useMemo(() => hydrate(lines), [lines]);

  const totals = useMemo<CartTotals>(() => {
    const subtotal = hydrated.reduce(
      (s, l) => s + l.qty * l.product.priceUsdc,
      0,
    );
    const itemCount = lines.reduce((s, l) => s + l.qty, 0);
    return {
      subtotal,
      shipping: 0,
      total: subtotal,
      totalStr: subtotal.toFixed(2),
      itemCount,
      freeShippingProgress: Math.min(subtotal / SHIPPING_FREE_OVER, 1),
    };
  }, [hydrated, lines]);

  const addLine = useCallback((productId: ProductId, variantId: string) => {
    setLines((prev) => {
      const idx = prev.findIndex(
        (l) => l.productId === productId && l.variantId === variantId,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx]!, qty: Math.min(next[idx]!.qty + 1, 9) };
        return next;
      }
      return [...prev, { productId, variantId, qty: 1 }];
    });
  }, []);

  const setQty = useCallback((index: number, qty: number) => {
    setLines((prev) => {
      if (qty <= 0) return prev.filter((_, i) => i !== index);
      return prev.map((l, i) => (i === index ? { ...l, qty } : l));
    });
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, hydrated, totals, addLine, setQty, clear };
}

function hydrate(lines: CartLine[]): HydratedLine[] {
  return lines.flatMap((l) => {
    const product = CATALOG.find((p) => p.id === l.productId);
    const variant = product?.variants.find((v) => v.id === l.variantId);
    if (!product || !variant) return [];
    return [{ product, variant, qty: l.qty }];
  });
}
