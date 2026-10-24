<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../lib/api';

const route = useRoute();
const state = ref<'ready' | 'working' | 'complete' | 'failed'>('ready');

async function optOut(): Promise<void> {
  state.value = 'working';
  try {
    await api(`/public/contacts/opt-out/${encodeURIComponent(String(route.params.token))}`, {
      method: 'POST'
    });
    state.value = 'complete';
  } catch {
    state.value = 'failed';
  }
}
</script>

<template>
  <section class="card status-card" aria-live="polite">
    <p class="eyebrow">Your consent is your choice</p>
    <h1>Stop Guardify alerts</h1>
    <template v-if="state === 'ready'">
      <p>
        This will stop safety alerts sent to this contact destination. It does not reveal the Guardify user's
        identity.
      </p>
      <button class="button-danger" type="button" @click="optOut">Stop alerts</button>
    </template>
    <template v-else-if="state === 'working'"><p>Processing your request…</p></template>
    <template v-else-if="state === 'complete'"
      ><p class="notice success">
        You have opted out. No further Guardify alerts should be sent to this destination unless you
        explicitly opt in again.
      </p></template
    >
    <template v-else
      ><p class="notice danger">This opt-out link is invalid or no longer available.</p></template
    >
  </section>
</template>
