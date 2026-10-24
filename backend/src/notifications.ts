export type NotificationChannel = 'sms' | 'email' | 'push';

export interface NotificationMessage {
  eventId: string;
  channel: NotificationChannel;
  destination: string;
  template: 'contact_opt_in' | 'sos' | 'journey_overdue' | 'checkin_missed' | 'sharing_reminder';
  locale: 'en' | 'bn';
  variables: Record<string, string>;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  status: 'sent' | 'failed' | 'disabled';
  providerMessageId?: string;
  errorCode?: string;
}

export interface NotificationAdapter {
  readonly channel: NotificationChannel;
  send(message: NotificationMessage): Promise<DeliveryResult>;
}

export class DisabledAdapter implements NotificationAdapter {
  constructor(public readonly channel: NotificationChannel) {}

  async send(_message: NotificationMessage): Promise<DeliveryResult> {
    void _message;
    return { channel: this.channel, status: 'disabled', errorCode: 'PROVIDER_NOT_CONFIGURED' };
  }
}

function messageText(message: NotificationMessage): { subject: string; text: string } {
  const link = message.variables.trackingUrl ?? message.variables.optInUrl ?? '';
  switch (message.template) {
    case 'contact_opt_in':
      return {
        subject: 'Guardify contact invitation',
        text: `A Guardify user invited you to receive safety alerts. Confirm only if you know them: ${message.variables.optInUrl ?? ''}\nYou can stop alerts at any time: ${message.variables.optOutUrl ?? ''}`
      };
    case 'journey_overdue':
      return {
        subject: 'Guardify journey overdue',
        text: `A Guardify safety journey is overdue. Open the private safety link: ${link}`
      };
    case 'checkin_missed':
      return {
        subject: 'Guardify check-in missed',
        text: `A Guardify safety check-in was missed. Open the private safety link: ${link}`
      };
    case 'sharing_reminder':
      return {
        subject: 'Guardify sharing reminder',
        text: 'Guardify live-location sharing remains active. Open Guardify to review or stop it.'
      };
    case 'sos':
      return {
        subject: 'Urgent Guardify SOS',
        text: link
          ? `A trusted contact triggered an SOS. Open the private live-safety link: ${link}. If danger is immediate, contact local emergency services.`
          : 'A Guardify SOS remains unacknowledged. Review the private alert you previously received. If danger is immediate, contact local emergency services.'
      };
  }
}

export class TwilioSmsAdapter implements NotificationAdapter {
  readonly channel = 'sms' as const;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string
  ) {}

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const body = new URLSearchParams({
      To: message.destination,
      From: this.from,
      Body: messageText(message).text
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body,
        signal: AbortSignal.timeout(10_000)
      }
    );
    if (!response.ok) throw new Error('SMS provider rejected the message');
    const result = (await response.json()) as { sid?: string };
    return {
      channel: this.channel,
      status: 'sent',
      ...(result.sid ? { providerMessageId: result.sid } : {})
    };
  }
}

export class ResendEmailAdapter implements NotificationAdapter {
  readonly channel = 'email' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    const content = messageText(message);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [message.destination],
        subject: content.subject,
        text: content.text
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error('Email provider rejected the message');
    const result = (await response.json()) as { id?: string };
    return { channel: this.channel, status: 'sent', ...(result.id ? { providerMessageId: result.id } : {}) };
  }
}

export class NotificationDispatcher {
  private readonly adapters: Map<NotificationChannel, NotificationAdapter>;

  constructor(adapters: NotificationAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  async deliver(messages: NotificationMessage[]): Promise<DeliveryResult[]> {
    return Promise.all(
      messages.map(async (message) => {
        const adapter = this.adapters.get(message.channel);
        if (!adapter)
          return { channel: message.channel, status: 'disabled', errorCode: 'PROVIDER_NOT_CONFIGURED' };
        try {
          return await adapter.send(message);
        } catch {
          return { channel: message.channel, status: 'failed', errorCode: 'PROVIDER_FAILURE' };
        }
      })
    );
  }
}

export function createDefaultDispatcher(config?: AppConfig): NotificationDispatcher {
  const sms =
    config?.smsProvider === 'twilio' && config.smsAccountSid && config.smsApiKey && config.smsFromNumber
      ? new TwilioSmsAdapter(config.smsAccountSid, config.smsApiKey, config.smsFromNumber)
      : new DisabledAdapter('sms');
  const email =
    config?.emailProvider === 'resend' && config.emailApiKey && config.emailFrom
      ? new ResendEmailAdapter(config.emailApiKey, config.emailFrom)
      : new DisabledAdapter('email');
  return new NotificationDispatcher([sms, email, new DisabledAdapter('push')]);
}
import type { AppConfig } from './config.js';
