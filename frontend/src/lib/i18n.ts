import { createI18n } from 'vue-i18n';

const messages = {
  en: {
    common: {
      skip: 'Skip to main content',
      quickExit: 'Quick exit',
      retry: 'Try again',
      offline: 'You are offline. Queued SOS requests will retry when connectivity returns.',
      save: 'Save',
      cancel: 'Cancel',
      loading: 'Loading…',
      delete: 'Delete',
      stop: 'Stop',
      back: 'Back'
    },
    nav: { label: 'Primary navigation', home: 'Safety', contacts: 'Contacts', history: 'History' },
    auth: {
      title: 'Your safety, on your terms.',
      subtitle: 'Guardify shares location only when you choose. It cannot replace emergency services.',
      email: 'Email',
      password: 'Password',
      name: 'Full name',
      login: 'Sign in',
      signup: 'Create account',
      reset: 'Reset password',
      logout: 'Sign out',
      verified: 'Check your email and verify your account before signing in.',
      generic: 'Sign-in could not be completed. Check your details and verification status.'
    },
    dashboard: {
      greeting: 'Ready when you need it',
      help: 'If danger is immediate, call Bangladesh emergency services at 999.',
      sos: 'Send SOS now',
      sosHint:
        'Shares your current location with confirmed contacts. If offline, Guardify queues the request but cannot guarantee delivery.',
      sent: 'SOS accepted',
      noContacts: 'Add and confirm an emergency contact first.',
      sharing: 'Live sharing',
      start: 'Start sharing',
      stopAll: 'Stop all sharing',
      active: 'Location sharing is active. People with your link can see your latest update.',
      fakeCall: 'Start fake call',
      permissions: 'Location is used only after you press SOS or start a share.'
    },
    contacts: {
      title: 'Emergency contacts',
      intro: 'Contacts must opt in before receiving alerts. They can opt out at any time.',
      name: 'Contact name',
      phone: 'Phone (international format)',
      email: 'Email',
      channels: 'Alert channels',
      add: 'Add contact',
      pending: 'Waiting for opt-in',
      confirmed: 'Confirmed',
      empty: 'No emergency contacts yet.',
      link: 'Development opt-in link'
    },
    history: {
      title: 'Incident history',
      empty: 'No safety incidents recorded.',
      export: 'Export my data',
      erase: 'Delete my account and data',
      confirmErase: 'Permanently delete your account and safety data? This cannot be undone.'
    },
    journey: {
      title: 'Safe journey and check-ins',
      destination: 'Destination',
      arrival: 'Expected arrival',
      start: 'Start journey',
      schedule: 'Schedule check-in',
      prompt: 'Check-in time',
      active: 'Active journeys',
      checkins: 'Scheduled check-ins',
      arrived: 'I arrived safely',
      safe: 'I am safe'
    },
    tracking: {
      title: 'Guardify live safety share',
      expires: 'Sharing ends',
      updated: 'Last update',
      accuracy: 'Accuracy',
      battery: 'Battery',
      acknowledge: 'Acknowledge',
      acknowledged: 'The person sharing will know this link was opened.',
      inactive: 'This link is inactive, expired, or revoked.'
    },
    errors: {
      title: 'Something went wrong',
      safe: 'No raw error details were shown. If you need urgent help, call local emergency services directly.'
    }
  },
  bn: {
    common: {
      skip: 'মূল অংশে যান',
      quickExit: 'দ্রুত বের হন',
      retry: 'আবার চেষ্টা করুন',
      offline: 'আপনি অফলাইনে আছেন। সংযোগ ফিরলে অপেক্ষমাণ SOS আবার পাঠানো হবে।',
      save: 'সংরক্ষণ',
      cancel: 'বাতিল',
      loading: 'লোড হচ্ছে…',
      delete: 'মুছুন',
      stop: 'বন্ধ করুন',
      back: 'ফিরুন'
    },
    nav: { label: 'প্রধান নেভিগেশন', home: 'নিরাপত্তা', contacts: 'যোগাযোগ', history: 'ইতিহাস' },
    auth: {
      title: 'আপনার নিরাপত্তা, আপনার নিয়ন্ত্রণে।',
      subtitle: 'আপনি চাইলে তবেই Guardify অবস্থান শেয়ার করে। এটি জরুরি সেবার বিকল্প নয়।',
      email: 'ইমেইল',
      password: 'পাসওয়ার্ড',
      name: 'পূর্ণ নাম',
      login: 'সাইন ইন',
      signup: 'অ্যাকাউন্ট তৈরি',
      reset: 'পাসওয়ার্ড রিসেট',
      logout: 'সাইন আউট',
      verified: 'ইমেইল যাচাই করে তারপর সাইন ইন করুন।',
      generic: 'সাইন ইন সম্পন্ন হয়নি। তথ্য ও যাচাই অবস্থা দেখুন।'
    },
    dashboard: {
      greeting: 'প্রয়োজনে আমরা প্রস্তুত',
      help: 'তাৎক্ষণিক বিপদে বাংলাদেশ জরুরি সেবা ৯৯৯ নম্বরে কল করুন।',
      sos: 'এখনই SOS পাঠান',
      sosHint:
        'নিশ্চিত যোগাযোগের কাছে বর্তমান অবস্থান পাঠায়। অফলাইনে অনুরোধ অপেক্ষমাণ থাকে, ডেলিভারি নিশ্চিত নয়।',
      sent: 'SOS গ্রহণ করা হয়েছে',
      noContacts: 'আগে একটি জরুরি যোগাযোগ যোগ করে নিশ্চিত করুন।',
      sharing: 'লাইভ অবস্থান',
      start: 'শেয়ার শুরু',
      stopAll: 'সব শেয়ার বন্ধ',
      active: 'অবস্থান শেয়ার চালু আছে। লিংক থাকা ব্যক্তিরা সর্বশেষ অবস্থান দেখতে পারেন।',
      fakeCall: 'নকল কল শুরু',
      permissions: 'SOS চাপলে বা শেয়ার শুরু করলেই কেবল অবস্থান ব্যবহার হবে।'
    },
    contacts: {
      title: 'জরুরি যোগাযোগ',
      intro: 'সতর্কতা পাওয়ার আগে যোগাযোগের সম্মতি আবশ্যক। যেকোনো সময় তারা বের হতে পারেন।',
      name: 'নাম',
      phone: 'ফোন (আন্তর্জাতিক ফরম্যাট)',
      email: 'ইমেইল',
      channels: 'সতর্কতা মাধ্যম',
      add: 'যোগ করুন',
      pending: 'সম্মতির অপেক্ষায়',
      confirmed: 'নিশ্চিত',
      empty: 'এখনও কোনো জরুরি যোগাযোগ নেই।',
      link: 'ডেভেলপমেন্ট সম্মতি লিংক'
    },
    history: {
      title: 'ঘটনার ইতিহাস',
      empty: 'কোনো নিরাপত্তা ঘটনা নেই।',
      export: 'আমার তথ্য ডাউনলোড',
      erase: 'অ্যাকাউন্ট ও তথ্য মুছুন',
      confirmErase: 'অ্যাকাউন্ট ও নিরাপত্তা তথ্য স্থায়ীভাবে মুছবেন? এটি ফেরানো যাবে না।'
    },
    journey: {
      title: 'নিরাপদ যাত্রা ও চেক-ইন',
      destination: 'গন্তব্য',
      arrival: 'সম্ভাব্য পৌঁছানোর সময়',
      start: 'যাত্রা শুরু',
      schedule: 'চেক-ইন ঠিক করুন',
      prompt: 'চেক-ইন সময়',
      active: 'চলমান যাত্রা',
      checkins: 'নির্ধারিত চেক-ইন',
      arrived: 'নিরাপদে পৌঁছেছি',
      safe: 'আমি নিরাপদ'
    },
    tracking: {
      title: 'Guardify লাইভ নিরাপত্তা শেয়ার',
      expires: 'শেয়ার শেষ হবে',
      updated: 'শেষ আপডেট',
      accuracy: 'নির্ভুলতা',
      battery: 'ব্যাটারি',
      acknowledge: 'দেখেছি জানান',
      acknowledged: 'শেয়ারকারী জানতে পারবেন এই লিংক খোলা হয়েছে।',
      inactive: 'এই লিংক বন্ধ, মেয়াদোত্তীর্ণ বা প্রত্যাহার করা হয়েছে।'
    },
    errors: {
      title: 'কিছু সমস্যা হয়েছে',
      safe: 'কাঁচা ত্রুটি দেখানো হয়নি। জরুরি প্রয়োজনে সরাসরি স্থানীয় জরুরি সেবায় কল করুন।'
    }
  }
};

export const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages });
