import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import ContactConfirmView from '../src/views/ContactConfirmView.vue';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({ api: vi.fn() }));

describe('contact opt-in screen', () => {
  it('shows a safe confirmation after the one-time token is accepted', async () => {
    vi.mocked(api).mockResolvedValue({ confirmed: true });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/contact/confirm/:token', component: ContactConfirmView }]
    });
    await router.push('/contact/confirm/abcdefghijklmnopqrstuvwxyz123456');
    await router.isReady();
    const wrapper = mount(ContactConfirmView, { global: { plugins: [router] } });
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain("You're confirmed");
    expect(api).toHaveBeenCalledWith('/public/contacts/confirm/abcdefghijklmnopqrstuvwxyz123456', {
      method: 'POST'
    });
  });

  it('does not expose raw errors when confirmation fails', async () => {
    vi.mocked(api).mockRejectedValue(new Error('provider details'));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/contact/confirm/:token', component: ContactConfirmView }]
    });
    await router.push('/contact/confirm/abcdefghijklmnopqrstuvwxyz123456');
    await router.isReady();
    const wrapper = mount(ContactConfirmView, { global: { plugins: [router] } });
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Link unavailable');
    expect(wrapper.text()).not.toContain('provider details');
  });
});
