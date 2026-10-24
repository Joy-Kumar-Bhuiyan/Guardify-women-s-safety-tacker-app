import { createApp } from 'vue';
import { registerSW } from 'virtual:pwa-register';
import App from './App.vue';
import { i18n } from './lib/i18n';
import { router } from './router';
import './styles.css';

registerSW({ immediate: true });
createApp(App).use(router).use(i18n).mount('#app');
