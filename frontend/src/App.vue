<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { authState, logout } from './lib/auth';

const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();
const crashed = ref(false);
const online = ref(true);
const isPublic = computed(() => Boolean(route.meta.public));

onErrorCaptured(() => {
  crashed.value = true;
  return false;
});

async function signOut(): Promise<void> {
  await logout();
  await router.replace({ name: 'login' });
}

function quickExit(): void {
  window.location.replace('https://www.google.com/search?q=weather');
}

function reload(): void {
  window.location.reload();
}

function updateOnline(): void {
  online.value = navigator.onLine;
}

onMounted(() => {
  updateOnline();
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline);
  window.removeEventListener('offline', updateOnline);
});
</script>

<template>
  <a class="skip-link" href="#main">{{ t('common.skip') }}</a>
  <header v-if="!isPublic" class="app-header">
    <RouterLink
      class="brand"
      :to="authState.user ? { name: 'dashboard' } : { name: 'login' }"
      aria-label="Guardify home"
    >
      <span aria-hidden="true">◉</span> Guardify
    </RouterLink>
    <nav v-if="authState.user" :aria-label="t('nav.label')">
      <RouterLink :to="{ name: 'dashboard' }">{{ t('nav.home') }}</RouterLink>
      <RouterLink :to="{ name: 'contacts' }">{{ t('nav.contacts') }}</RouterLink>
      <RouterLink :to="{ name: 'history' }">{{ t('nav.history') }}</RouterLink>
    </nav>
    <div class="header-actions">
      <button class="text-button" type="button" @click="locale = locale === 'en' ? 'bn' : 'en'">
        {{ locale === 'en' ? 'বাংলা' : 'English' }}
      </button>
      <button v-if="authState.user" class="text-button" type="button" @click="signOut">
        {{ t('auth.logout') }}
      </button>
    </div>
  </header>

  <button v-if="authState.user && !isPublic" class="quick-exit" type="button" @click="quickExit">
    {{ t('common.quickExit') }}
  </button>

  <main id="main" :class="{ 'public-layout': isPublic }">
    <section v-if="crashed" class="card status-card" role="alert">
      <h1>{{ t('errors.title') }}</h1>
      <p>{{ t('errors.safe') }}</p>
      <button type="button" @click="reload">{{ t('common.retry') }}</button>
    </section>
    <RouterView v-else />
  </main>

  <div v-if="!online" class="offline-banner" role="status" aria-live="polite">
    {{ t('common.offline') }}
  </div>
</template>
