/**
 * The parts of Circle's `TokenMessengerWithFees` that Whisk calls, from the ABI
 * in Circle's contract interface reference. Only the `bytes signedQuote`
 * overload of each burn is listed, so encoding never has to pick between them.
 */
export const tokenMessengerWithFeesAbi = [
  {
    type: "function",
    name: "depositForBurnWithFees",
    stateMutability: "payable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      {
        name: "claim",
        type: "tuple",
        components: [
          { name: "signedQuote", type: "bytes" },
          { name: "refundAddress", type: "address" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getFee",
    stateMutability: "pure",
    inputs: [{ name: "signedQuote", type: "bytes" }],
    outputs: [
      { name: "totalFee", type: "uint256" },
      { name: "feeToken", type: "address" },
    ],
  },
  {
    type: "function",
    name: "tokenMessenger",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
