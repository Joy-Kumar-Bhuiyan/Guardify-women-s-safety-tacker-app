<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const privacy = computed(() => route.meta.document === 'privacy');
</script>

<template>
  <section class="card status-card">
    <p class="eyebrow">Guardify</p>
    <template v-if="privacy">
      <h1>Privacy notice</h1>
      <p>
        Guardify processes identity, opted-in contacts, explicit sharing state, safety events, and precise
        location only for the safety features you choose. Contact destinations and coordinates are encrypted
        before storage. Share links expire and can be revoked.
      </p>
      <p>
        You can export or erase your data from Incident history. Stopped shares remove their current location.
        This pre-launch notice must be completed by the operator with legal identity, subprocessors, regions,
        backup retention, age policy, and complaint contacts.
      </p>
    </template>
    <template v-else>
      <h1>Terms placeholder</h1>
      <p>
        Guardify is a best-effort safety coordination tool, not an emergency service and not a guarantee of
        delivery or rescue. Call local emergency services directly whenever possible.
      </p>
      <p>
        Do not use Guardify to track, coerce, harass, impersonate, or endanger another person. The production
        operator must publish final jurisdiction-reviewed terms before accepting real users.
      </p>
    </template>
    <RouterLink to="/">Return to Guardify</RouterLink>
  </section>
</template>
