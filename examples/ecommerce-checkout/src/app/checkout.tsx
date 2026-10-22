"use client";

import { useState } from "react";
import { useCart, type HydratedLine } from "../hooks/use-cart";
import { makeOrderId } from "../lib/order";
import { SiteNav, SiteFooter } from "../components/chrome";
import { ShopView } from "../components/shop/shop-view";
import { CartFloater } from "../components/shop/cart-floater";
import { CheckoutView } from "../components/checkout/checkout-view";
import { SuccessView } from "../components/success/success-view";

type Step = "shop" | "checkout" | "success";

type PaidOrder = {
  orderId: string;
  txHash?: string;
  cart: HydratedLine[];
  totalStr: string;
};

/**
 * The cart is copied into the order when payment settles so the confirmation
 * still lists the items after `clear()`.
 */
export function ExampleCheckout() {
  const [step, setStep] = useState<Step>("shop");
  const [order, setOrder] = useState<PaidOrder | null>(null);
  const cart = useCart();

  const completeOrder = (txHash?: string) => {
    setOrder({
      orderId: makeOrderId(),
      txHash,
      cart: cart.hydrated,
      totalStr: cart.totals.totalStr,
    });
    setStep("success");
  };

  const shopAgain = () => {
    cart.clear();
    setOrder(null);
    setStep("shop");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-8 px-4 py-5 sm:px-8 md:gap-12">
      <SiteNav cartCount={cart.totals.itemCount} />

      {step === "shop" && (
        <ShopView cart={cart.hydrated} onAdd={cart.addLine} />
      )}

      {step === "checkout" && (
        <CheckoutView
          cart={cart.hydrated}
          totals={cart.totals}
          onUpdateQty={cart.setQty}
          onBackToShop={() => setStep("shop")}
          onPaid={completeOrder}
        />
      )}

      {step === "success" && order && (
        <SuccessView
          orderId={order.orderId}
          txHash={order.txHash}
          cart={order.cart}
          totalStr={order.totalStr}
          onShopAgain={shopAgain}
        />
      )}

      {step === "shop" && cart.totals.itemCount > 0 && (
        <CartFloater
          count={cart.totals.itemCount}
          total={cart.totals.subtotal}
          onCheckout={() => setStep("checkout")}
        />
      )}

      <SiteFooter />
    </main>
  );
}
