<script setup lang="ts">
import { ref, computed } from "vue";
import type { Chain } from "@usewhisk/core";
import { useWhiskEngine } from "./composables/useWhiskEngine";

const { account, state, isConnecting, isReady, connect, quote, send, reset } =
  useWhiskEngine();

// Form inputs — kept local so the composable stays focused on engine state.
const sourceChain = ref<Chain>("Base_Sepolia");
const destinationChain = ref<Chain>("Arc_Testnet");
const amount = ref("1.00");
const recipientAddress = ref("");

const isCrossChain = computed(
  () => sourceChain.value !== destinationChain.value,
);

const stepNameLabel: Record<string, string> = {
  approve: "Authorize",
  transfer: "Submit",
  burn: "Burn on source",
  fetchAttestation: "Wait for confirmation",
  mint: "Mint on destination",
  deposit: "Deposit",
  spend: "Spend",
};

function shortAddress(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function handleQuote() {
  if (!recipientAddress.value) return;
  await quote({
    amount: amount.value,
    recipientAddress: recipientAddress.value,
    sourceChain: sourceChain.value,
    destinationChain: destinationChain.value,
  });
}
</script>

<template>
  <main>
    <h1>Whisk · Vue headless</h1>
    <p class="lead">
      A minimal Vue 3 app that drives <code>@usewhisk/core</code> directly. No
      React, no <code>@usewhisk/react</code>. EVM only via browser wallet.
    </p>

    <div class="card">
      <template v-if="!isReady">
        <button @click="connect" :disabled="isConnecting">
          {{ isConnecting ? "Connecting…" : "Connect EVM wallet" }}
        </button>
      </template>

      <template v-else-if="state.kind === 'idle' || state.kind === 'failed'">
        <div v-if="state.kind === 'failed'" class="error">
          {{ state.error.message }}
        </div>

        <div class="row">
          <label for="source">Source chain</label>
          <select id="source" v-model="sourceChain">
            <option value="Base_Sepolia">Base Sepolia</option>
            <option value="Arc_Testnet">Arc Testnet</option>
          </select>
        </div>

        <div class="row">
          <label for="destination">Destination chain</label>
          <select id="destination" v-model="destinationChain">
            <option value="Arc_Testnet">Arc Testnet</option>
            <option value="Base_Sepolia">Base Sepolia</option>
          </select>
        </div>

        <div class="row">
          <label for="amount">Amount (USDC)</label>
          <input id="amount" v-model="amount" inputmode="decimal" />
        </div>

        <div class="row">
          <label for="recipient">Recipient address</label>
          <input
            id="recipient"
            v-model="recipientAddress"
            placeholder="0x…"
            spellcheck="false"
            autocomplete="off"
          />
        </div>

        <button
          @click="handleQuote"
          :disabled="!recipientAddress || !amount || Number(amount) <= 0"
        >
          Quote {{ isCrossChain ? "bridge" : "send" }}
        </button>

        <p class="muted" style="margin-top: 12px">
          Connected as <code>{{ shortAddress(account ?? "") }}</code>
        </p>
      </template>

      <template v-else-if="state.kind === 'quoting'">
        <p>Quoting…</p>
      </template>

      <template v-else-if="state.kind === 'review'">
        <div class="row">
          <label>Quote</label>
          <p>
            Sending <strong>{{ amount }} USDC</strong> from {{ sourceChain }} to
            {{ destinationChain }}.
          </p>
          <p class="muted">
            Total fees:
            <strong
              >{{ state.quote.fees.total }} {{ state.quote.fees.token }}</strong
            >
          </p>
        </div>
        <div style="display: flex; gap: 8px">
          <button class="secondary" @click="reset" style="flex: 1">Back</button>
          <button @click="send" style="flex: 1">Confirm</button>
        </div>
      </template>

      <template v-else-if="state.kind === 'sending'">
        <p>Sending {{ amount }} USDC…</p>
        <ul class="steps">
          <li v-for="step in state.steps" :key="step.name">
            <span :class="['step-dot', step.state]" />
            <span>{{ stepNameLabel[step.name] ?? step.name }}</span>
            <a
              v-if="step.explorerUrl"
              :href="step.explorerUrl"
              target="_blank"
              rel="noreferrer"
              style="margin-left: auto; font-size: 12px"
              >view</a
            >
          </li>
        </ul>
      </template>

      <template v-else-if="state.kind === 'succeeded'">
        <p>Sent {{ amount }} USDC.</p>
        <ul class="steps">
          <li v-for="step in state.steps" :key="step.name">
            <span :class="['step-dot', step.state]" />
            <span>{{ stepNameLabel[step.name] ?? step.name }}</span>
            <a
              v-if="step.explorerUrl"
              :href="step.explorerUrl"
              target="_blank"
              rel="noreferrer"
              style="margin-left: auto; font-size: 12px"
              >view</a
            >
          </li>
        </ul>
        <button class="secondary" @click="reset" style="margin-top: 12px">
          Send another
        </button>
      </template>
    </div>
  </main>
</template>
