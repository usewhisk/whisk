import type { Chain } from "@usewhisk/react";

export type Payee = {
  id: string;
  name: string;
  role: string;
  address: string;
  amount: number;
  chain: string;
  /** Passed to `<WhiskSend destinationChain>`. */
  chainCode: Chain;
  status: "pending" | "approved" | "sent" | "settled";
  initials: string;
  hue: number;
};

export const STUDIO_TREASURY = "0x5B8ecaB7096F8aBED873D246629ef9f05f467605";

export const PAYEES: Payee[] = [
  {
    id: "p1",
    name: "Mira Castellanos",
    role: "Creative Director",
    address: "0x5B8e…f7605",
    amount: 6400,
    chain: "Arc Testnet",
    chainCode: "Arc_Testnet",
    status: "pending",
    initials: "MC",
    hue: 340,
  },
  {
    id: "p2",
    name: "Jonas Holm",
    role: "Lead Designer",
    address: "0x9b21…ed12",
    amount: 4800,
    chain: "Base Sepolia",
    chainCode: "Base_Sepolia",
    status: "pending",
    initials: "JH",
    hue: 12,
  },
  {
    id: "p3",
    name: "Sade Achebe",
    role: "Senior Engineer",
    address: "0x3f41…b9aa",
    amount: 5600,
    chain: "Arc Testnet",
    chainCode: "Arc_Testnet",
    status: "pending",
    initials: "SA",
    hue: 280,
  },
  {
    id: "p4",
    name: "Yuki Tanabe",
    role: "Brand Strategist",
    address: "0x7a92…1cde",
    amount: 4200,
    chain: "OP Sepolia",
    chainCode: "Optimism_Sepolia",
    status: "pending",
    initials: "YT",
    hue: 200,
  },
  {
    id: "p5",
    name: "Ravi Mehta",
    role: "Motion Designer",
    address: "0x2b11…cd54",
    amount: 3800,
    chain: "Arbitrum Sepolia",
    chainCode: "Arbitrum_Sepolia",
    status: "pending",
    initials: "RM",
    hue: 50,
  },
  {
    id: "p6",
    name: "Olivia Pereira",
    role: "Producer",
    address: "0xe4f0…77b1",
    amount: 5100,
    chain: "Base Sepolia",
    chainCode: "Base_Sepolia",
    status: "pending",
    initials: "OP",
    hue: 320,
  },
];
