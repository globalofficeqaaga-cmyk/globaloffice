import type { SiteSettings } from '../types';
import { APP_IMAGES } from './assets';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brandName: 'Global Pathways',
  logoUrl: '',
  heroKicker: 'Overseas Recruitment · Live Candidate Desk',
  heroTitle: 'Track your visa, medical, and payment progress by phone number.',
  heroSubtitle:
    'Enter your registered phone number below to check your current stage, medical report, interview schedule, payment balance, and assigned coordinator contact.',
  trackerTitle: 'Client Phone Number',
  trackerPlaceholder: 'e.g. 01712345678',
  trackerButtonLabel: 'See Update',
  loginButtonLabel: 'Login',
  showTracker: true,
  showPosterSlider: true,
  showContactSection: true,
  showLoginButton: true,
  posterAutoSlideMs: 4500,
  posters: [
    {
      id: 'gulf-drive',
      kicker: '01 / 04 · Saudi Arabia, UAE & Qatar',
      title: 'Direct Gulf Employment & Visa Processing Drive',
      subtitle:
        'Verified employer demand letters for construction, hospitality, facility maintenance, and industrial trades with transparent contract terms.',
      actionLabel: 'Check Your File',
      actionHref: '#track-status',
      imageUrl: APP_IMAGES.posterGulfEmploymentDrive,
      alt: 'Overseas recruitment agency poster highlighting Saudi Arabia, UAE, and Qatar employment intake',
    },
    {
      id: 'trade-center',
      kicker: '02 / 04 · Technical Trade & Delegate Assessment',
      title: 'Certified Trade Testing & Foreign Employer Interviews',
      subtitle:
        'Welding, electrical, HVAC, plumbing, and mechanical candidates scheduled directly with foreign employer delegates in Dhaka.',
      actionLabel: 'Call Recruitment Desk',
      actionHref: 'tel:+8801700000000',
      imageUrl: APP_IMAGES.posterTechnicalTradeCenter,
      alt: 'Engineers and skilled trade technicians completing practical assessment at a technical center',
    },
    {
      id: 'medical-clearance',
      kicker: '03 / 04 · GAMCA & QVC Approved Labs',
      title: 'Tracked Medical Screening & Receipt Verification',
      subtitle:
        'Diagnostic center location, test date, fit or pending lab result, and itemized medical fee payment synced straight to your file.',
      actionLabel: 'See Medical Status',
      actionHref: '#track-status',
      imageUrl: APP_IMAGES.serviceMedicalCenter,
      alt: 'Approved international diagnostic medical screening center lobby',
    },
    {
      id: 'airport-departure',
      kicker: '04 / 04 · Visa Stamping & Flight Readiness',
      title: 'Passport Intake to Boarding Pass Transparency',
      subtitle:
        'Pre-departure briefing, BMET clearance, ticket schedule, and final settlement ledger accessible 24/7 by your phone number.',
      actionLabel: 'Contact Office Desk',
      actionHref: '#contact',
      imageUrl: APP_IMAGES.posterVisaAirportDeparture,
      alt: 'Processed worker holding passport and travel documents at an international airport departure hall',
    },
  ],
  contactSectionTitle: 'Direct Hotline & WhatsApp Desk',
  officeAddress: 'House 42, Road 11, Banani, Dhaka 1213',
  officeHours: 'Sat–Thu 9:30 AM – 6:30 PM',
  contacts: [
    {
      id: 'cnt_hotline',
      label: 'Main Candidate Hotline',
      value: '+880 1700-000000',
      type: 'phone',
      actionLabel: 'Call',
    },
    {
      id: 'cnt_trade',
      label: 'Trade & Visa Inquiry',
      value: '+880 1711-223344',
      type: 'phone',
      actionLabel: 'Call',
    },
    {
      id: 'cnt_wa',
      label: 'Official WhatsApp',
      value: '+880 1700-000000',
      type: 'whatsapp',
      actionLabel: 'Chat',
    },
  ],
  footerHotline: '+880 1700-000000',
};

export function normalizeSiteSettings(raw: Partial<SiteSettings> | null | undefined): SiteSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_SITE_SETTINGS;
  }
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...raw,
    posters: Array.isArray(raw.posters) ? raw.posters : DEFAULT_SITE_SETTINGS.posters,
    contacts: Array.isArray(raw.contacts) ? raw.contacts : DEFAULT_SITE_SETTINGS.contacts,
    showTracker: raw.showTracker ?? DEFAULT_SITE_SETTINGS.showTracker,
    showPosterSlider: raw.showPosterSlider ?? DEFAULT_SITE_SETTINGS.showPosterSlider,
    showContactSection: raw.showContactSection ?? DEFAULT_SITE_SETTINGS.showContactSection,
    showLoginButton: raw.showLoginButton ?? DEFAULT_SITE_SETTINGS.showLoginButton,
    posterAutoSlideMs:
      typeof raw.posterAutoSlideMs === 'number' && raw.posterAutoSlideMs >= 1500
        ? raw.posterAutoSlideMs
        : DEFAULT_SITE_SETTINGS.posterAutoSlideMs,
  };
}
