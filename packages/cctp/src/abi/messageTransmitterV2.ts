/**
 * The subset of `MessageTransmitterV2` Whisk uses: `receiveMessage` for
 * manual recovery, `usedNonces` to check whether a message was minted, and
 * the `MessageReceived` and `MessageSent` events.
 */
export const messageTransmitterV2Abi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    type: "function",
    name: "usedNonces",
    stateMutability: "view",
    inputs: [{ name: "nonce", type: "bytes32" }],
    outputs: [{ name: "isUsed", type: "uint256" }],
  },
  {
    type: "event",
    name: "MessageReceived",
    anonymous: false,
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "sourceDomain", type: "uint32", indexed: true },
      { name: "nonce", type: "bytes32", indexed: true },
      { name: "sender", type: "bytes32", indexed: false },
      { name: "finalityThresholdExecuted", type: "uint32", indexed: false },
      { name: "messageBody", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MessageSent",
    anonymous: false,
    inputs: [{ name: "message", type: "bytes", indexed: false }],
  },
] as const;
