<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { login, resetPassword, signup } from '../lib/auth';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const mode = ref<'login' | 'signup' | 'reset'>('login');
const name = ref('');
const email = ref('');
const password = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');

async function submit(): Promise<void> {
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    if (mode.value === 'signup') {
      if (password.value.length < 12) throw new Error('PASSWORD_POLICY');
      await signup(name.value.trim(), email.value.trim(), password.value);
      message.value = t('auth.verified');
      mode.value = 'login';
    } else if (mode.value === 'reset') {
      await resetPassword(email.value.trim());
      message.value = 'If the account exists, password reset instructions were sent.';
      mode.value = 'login';
    } else {
      await login(email.value.trim(), password.value);
      const returnTo = typeof route.query.returnTo === 'string' ? route.query.returnTo : '/dashboard';
      await router.replace(returnTo);
    }
  } catch {
    error.value =
      mode.value === 'signup' && password.value.length < 12
        ? 'Use at least 12 characters for your password.'
        : t('auth.generic');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth-shell">
    <section class="auth-panel">
      <p class="eyebrow">Guardify</p>
      <h1>{{ t('auth.title') }}</h1>
      <p class="muted">{{ t('auth.subtitle') }}</p>
      <p class="notice">
        <strong>Bangladesh:</strong> Police, fire, ambulance — <a href="tel:999">999</a>. Women and children
        helpline — <a href="tel:109">109</a>.
      </p>
    </section>
    <section class="card" aria-labelledby="auth-heading">
      <h2 id="auth-heading">
        {{ mode === 'signup' ? t('auth.signup') : mode === 'reset' ? t('auth.reset') : t('auth.login') }}
      </h2>
      <form class="form-grid" @submit.prevent="submit">
        <label v-if="mode === 'signup'"
          >{{ t('auth.name') }}<input v-model="name" required maxlength="80" autocomplete="name"
        /></label>
        <label
          >{{ t('auth.email') }}<input v-model="email" type="email" required autocomplete="email"
        /></label>
        <label v-if="mode !== 'reset'"
          >{{ t('auth.password')
          }}<input
            v-model="password"
            type="password"
            required
            :minlength="mode === 'signup' ? 12 : 1"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
        /></label>
        <p v-if="error" class="notice danger" role="alert">{{ error }}</p>
        <p v-if="message" class="notice success" role="status">{{ message }}</p>
        <button type="submit" :disabled="busy">
          {{
            busy
              ? t('common.loading')
              : mode === 'signup'
                ? t('auth.signup')
                : mode === 'reset'
                  ? t('auth.reset')
                  : t('auth.login')
          }}
        </button>
      </form>
      <div class="actions" style="margin-top: 1rem">
        <button class="text-button" type="button" @click="mode = mode === 'signup' ? 'login' : 'signup'">
          {{ mode === 'signup' ? t('auth.login') : t('auth.signup') }}
        </button>
        <button class="text-button" type="button" @click="mode = mode === 'reset' ? 'login' : 'reset'">
          {{ mode === 'reset' ? t('auth.login') : t('auth.reset') }}
        </button>
      </div>
      <p class="muted" style="margin-top: 1rem">
        <RouterLink to="/privacy">Privacy</RouterLink> · <RouterLink to="/terms">Terms</RouterLink>
      </p>
    </section>
  </div>
</template>
