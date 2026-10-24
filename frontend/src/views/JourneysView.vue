<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, getPosition } from '../lib/api';

interface Contact {
  id: string;
  name: string;
  confirmedAt: string | null;
}
interface Journey {
  id: string;
  destination: string;
  expectedArrivalAt: string;
  status: string;
}
interface Checkin {
  id: string;
  promptAt: string;
  note: string | null;
  status: string;
}
const { t } = useI18n();
const contacts = ref<Contact[]>([]);
const contactIds = ref<string[]>([]);
const journeys = ref<Journey[]>([]);
const checkins = ref<Checkin[]>([]);
const destination = ref('');
const expectedArrivalAt = ref('');
const promptAt = ref('');
const note = ref('');
const error = ref('');

async function load(): Promise<void> {
  try {
    [contacts.value, journeys.value, checkins.value] = await Promise.all([
      api<Contact[]>('/contacts'),
      api<Journey[]>('/journeys'),
      api<Checkin[]>('/checkins')
    ]);
    contactIds.value = contacts.value.filter((contact) => contact.confirmedAt).map((contact) => contact.id);
  } catch {
    error.value = 'Journeys and check-ins could not be loaded.';
  }
}

async function startJourney(): Promise<void> {
  try {
    let startLocation: { latitude: number; longitude: number; accuracy: number } | undefined;
    try {
      const position = await getPosition();
      startLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
    } catch {
      /* A journey may start without location; overdue escalation still works. */
    }
    const journey = await api<Journey>('/journeys', {
      method: 'POST',
      body: JSON.stringify({
        destination: destination.value,
        expectedArrivalAt: new Date(expectedArrivalAt.value).toISOString(),
        graceMinutes: 15,
        contactIds: contactIds.value,
        ...(startLocation ? { startLocation } : {})
      })
    });
    journeys.value.unshift(journey);
    destination.value = '';
    expectedArrivalAt.value = '';
  } catch {
    error.value = 'Journey could not be started. Select confirmed contacts and a future arrival time.';
  }
}

async function arrive(id: string): Promise<void> {
  const updated = await api<Journey>(`/journeys/${id}/arrive`, { method: 'POST' });
  journeys.value = journeys.value.map((journey) => (journey.id === id ? updated : journey));
}

async function scheduleCheckin(): Promise<void> {
  try {
    const checkin = await api<Checkin>('/checkins', {
      method: 'POST',
      body: JSON.stringify({
        promptAt: new Date(promptAt.value).toISOString(),
        graceMinutes: 10,
        contactIds: contactIds.value,
        ...(note.value ? { note: note.value } : {})
      })
    });
    checkins.value.unshift(checkin);
    promptAt.value = '';
    note.value = '';
  } catch {
    error.value = 'Check-in could not be scheduled.';
  }
}

async function complete(id: string): Promise<void> {
  const updated = await api<Checkin>(`/checkins/${id}/complete`, { method: 'POST' });
  checkins.value = checkins.value.map((checkin) => (checkin.id === id ? updated : checkin));
}

onMounted(() => void load());
</script>

<template>
  <section class="hero">
    <p class="eyebrow">Plan ahead</p>
    <h1>{{ t('journey.title') }}</h1>
    <p class="muted">
      If a journey or check-in is missed after its grace period, confirmed contacts are marked for escalation.
    </p>
  </section>
  <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
  <div class="grid two">
    <section class="card">
      <h2>{{ t('journey.start') }}</h2>
      <form class="form-grid" @submit.prevent="startJourney">
        <label>{{ t('journey.destination') }}<input v-model="destination" required maxlength="200" /></label>
        <label
          >{{ t('journey.arrival') }}<input v-model="expectedArrivalAt" type="datetime-local" required
        /></label>
        <button :disabled="contactIds.length === 0">{{ t('journey.start') }}</button>
      </form>
      <h3 style="margin-top: 1.5rem">{{ t('journey.active') }}</h3>
      <ul class="list">
        <li v-for="journey in journeys" :key="journey.id">
          <strong>{{ journey.destination }}</strong>
          <p class="muted">
            {{ new Date(journey.expectedArrivalAt).toLocaleString() }} · {{ journey.status }}
          </p>
          <button v-if="journey.status === 'active'" class="button-secondary" @click="arrive(journey.id)">
            {{ t('journey.arrived') }}
          </button>
        </li>
      </ul>
    </section>
    <section class="card">
      <h2>{{ t('journey.schedule') }}</h2>
      <form class="form-grid" @submit.prevent="scheduleCheckin">
        <label>{{ t('journey.prompt') }}<input v-model="promptAt" type="datetime-local" required /></label>
        <label>Note (optional)<input v-model="note" maxlength="160" /></label>
        <button :disabled="contactIds.length === 0">{{ t('journey.schedule') }}</button>
      </form>
      <h3 style="margin-top: 1.5rem">{{ t('journey.checkins') }}</h3>
      <ul class="list">
        <li v-for="checkin in checkins" :key="checkin.id">
          <strong>{{ new Date(checkin.promptAt).toLocaleString() }}</strong>
          <p class="muted">{{ checkin.note }} · {{ checkin.status }}</p>
          <button
            v-if="checkin.status === 'scheduled'"
            class="button-secondary"
            @click="complete(checkin.id)"
          >
            {{ t('journey.safe') }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
