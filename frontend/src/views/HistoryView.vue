<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { authState } from '../lib/auth';

interface Incident {
  id: string;
  type: string;
  status: string;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
  contactedCount: number;
}
const { t } = useI18n();
const router = useRouter();
const incidents = ref<Incident[]>([]);
const error = ref('');

async function load(): Promise<void> {
  try {
    incidents.value = await api<Incident[]>('/incidents?limit=100');
  } catch {
    error.value = 'History could not be loaded.';
  }
}

async function remove(id: string): Promise<void> {
  await api(`/incidents/${id}`, { method: 'DELETE' });
  incidents.value = incidents.value.filter((incident) => incident.id !== id);
}

async function exportData(): Promise<void> {
  const payload = await api<Record<string, unknown>>('/privacy/export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'guardify-export.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function erase(): Promise<void> {
  if (!window.confirm(t('history.confirmErase'))) return;
  await api('/privacy/account', { method: 'DELETE' });
  authState.user = null;
  await router.replace({ name: 'login' });
}

onMounted(() => void load());
</script>

<template>
  <section class="hero">
    <p class="eyebrow">Private by design</p>
    <h1>{{ t('history.title') }}</h1>
    <p class="muted">
      Precise coordinates are not displayed here and are automatically retained only for the configured
      period.
    </p>
  </section>
  <section class="card">
    <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
    <p v-else-if="incidents.length === 0" class="muted">{{ t('history.empty') }}</p>
    <ul v-else class="list">
      <li v-for="incident in incidents" :key="incident.id">
        <div class="actions" style="justify-content: space-between">
          <strong>{{ incident.type.toUpperCase() }}</strong
          ><span class="pill">{{ incident.status }}</span>
        </div>
        <p class="muted">
          {{ new Date(incident.createdAt).toLocaleString() }} · {{ incident.contactedCount }} contact(s)
        </p>
        <button class="button-secondary" type="button" @click="remove(incident.id)">
          {{ t('common.delete') }}
        </button>
      </li>
    </ul>
  </section>
  <section class="card" style="margin-top: 1rem">
    <h2>Your privacy controls</h2>
    <div class="actions">
      <button class="button-secondary" type="button" @click="exportData">{{ t('history.export') }}</button>
      <button class="button-danger" type="button" @click="erase">{{ t('history.erase') }}</button>
    </div>
  </section>
</template>
