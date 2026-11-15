import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  MessageCircle,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  api,
  buildWhatsAppUrl,
  formatDateOnly,
  formatDateTime,
} from '../lib/api';
import type { ClientLookupResponse, SiteSettings } from '../types';
import { BrandLogo } from './BrandLogo';
import { StaffContactCard } from './StaffContactCard';

interface LandingPageProps {
  siteSettings: SiteSettings;
}

function createVerificationChallenge() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 1;
  return { a, b, answer: a + b };
}

function normalizePhoneInput(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length >= 13) {
    return digits.slice(2);
  }
  return digits;
}

export function LandingPage({ siteSettings }: LandingPageProps) {
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState(() => createVerificationChallenge());
  const [challengeInput, setChallengeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ClientLookupResponse | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const posters = siteSettings.posters;
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const safeSlideIndex = posters.length > 0 ? activeSlide % posters.length : 0;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setPrefersReducedMotion(mq.matches);
    syncPreference();
    mq.addEventListener('change', syncPreference);
    return () => mq.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    if (posters.length <= 1 || isPaused || prefersReducedMotion) return;
    const delay = Math.max(1500, siteSettings.posterAutoSlideMs || 4500);
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % posters.length);
    }, delay);
    return () => window.clearInterval(timer);
  }, [posters.length, isPaused, prefersReducedMotion, siteSettings.posterAutoSlideMs]);

  function handlePrevSlide() {
    if (posters.length === 0) return;
    setActiveSlide((prev) => (prev - 1 + posters.length) % posters.length);
  }

  function handleNextSlide() {
    if (posters.length === 0) return;
    setActiveSlide((prev) => (prev + 1) % posters.length);
  }

  async function runLookup(targetPhone: string) {
    const clean = targetPhone.trim();
    if (!clean) {
      setError('Please enter your complete registered phone number.');
      return;
    }

    const normalized = normalizePhoneInput(clean);
    if (normalized.length < 10 || normalized.length > 15) {
      setError('Please enter your complete phone number (at least 10 digits). Partial numbers are not accepted.');
      return;
    }

    const parsedChallenge = Number.parseInt(challengeInput.trim(), 10);
    if (Number.isNaN(parsedChallenge) || parsedChallenge !== challenge.answer) {
      setError('Please solve the quick verification check correctly before searching.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await api.lookupClient(clean);
      setResult(data);
      setChallenge(createVerificationChallenge());
      setChallengeInput('');
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } catch (err) {
      setResult(null);
      setChallenge(createVerificationChallenge());
      setChallengeInput('');
      setError(
        err instanceof Error
          ? err.message
          : 'No client record found for this phone number.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runLookup(phone);
  }

  const hasTracker = siteSettings.showTracker;
  const hasSlider = siteSettings.showPosterSlider && posters.length > 0;

  return (
    <main className="bg-slate-50 flex-1 flex flex-col">
      {/* First Page Focal Split: Track by Phone Number + Running Poster Slider */}
      {(hasTracker || hasSlider) && (
        <section id="track-status" className="bg-white border-b border-slate-200">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5 sm:py-10 lg:py-14">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-10 items-stretch">
              {/* Left Column: Track by Phone Number */}
              {hasTracker && (
                <div
                  className={`${
                    hasSlider ? 'lg:col-span-6' : 'lg:col-span-12 max-w-2xl'
                  } flex flex-col justify-center`}
                >
                  {siteSettings.heroKicker && (
                    <p className="hidden sm:block text-xs font-medium text-slate-500 tracking-wide mb-3">
                      {siteSettings.heroKicker}
                    </p>
                  )}
                  <h1 className="font-display font-bold tracking-tight text-slate-900 text-balance text-[1.65rem] leading-[1.15] sm:text-4xl sm:leading-[1.1] lg:text-[3.1rem] lg:leading-[1.08]">
                    {siteSettings.heroTitle}
                  </h1>
                  {siteSettings.heroSubtitle && (
                    <p className="hidden sm:block mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
                      {siteSettings.heroSubtitle}
                    </p>
                  )}

                  {/* Phone Number Search Box */}
                  <form
                    onSubmit={handleSubmit}
                    className="mt-4 sm:mt-7 p-3.5 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <label
                      htmlFor="client-phone-input"
                      className="block text-xs sm:text-sm font-semibold text-slate-800 sm:text-slate-900 mb-2"
                    >
                      {siteSettings.trackerTitle || 'Client Phone Number'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                      <div className="relative flex-1">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="client-phone-input"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder={siteSettings.trackerPlaceholder || 'e.g. 01712345678'}
                          className="w-full pl-10 pr-4 py-2.5 sm:py-3 min-h-[44px] text-base bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 sm:py-3 min-h-[44px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-settle whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                      >
                        <Search className="w-4 h-4" />
                        <span>
                          {loading ? 'Checking...' : siteSettings.trackerButtonLabel || 'See Update'}
                        </span>
                      </button>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <label htmlFor="client-verify-input" className="inline-flex items-center gap-1.5 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                        <span>
                          Verify: {challenge.a} + {challenge.b} =
                        </span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id="client-verify-input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={3}
                          value={challengeInput}
                          onChange={(e) => setChallengeInput(e.target.value)}
                          placeholder="?"
                          className="w-16 px-2.5 py-1.5 text-center font-mono text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setChallenge(createVerificationChallenge());
                            setChallengeInput('');
                          }}
                          aria-label="Refresh verification question"
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="mt-3 px-3.5 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                        {error}
                      </div>
                    )}
                  </form>
                </div>
              )}

              {/* Right Column: Interactive Running Poster Slider */}
              {hasSlider && (
                <div
                  id="posters"
                  className={`${hasTracker ? 'lg:col-span-6' : 'lg:col-span-12'} flex flex-col`}
                >
                  <div
                    className="relative h-[230px] sm:h-[380px] lg:h-full lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200 bg-gradient-to-br from-slate-800 to-slate-950"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                    onFocusCapture={() => setIsPaused(true)}
                    onBlurCapture={() => setIsPaused(false)}
                    aria-roledescription="carousel"
                    aria-label={`${siteSettings.brandName} posters`}
                  >
                    {/* Compositor-only horizontal poster track */}
                    <div
                      className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform"
                      style={{ transform: `translateX(-${safeSlideIndex * 100}%)` }}
                    >
                      {posters.map((slide, idx) => (
                        <article
                          key={slide.id}
                          className="relative w-full h-full shrink-0 bg-gradient-to-br from-slate-800 to-slate-950"
                          aria-hidden={safeSlideIndex !== idx}
                        >
                          {slide.imageUrl && (
                            <img
                              src={slide.imageUrl}
                              alt={slide.alt || slide.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/10" />

                          <div className="absolute bottom-10 left-4 right-4 sm:bottom-14 sm:left-6 sm:right-6 text-white">
                            {slide.kicker && (
                              <p className="hidden sm:block font-mono text-xs font-medium text-blue-300 tracking-wide">
                                {slide.kicker}
                              </p>
                            )}
                            <h2 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white sm:mt-1.5 text-balance line-clamp-2">
                              {slide.title}
                            </h2>
                            {slide.subtitle && (
                              <p className="hidden sm:block text-sm text-slate-200 mt-2 leading-relaxed line-clamp-2 max-w-lg">
                                {slide.subtitle}
                              </p>
                            )}
                            {slide.actionLabel && slide.actionHref && (
                              <a
                                href={slide.actionHref}
                                className="hidden sm:inline-flex mt-3 items-center gap-1.5 text-sm font-semibold text-white hover:text-blue-200 underline underline-offset-4"
                              >
                                <span>{slide.actionLabel}</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>

                    {/* Top-Right Poster Controls: Prev, Pause/Play, Next */}
                    {posters.length > 1 && (
                      <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 z-10">
                        <button
                          type="button"
                          onClick={handlePrevSlide}
                          aria-label="Previous poster"
                          className="w-8 h-8 rounded-lg bg-slate-950/70 hover:bg-slate-950 text-white border border-white/15 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPaused((prev) => !prev)}
                          aria-label={isPaused ? 'Play poster slideshow' : 'Pause poster slideshow'}
                          className="w-8 h-8 rounded-lg bg-slate-950/70 hover:bg-slate-950 text-white border border-white/15 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          {isPaused ? (
                            <Play className="w-3.5 h-3.5" />
                          ) : (
                            <Pause className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleNextSlide}
                          aria-label="Next poster"
                          className="w-8 h-8 rounded-lg bg-slate-950/70 hover:bg-slate-950 text-white border border-white/15 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Bottom Bar: Clickable Slide Indicators */}
                    {posters.length > 1 && (
                      <div className="absolute bottom-4 left-5 right-5 sm:left-6 sm:right-6 z-10 flex items-center justify-between gap-4">
                        <div
                          className="flex items-center gap-2 flex-1 max-w-xs"
                          role="tablist"
                          aria-label="Select poster slide"
                        >
                          {posters.map((slide, idx) => {
                            const isActive = safeSlideIndex === idx;
                            return (
                              <button
                                key={slide.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                aria-label={`Show poster ${idx + 1}: ${slide.title}`}
                                onClick={() => setActiveSlide(idx)}
                                className={`h-1.5 rounded-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                                  isActive
                                    ? 'flex-1 bg-white'
                                    : 'w-6 bg-white/40 hover:bg-white/65'
                                }`}
                              />
                            );
                          })}
                        </div>
                        <span className="font-mono text-xs text-slate-300 tabular-nums shrink-0">
                          {String(safeSlideIndex + 1).padStart(2, '0')} /{' '}
                          {String(posters.length).padStart(2, '0')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Client Lookup Result Section (Shown only after tracking by phone number) */}
      {hasTracker && result && (
        <section
          ref={resultRef}
          aria-live="polite"
          className="bg-slate-50 border-b border-slate-200 py-6 sm:py-10"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
            {/* Client Status Banner */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 sm:pb-6 border-b border-slate-200">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  <span className="hidden sm:inline">Candidate Status File · </span>
                  <span className="font-mono">{result.client.phone}</span>
                </p>
                <h2 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 mt-1">
                  {result.client.name}
                </h2>
                <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-slate-600">
                  <span>{result.client.trade || 'Trade Pending'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{result.client.destinationCountry || 'TBD'}</span>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-2.5">
                <div className="px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm">
                  <span className="hidden sm:inline text-slate-500 mr-2">Current Stage:</span>
                  <span className="font-semibold text-blue-700">{result.client.status}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  aria-label="Hide tracking result"
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            <div className="mt-6 sm:mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
              {/* Left 8 Columns: Minimal Non-Sensitive Visa & Medical Status */}
              <div className="lg:col-span-8 space-y-5 sm:space-y-6">
                {/* Visa & Medical Status Snapshot */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                  <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 mb-3.5 sm:mb-4">
                    Visa &amp; Medical Status Summary
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pb-4 sm:pb-5 border-b border-slate-100 text-xs sm:text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Visa Processing Stage</p>
                      <p className="font-semibold text-blue-700 mt-0.5">{result.client.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Medical Status</p>
                      <p className="font-medium text-slate-900 mt-0.5">
                        {result.client.medicalDone ? 'Completed' : 'Pending'} · {result.client.medicalStatus}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Last Updated</p>
                      <p className="font-mono text-xs text-slate-700 mt-1">
                        {formatDateOnly(result.client.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-600">
                    <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <p>
                      For privacy protection, passport numbers, home addresses, uploaded documents,
                      payment history, and internal notes are hidden on public status lookup. Contact
                      your assigned coordinator for private file details.
                    </p>
                  </div>
                </div>

                {/* Medical, Meetings & Interviews */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <Stethoscope className="w-4 h-4 text-blue-700" />
                      <span>Medical Screening Details</span>
                    </h3>
                    <div className="text-sm text-slate-700 space-y-1">
                      <p>
                        <span className="text-slate-500">Status:</span>{' '}
                        <span className="font-semibold">
                          {result.client.medicalDone ? 'Completed' : 'Pending'} (
                          {result.client.medicalStatus})
                        </span>
                      </p>
                      {result.client.medicalCenter && (
                        <p>
                          <span className="text-slate-500">Medical Center:</span>{' '}
                          {result.client.medicalCenter}
                          {result.client.medicalLocation ? ` · ${result.client.medicalLocation}` : ''}
                        </p>
                      )}
                    </div>
                    {result.medicals.length > 0 && (
                      <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                        {result.medicals.map((med) => (
                          <div key={med.id} className="py-2.5 text-sm flex flex-wrap justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-900">
                                {med.medicalCenter} — {med.medicalLocation}
                              </p>
                              <p className="text-xs text-slate-500">
                                Test Date: {formatDateOnly(med.testDate)}
                              </p>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-xs font-semibold ${
                                  med.result === 'Fit'
                                    ? 'text-emerald-700'
                                    : med.result === 'Unfit'
                                    ? 'text-red-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                Result: {med.result}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Meetings & Interviews */}
                  <div className="pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4 text-blue-700" />
                        <span>Scheduled Meetings</span>
                      </h4>
                      {result.meetings.length === 0 ? (
                        <p className="text-sm text-slate-500">No meetings scheduled.</p>
                      ) : (
                        <div className="space-y-3">
                          {result.meetings.map((mtg) => (
                            <div
                              key={mtg.id}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                            >
                              <p className="font-semibold text-slate-900">{mtg.meetingWith}</p>
                              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>{formatDateTime(mtg.dateTime)}</span>
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span>{mtg.location}</span>
                              </p>
                              <p className="text-xs font-medium text-blue-700 mt-1.5">
                                Status: {mtg.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-blue-700" />
                        <span>Trade Interviews</span>
                      </h4>
                      {result.interviews.length === 0 ? (
                        <p className="text-sm text-slate-500">No interview dates assigned yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {result.interviews.map((iv) => (
                            <div
                              key={iv.id}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                            >
                              <p className="font-semibold text-slate-900">{iv.interviewerOrCompany}</p>
                              <p className="text-xs text-slate-600 mt-1">
                                Date: {formatDateOnly(iv.interviewDate)}
                                {iv.interviewTime ? ` · ${iv.interviewTime}` : ''}
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Location: {iv.location}
                              </p>
                              <p className="text-xs font-medium text-blue-700 mt-1.5">
                                Status: {iv.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 4 Columns: Assigned Staff Contact Card */}
              <div className="lg:col-span-4 space-y-4">
                {result.staff ? (
                  <StaffContactCard staff={result.staff} heading="Assigned Staff Coordinator" />
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
                    Coordinator details unavailable. Please contact our Dhaka front desk.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Direct Contact Numbers Strip */}
      {siteSettings.showContactSection && (
        <section id="contact" className="bg-slate-50 py-6 sm:py-10 flex-1">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <p className="hidden sm:block text-xs font-medium text-blue-700">Contact Numbers</p>
                <h2 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-slate-900 sm:mt-0.5">
                  {siteSettings.contactSectionTitle || 'Direct Hotline & WhatsApp Desk'}
                </h2>
              </div>
              {(siteSettings.officeAddress || siteSettings.officeHours) && (
                <p className="hidden sm:block text-xs text-slate-500">
                  {[siteSettings.officeAddress, siteSettings.officeHours].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            {siteSettings.contacts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {siteSettings.contacts.map((item) => {
                  const isWa = item.type === 'whatsapp';
                  const href = isWa
                    ? buildWhatsAppUrl(item.value)
                    : `tel:${item.value.replace(/[^+\d]/g, '')}`;
                  return (
                    <a
                      key={item.id}
                      href={href}
                      target={isWa ? '_blank' : undefined}
                      rel={isWa ? 'noopener noreferrer' : undefined}
                      className={`bg-white border border-slate-200 ${
                        isWa ? 'hover:border-emerald-700' : 'hover:border-blue-700'
                      } rounded-xl p-3.5 sm:p-5 flex items-center justify-between gap-3 sm:gap-4 transition-colors group`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg ${
                            isWa ? 'bg-emerald-700' : 'bg-slate-900'
                          } text-white flex items-center justify-center shrink-0`}
                        >
                          {isWa ? (
                            <MessageCircle className="w-4 h-4" />
                          ) : (
                            <Phone className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-500 truncate">{item.label}</p>
                          <p className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums mt-0.5 truncate">
                            {item.value}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          isWa ? 'text-emerald-700' : 'text-blue-700'
                        } group-hover:underline shrink-0`}
                      >
                        <span className="hidden sm:inline">
                          {item.actionLabel || (isWa ? 'Chat' : 'Call')}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {!siteSettings.showContactSection && <div className="flex-1" />}

      {/* Compact Footer */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5 sm:py-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <BrandLogo
            variant="dark"
            brandName={siteSettings.brandName}
            logoUrl={siteSettings.logoUrl}
          />
          <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-xs text-slate-400">
            {siteSettings.showTracker && (
              <a
                href="#track-status"
                className="hidden sm:inline hover:text-white transition-colors whitespace-nowrap"
              >
                Track Status
              </a>
            )}
            {siteSettings.showPosterSlider && posters.length > 0 && (
              <a
                href="#posters"
                className="hidden sm:inline hover:text-white transition-colors whitespace-nowrap"
              >
                Posters
              </a>
            )}
            {siteSettings.footerHotline && (
              <a
                href={`tel:${siteSettings.footerHotline.replace(/[^+\d]/g, '')}`}
                className="font-mono text-slate-200 hover:text-white transition-colors whitespace-nowrap"
              >
                {siteSettings.footerHotline}
              </a>
            )}
            <span className="whitespace-nowrap">
              © {new Date().getFullYear()} {siteSettings.brandName || 'Global Pathways'}
            </span>
          </div>
        </div>
      </footer>

    </main>
  );
}
