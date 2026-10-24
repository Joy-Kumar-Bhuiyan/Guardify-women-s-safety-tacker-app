<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../lib/api';

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  channels: string[];
  confirmedAt: string | null;
}
const { t } = useI18n();
const contacts = ref<Contact[]>([]);
const name = ref('');
const phone = ref('');
const email = ref('');
const channels = ref<string[]>(['sms', 'email']);
const busy = ref(false);
const error = ref('');
const optInLink = ref('');

async function load(): Promise<void> {
  try {
    contacts.value = await api<Contact[]>('/contacts');
  } catch {
    error.value = 'Contacts could not be loaded.';
  }
}

async function add(): Promise<void> {
  busy.value = true;
  error.value = '';
  optInLink.value = '';
  try {
    const result = await api<{ contact: Contact; optInLink?: string }>('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        name: name.value,
        ...(phone.value ? { phone: phone.value } : {}),
        ...(email.value ? { email: email.value } : {}),
        channels: channels.value
      })
    });
    contacts.value.unshift(result.contact);
    optInLink.value = result.optInLink ?? '';
    name.value = '';
    phone.value = '';
    email.value = '';
  } catch {
    error.value = 'Contact could not be added. Check the phone/email and channel choices.';
  } finally {
    busy.value = false;
  }
}

async function remove(id: string): Promise<void> {
  await api(`/contacts/${id}`, { method: 'DELETE' });
  contacts.value = contacts.value.filter((contact) => contact.id !== id);
}

onMounted(() => void load());
</script>

<template>
  <section class="hero">
    <p class="eyebrow">Consent first</p>
    <h1>{{ t('contacts.title') }}</h1>
    <p class="muted">{{ t('contacts.intro') }}</p>
  </section>
  <div class="grid two">
    <section class="card">
      <h2>{{ t('contacts.add') }}</h2>
      <form class="form-grid" @submit.prevent="add">
        <label>{{ t('contacts.name') }}<input v-model="name" required maxlength="80" /></label>
        <label>{{ t('contacts.phone') }}<input v-model="phone" type="tel" placeholder="+8801…" /></label>
        <label>{{ t('contacts.email') }}<input v-model="email" type="email" /></label>
        <fieldset>
          <legend>{{ t('contacts.channels') }}</legend>
          <label
            ><span><input v-model="channels" type="checkbox" value="sms" /> SMS</span></label
          ><label
            ><span><input v-model="channels" type="checkbox" value="email" /> Email</span></label
          >
        </fieldset>
        <button :disabled="busy || channels.length === 0">
          {{ busy ? t('common.loading') : t('contacts.add') }}
        </button>
      </form>
      <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
      <p v-if="optInLink" class="notice">
        <strong>{{ t('contacts.link') }}:</strong> <a :href="optInLink">{{ optInLink }}</a>
      </p>
    </section>
    <section class="card">
      <h2>{{ t('contacts.title') }}</h2>
      <p v-if="contacts.length === 0" class="muted">{{ t('contacts.empty') }}</p>
      <ul v-else class="list">
        <li v-for="contact in contacts" :key="contact.id">
          <div class="actions" style="justify-content: space-between">
            <strong>{{ contact.name }}</strong
            ><span class="pill">{{
              contact.confirmedAt ? t('contacts.confirmed') : t('contacts.pending')
            }}</span>
          </div>
          <p class="muted">{{ contact.phone || contact.email }} · {{ contact.channels.join(', ') }}</p>
          <button class="button-secondary" type="button" @click="remove(contact.id)">
            {{ t('common.delete') }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
