import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    safe_sos_load: { executor: 'constant-arrival-rate', rate: 2, timeUnit: '1s', duration: '30s', preAllocatedVUs: 2, maxVUs: 10 }
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500'] }
};

export default function () {
  const base = __ENV.BASE_URL;
  const cookie = __ENV.SESSION_COOKIE;
  if (!base || !cookie) throw new Error('Use a staging BASE_URL and disposable SESSION_COOKIE');
  const response = http.post(`${base}/api/v1/sos`, JSON.stringify({ location: { latitude: 23.81, longitude: 90.41, accuracy: 25 } }), {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `k6-${__VU}-${__ITER}-${Date.now()}`, Cookie: cookie }
  });
  check(response, { 'accepted or safely limited': (value) => [200, 202, 429].includes(value.status) });
  sleep(1);
}
