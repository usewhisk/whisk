/**
 * One-off: establish a USDC trustline on the Stellar testnet account
 * loaded from `WHISK_STELLAR_SEED`. Required before the account can
 * hold USDC — Circle's faucet usually does this automatically, but if
 * it didn't, run this to set it up manually.
 */
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const SEED = process.env["WHISK_STELLAR_SEED"];
if (!SEED) {
  console.error("WHISK_STELLAR_SEED required");
  process.exit(1);
}
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

async function main() {
  const kp = Keypair.fromSecret(SEED!);
  const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
  console.log(`Account: ${kp.publicKey()}`);

  const account = await horizon.loadAccount(kp.publicKey());
  const usdc = new Asset("USDC", USDC_ISSUER);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(180)
    .build();

  tx.sign(kp);

  console.log("Submitting changeTrust...");
  const result = await horizon.submitTransaction(tx);
  console.log(`OK  hash=${result.hash}`);
  console.log(
    `View: https://stellar.expert/explorer/testnet/tx/${result.hash}`,
  );
}

main().catch((err) => {
  if (err?.response?.data) {
    console.error(JSON.stringify(err.response.data, null, 2));
  } else {
    console.error(err);
  }
  process.exit(1);
});
