<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { api, getPosition, idempotencyKey } from '../lib/api';

interface Contact {
  id: string;
  name: string;
  confirmedAt: string | null;
}
interface Share {
  id: string;
  purpose: string;
  status: string;
  expiresAt: string;
  contactIds: string[];
}
interface HelpPoint {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
}

const { t } = useI18n();
const contacts = ref<Contact[]>([]);
const selected = ref<string[]>([]);
const shares = ref<Share[]>([]);
const busy = ref(false);
const status = ref('');
const error = ref('');
const showFakeCall = ref(false);
const incidentId = ref('');
const safePin = ref('');
const duressPin = ref('');
const cancelPin = ref('');
const helpPoints = ref<HelpPoint[]>([]);
const helpMapUrl = ref('');
const helpDegraded = ref(false);
let watchId: number | null = null;
const confirmed = computed(() => contacts.value.filter((contact) => contact.confirmedAt));
const activeShares = computed(() =>
  shares.value.filter((share) => share.status === 'active' && new Date(share.expiresAt) > new Date())
);

function audienceNames(share: Share): string {
  return share.contactIds
    .map((id) => contacts.value.find((contact) => contact.id === id)?.name)
    .filter(Boolean)
    .join(', ');
}

async function load(): Promise<void> {
  try {
    [contacts.value, shares.value] = await Promise.all([
      api<Contact[]>('/contacts'),
      api<Share[]>('/shares')
    ]);
    selected.value = confirmed.value.map((contact) => contact.id);
  } catch {
    error.value = 'Safety information could not be loaded.';
  }
}

async function sendSos(): Promise<void> {
  if (confirmed.value.length === 0) {
    error.value = t('dashboard.noContacts');
    return;
  }
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    const position = await getPosition();
    const result = await api<{ incidentId: string; confirmedContactCount: number }>('/sos', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey() },
      body: JSON.stringify({
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString()
        },
        contactIds: confirmed.value.map((contact) => contact.id)
      })
    });
    status.value = `${t('dashboard.sent')} · ${result.confirmedContactCount} contact(s)`;
    incidentId.value = result.incidentId;
  } catch {
    error.value = navigator.onLine
      ? 'SOS could not be accepted. Call emergency services directly.'
      : 'SOS is queued on this device. It has NOT been delivered yet. Call 999 if possible.';
  } finally {
    busy.value = false;
  }
}

async function savePins(): Promise<void> {
  error.value = '';
  try {
    await api('/settings/safety-pin', {
      method: 'PUT',
      body: JSON.stringify({ safePin: safePin.value, duressPin: duressPin.value })
    });
    safePin.value = '';
    duressPin.value = '';
    status.value = 'Safety and duress PINs saved.';
  } catch {
    error.value = 'Use two different PINs, each 4–8 digits.';
  }
}

async function resolveSos(): Promise<void> {
  if (!incidentId.value) return;
  try {
    await api(`/sos/${incidentId.value}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ pin: cancelPin.value })
    });
    status.value = 'Alert cancelled.';
    incidentId.value = '';
    cancelPin.value = '';
  } catch {
    error.value = 'The alert could not be cancelled. Check the PIN.';
  }
}

async function startShare(): Promise<void> {
  if (selected.value.length === 0) {
    error.value = t('dashboard.noContacts');
    return;
  }
  busy.value = true;
  try {
    const result = await api<{ share: Share; trackingUrl: string }>('/shares', {
      method: 'POST',
      body: JSON.stringify({
        contactIds: selected.value,
        consentAccepted: true,
        purpose: 'Live safety sharing',
        expiresInMinutes: 120
      })
    });
    shares.value.unshift(result.share);
    await updateShare(result.share.id);
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => void updateShare(result.share.id, position),
        () => {
          error.value = 'Live sharing is active, but location permission is unavailable.';
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
      );
    }
    status.value = `Sharing started. Secure link: ${result.trackingUrl}`;
  } catch {
    error.value = 'Live sharing could not be started.';
  } finally {
    busy.value = false;
  }
}

async function updateShare(id: string, provided?: GeolocationPosition): Promise<void> {
  const position = provided ?? (await getPosition({ maximumAge: 5_000 }));
  await api(`/shares/${id}/location`, {
    method: 'PUT',
    body: JSON.stringify({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString()
    })
  });
}

async function killSwitch(): Promise<void> {
  const result = await api<{ stoppedCount: number }>('/shares/kill-switch', { method: 'POST' });
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  status.value = `${result.stoppedCount} active share(s) stopped.`;
  await load();
}

async function findNearbyHelp(): Promise<void> {
  error.value = '';
  try {
    const position = await getPosition();
    const result = await api<{ points: HelpPoint[]; degraded: boolean; mapUrl: string }>(
      '/safety/nearby-help',
      {
        method: 'POST',
        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      }
    );
    helpPoints.value = result.points;
    helpMapUrl.value = result.mapUrl;
    helpDegraded.value = result.degraded;
  } catch {
    error.value = 'Nearby help could not be loaded. Call 999 in Bangladesh if danger is immediate.';
  }
}

onMounted(() => void load());
onUnmounted(() => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
});
</script>

<template>
  <div v-if="activeShares.length" class="sharing-indicator" role="status">
    <span
      ><strong>● {{ t('dashboard.sharing') }}</strong> — {{ t('dashboard.active') }} with
      {{ activeShares.map(audienceNames).filter(Boolean).join('; ') }}</span
    >
    <button class="button-danger" type="button" @click="killSwitch">{{ t('dashboard.stopAll') }}</button>
  </div>
  <section class="hero">
    <p class="eyebrow">Safety center</p>
    <h1>{{ t('dashboard.greeting') }}</h1>
    <p class="muted">{{ t('dashboard.help') }}</p>
  </section>
  <div class="grid two">
    <section class="card" aria-labelledby="sos-title">
      <h2 id="sos-title">Emergency SOS</h2>
      <button class="sos-button" type="button" :disabled="busy" @click="sendSos">
        {{ busy ? '…' : 'SOS' }}
      </button>
      <p class="muted">{{ t('dashboard.sosHint') }}</p>
      <p v-if="status" class="notice success" role="status">{{ status }}</p>
      <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
      <form v-if="incidentId" class="form-grid" @submit.prevent="resolveSos">
        <label
          >Cancel alert PIN<input v-model="cancelPin" inputmode="numeric" pattern="\d{4,8}" required
        /></label>
        <button class="button-secondary" type="submit">I'm safe / cancel alert</button>
      </form>
    </section>
    <section class="card">
      <h2>{{ t('dashboard.sharing') }}</h2>
      <p class="muted">{{ t('dashboard.permissions') }}</p>
      <fieldset v-if="confirmed.length" class="form-grid">
        <legend>Select who may view this share</legend>
        <label v-for="contact in confirmed" :key="contact.id">
          <span><input v-model="selected" type="checkbox" :value="contact.id" /> {{ contact.name }}</span>
        </label>
      </fieldset>
      <p v-else class="notice">
        <RouterLink :to="{ name: 'contacts' }">{{ t('dashboard.noContacts') }}</RouterLink>
      </p>
      <div class="actions" style="margin-top: 1rem">
        <button type="button" :disabled="busy || !confirmed.length" @click="startShare">
          {{ t('dashboard.start') }}
        </button>
        <button class="button-secondary" type="button" @click="showFakeCall = true">
          {{ t('dashboard.fakeCall') }}
        </button>
        <RouterLink class="button button-secondary" :to="{ name: 'journeys' }">Safe journey</RouterLink>
      </div>
    </section>
  </div>
  <section class="card" style="margin-top: 1rem">
    <h2>Safety and duress PINs</h2>
    <p class="muted">
      Your safety PIN stops an SOS. Your different duress PIN makes the screen appear cancelled while alerting
      silently continues. PINs are stored only as hardened hashes.
    </p>
    <form class="field-row" @submit.prevent="savePins">
      <label
        >Safety PIN<input
          v-model="safePin"
          type="password"
          inputmode="numeric"
          pattern="\d{4,8}"
          required
          autocomplete="new-password"
      /></label>
      <label
        >Duress PIN<input
          v-model="duressPin"
          type="password"
          inputmode="numeric"
          pattern="\d{4,8}"
          required
          autocomplete="new-password"
      /></label>
      <button type="submit">Save PINs</button>
    </form>
  </section>
  <div class="grid two" style="margin-top: 1rem">
    <section class="card">
      <h2>Nearby help</h2>
      <p class="muted">
        Only after you choose this action, your current coordinates are sent to OpenStreetMap's Overpass
        service to find police stations and hospitals. Guardify does not save this lookup.
      </p>
      <button class="button-secondary" type="button" @click="findNearbyHelp">
        Find police and hospitals
      </button>
      <p v-if="helpDegraded" class="notice">
        The directory is unavailable. Use the map link or call emergency services.
      </p>
      <ul v-if="helpPoints.length" class="list">
        <li v-for="point in helpPoints" :key="point.id">
          <strong>{{ point.name }}</strong>
          <p class="muted">{{ point.category }}</p>
        </li>
      </ul>
      <p v-if="helpMapUrl">
        <a :href="helpMapUrl" target="_blank" rel="noopener noreferrer">Open nearby area in OpenStreetMap</a>
      </p>
      <p>
        <strong>Bangladesh:</strong> <a href="tel:999">999</a> emergency · <a href="tel:109">109</a> women and
        children helpline
      </p>
    </section>
    <section class="card">
      <h2>Safety reminders</h2>
      <ul>
        <li>Tell a trusted person where you are going and when you expect to arrive.</li>
        <li>Use the sharing kill switch whenever consent changes or a link may be exposed.</li>
        <li>Do not rely on Guardify alone; call emergency services when it is safe to do so.</li>
      </ul>
    </section>
  </div>
  <div v-if="showFakeCall" class="fake-call" role="dialog" aria-modal="true" aria-label="Incoming call">
    <div>
      <div class="caller" aria-hidden="true">☎</div>
      <h1>Incoming call</h1>
      <p>Home</p>
      <button type="button" @click="showFakeCall = false">Answer</button>
    </div>
  </div>
</template>
