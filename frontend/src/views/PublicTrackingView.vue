<script setup lang="ts">
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { api, apiUrl } from '../lib/api';

interface TrackingData {
  purpose: string;
  expiresAt: string;
  lastLocationAt: string | null;
  location: { latitude: number; longitude: number; accuracy?: number; batteryLevel?: number } | null;
}

const { t } = useI18n();
const route = useRoute();
const data = ref<TrackingData | null>(null);
const failed = ref(false);
const acknowledged = ref(false);
const mapElement = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let events: EventSource | null = null;
const mapShown = ref(false);

async function load(): Promise<void> {
  const token = encodeURIComponent(String(route.params.token));
  try {
    data.value = await api<TrackingData>(`/public/track/${token}`);
    events = new EventSource(apiUrl(`/public/track/${token}/events`));
    events.addEventListener('location', (event) => {
      data.value = JSON.parse((event as MessageEvent<string>).data) as TrackingData;
    });
    events.addEventListener('revoked', () => {
      events?.close();
      failed.value = true;
      data.value = null;
    });
  } catch {
    failed.value = true;
  }
}

async function acknowledge(): Promise<void> {
  await api(`/public/track/${encodeURIComponent(String(route.params.token))}/acknowledge`, {
    method: 'POST'
  });
  acknowledged.value = true;
}

async function showMap(): Promise<void> {
  if (!data.value?.location) return;
  await nextTick();
  if (!mapElement.value || map) return;
  const { latitude, longitude } = data.value.location;
  map = L.map(mapElement.value, { zoomControl: true }).setView([latitude, longitude], 15);
  mapShown.value = true;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  L.circle([latitude, longitude], { radius: data.value.location.accuracy ?? 20, color: '#6d1836' }).addTo(
    map
  );
}

onMounted(() => void load());
onBeforeUnmount(() => {
  events?.close();
  map?.remove();
});
</script>

<template>
  <section class="card status-card" aria-live="polite">
    <p class="eyebrow">Consent-bound · expiring · revocable</p>
    <h1>{{ t('tracking.title') }}</h1>
    <p v-if="failed" class="notice danger">{{ t('tracking.inactive') }}</p>
    <template v-else-if="data">
      <h2>{{ data.purpose }}</h2>
      <dl>
        <dt>{{ t('tracking.expires') }}</dt>
        <dd>{{ new Date(data.expiresAt).toLocaleString() }}</dd>
        <dt>{{ t('tracking.updated') }}</dt>
        <dd>
          {{
            data.lastLocationAt
              ? new Date(data.lastLocationAt).toLocaleString()
              : 'Waiting for a location update'
          }}
        </dd>
        <template v-if="data.location?.accuracy"
          ><dt>{{ t('tracking.accuracy') }}</dt>
          <dd>Within approximately {{ Math.round(data.location.accuracy) }} m</dd></template
        >
        <template v-if="data.location?.batteryLevel !== undefined"
          ><dt>{{ t('tracking.battery') }}</dt>
          <dd>{{ Math.round(data.location.batteryLevel * 100) }}%</dd></template
        >
      </dl>
      <button v-if="data.location && !mapShown" class="button-secondary" type="button" @click="showMap">
        Show map (loads OpenStreetMap tiles)
      </button>
      <div
        v-show="mapShown"
        ref="mapElement"
        style="height: 320px; margin-top: 1rem; border-radius: 0.8rem"
        aria-label="Shared location map"
      ></div>
      <p v-if="acknowledged" class="notice success">{{ t('tracking.acknowledged') }}</p>
      <button v-else type="button" @click="acknowledge">{{ t('tracking.acknowledge') }}</button>
      <p class="muted" style="margin-top: 1rem">
        This page contains no advertising or analytics scripts. Do not forward this private link.
      </p>
    </template>
    <p v-else>{{ t('common.loading') }}</p>
  </section>
</template>
