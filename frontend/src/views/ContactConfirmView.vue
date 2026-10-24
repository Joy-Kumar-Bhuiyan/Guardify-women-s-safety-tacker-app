<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../lib/api';

const route = useRoute();
const state = ref<'ready' | 'loading' | 'confirmed' | 'failed'>('ready');
async function confirm(): Promise<void> {
  state.value = 'loading';
  try {
    await api(`/public/contacts/confirm/${encodeURIComponent(String(route.params.token))}`, {
      method: 'POST'
    });
    state.value = 'confirmed';
  } catch {
    state.value = 'failed';
  }
}
</script>

<template>
  <section class="card status-card" aria-live="polite">
    <p class="eyebrow">Guardify contact consent</p>
    <template v-if="state === 'ready'"
      ><h1>Receive Guardify alerts?</h1>
      <p>
        Confirm only if you know and trust the person who sent this invitation. You can opt out from any
        alert.
      </p>
      <button type="button" @click="confirm">I agree to receive alerts</button></template
    >
    <h1 v-else-if="state === 'loading'">Confirming…</h1>
    <template v-else-if="state === 'confirmed'"
      ><h1>You're confirmed</h1>
      <p>
        You can now receive safety alerts from this Guardify user. Every alert should include an opt-out
        route.
      </p></template
    >
    <template v-else
      ><h1>Link unavailable</h1>
      <p>
        This confirmation link is invalid, expired, or already used. Ask the Guardify user to send a new
        invitation.
      </p></template
    >
  </section>
</template>
