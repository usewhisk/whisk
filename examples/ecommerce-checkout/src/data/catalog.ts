export type ProductId = "shirt" | "candle" | "pin" | "tote" | "journal";

export type Variant = { id: string; label: string };

export type Product = {
  id: ProductId;
  name: string;
  caption: string;
  priceUsdc: number;
  variants: Variant[];
  /** Unsplash CDN URL: stable and free for commercial use. */
  image: string;
  /** Shown while the image loads; matched to the photo. */
  fallbackColor: string;
  category: "Apparel" | "Home" | "Stationery" | "Accessories";
};

export const MERCHANT_ADDRESS = "0x5B8ecaB7096F8aBED873D246629ef9f05f467605";

export const SHIPPING_FREE_OVER = 50;

export const CATALOG: Product[] = [
  {
    id: "shirt",
    name: "Linen camp shirt",
    caption: "Ecru / heavy 240gsm / matte horn buttons",
    priceUsdc: 48,
    variants: [
      { id: "s", label: "S" },
      { id: "m", label: "M" },
      { id: "l", label: "L" },
      { id: "xl", label: "XL" },
    ],
    image:
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&q=80&auto=format&fit=crop",
    fallbackColor: "#b89a72",
    category: "Apparel",
  },
  {
    id: "pin",
    name: "Tortoise reading glasses",
    caption: "Acetate · amber tortoise · neutral lens",
    priceUsdc: 29,
    variants: [{ id: "amber", label: "Amber" }],
    image:
      "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?w=800&q=80&auto=format&fit=crop",
    fallbackColor: "#6a4423",
    category: "Accessories",
  },
  {
    id: "tote",
    name: "Atelier weekend tote",
    caption: "Waxed canvas · saddle leather handles",
    priceUsdc: 96,
    variants: [
      { id: "natural", label: "Natural" },
      { id: "umber", label: "Umber" },
    ],
    image:
      "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800&q=80&auto=format&fit=crop",
    fallbackColor: "#94714d",
    category: "Accessories",
  },
  {
    id: "journal",
    name: "Hardcover field journal",
    caption: "Letterpressed · 192 pages · ribbon marker",
    priceUsdc: 24,
    variants: [
      { id: "rust", label: "Rust" },
      { id: "olive", label: "Olive" },
    ],
    image:
      "https://images.unsplash.com/photo-1517842645767-c639042777db?w=800&q=80&auto=format&fit=crop",
    fallbackColor: "#944c2e",
    category: "Stationery",
  },
];
