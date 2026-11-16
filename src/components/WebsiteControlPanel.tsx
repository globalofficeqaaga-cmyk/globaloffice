import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../lib/api';
import { DEFAULT_SITE_SETTINGS } from '../lib/siteDefaults';
import { useUnsavedChangesWarning } from '../lib/useUnsavedChanges';
import type { SiteContactItem, SitePosterSlide, SiteSettings } from '../types';
import { BrandLogo } from './BrandLogo';
import { PasswordConfirmModal } from './PasswordConfirmModal';

interface WebsiteControlPanelProps {
  siteSettings: SiteSettings;
  onSiteSettingsSaved: (next: SiteSettings) => void;
  onNotifySuccess: (msg: string) => void;
}

export function WebsiteControlPanel({
  siteSettings,
  onSiteSettingsSaved,
  onNotifySuccess,
}: WebsiteControlPanelProps) {
  const [draft, setDraft] = useState<SiteSettings>(siteSettings);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    title: string;
    label: string;
    confirmLabel: string;
    action: () => Promise<void> | void;
  } | null>(null);

  useUnsavedChangesWarning(isDirty && !saving);

  useEffect(() => {
    if (!isDirty) {
      setDraft(siteSettings);
    }
  }, [siteSettings, isDirty]);

  function patchDraft(patch: Partial<SiteSettings>) {
    setIsDirty(true);
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadingTarget('logo');
    try {
      const url = await api.uploadStaffMediaFile(file, 'site_cms', 'avatar');
      patchDraft({ logoUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload website logo.');
    } finally {
      setUploadingTarget(null);
      e.target.value = '';
    }
  }

  async function handlePosterImageUpload(slideId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadingTarget(`poster_${slideId}`);
    try {
      const url = await api.uploadStaffMediaFile(file, 'site_cms', 'cover');
      updatePoster(slideId, { imageUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload poster photo.');
    } finally {
      setUploadingTarget(null);
      e.target.value = '';
    }
  }

  function addPosterSlide() {
    const nextIndex = draft.posters.length + 1;
    const newSlide: SitePosterSlide = {
      id: `poster_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kicker: `${String(nextIndex).padStart(2, '0')} · New Recruitment Notice`,
      title: 'New Overseas Opportunity',
      subtitle: 'Update details, target country, or upload your own recruitment poster image.',
      actionLabel: 'Check Your File',
      actionHref: '#track-status',
      imageUrl: DEFAULT_SITE_SETTINGS.posters[0]?.imageUrl || '',
      alt: 'Recruitment poster image',
    };
    patchDraft({ posters: [...draft.posters, newSlide] });
  }

  function updatePoster(id: string, patch: Partial<SitePosterSlide>) {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      posters: prev.posters.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removePoster(id: string) {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      posters: prev.posters.filter((p) => p.id !== id),
    }));
  }

  function movePoster(index: number, direction: -1 | 1) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draft.posters.length) return;
    setIsDirty(true);
    setDraft((prev) => {
      const next = [...prev.posters];
      const [moved] = next.splice(index, 1);
      next.splice(targetIdx, 0, moved);
      return { ...prev, posters: next };
    });
  }

  function addContactItem() {
    const newContact: SiteContactItem = {
      id: `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: 'Support Desk',
      value: '+880 1700-000000',
      type: 'phone',
      actionLabel: 'Call',
    };
    patchDraft({ contacts: [...draft.contacts, newContact] });
  }

  function updateContact(id: string, patch: Partial<SiteContactItem>) {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function removeContact(id: string) {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((c) => c.id !== id),
    }));
  }

  async function saveSettings(targetSettings: SiteSettings) {
    setError('');
    setSaving(true);
    try {
      const saved = await api.updateSiteSettings(targetSettings);
      setDraft(saved);
      setIsDirty(false);
      onSiteSettingsSaved(saved);
      onNotifySuccess('Website logo, slider posters, functions, and contacts saved to database.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save website settings.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    saveSettings(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {error}
        </div>
      )}

      {/* Top Sticky Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Website Content, Photos, Logo, Slider & Functions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Add, edit, toggle, or remove any landing page section, logo, poster slide, photo, or contact number.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              setPendingRemoval({
                title: 'Confirm Reset Website Defaults',
                label: 'Reset all website branding, posters & contacts to defaults',
                confirmLabel: 'Verify & Reset',
                action: () => saveSettings(DEFAULT_SITE_SETTINGS),
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            type="submit"
            disabled={saving || uploadingTarget !== null}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'Saving Website...' : 'Save Website Changes'}</span>
          </button>
        </div>
      </div>

      {/* 1. Website Logo, Brand Name & Header Login */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              1. Website Logo & Branding
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload a custom logo photo or remove it to use the default emblem.
            </p>
          </div>
          <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <BrandLogo variant="light" brandName={draft.brandName} logoUrl={draft.logoUrl} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Website Brand Name *
            </label>
            <input
              type="text"
              required
              value={draft.brandName}
              onChange={(e) => patchDraft({ brandName: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Top Bar Login Button Text
            </label>
            <input
              type="text"
              value={draft.loginButtonLabel}
              onChange={(e) => patchDraft({ loginButtonLabel: e.target.value })}
              placeholder="Login"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Website Logo Photo
            </label>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingTarget === 'logo' ? 'Uploading...' : 'Upload Logo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingTarget !== null}
                  onChange={handleLogoUpload}
                  className="sr-only"
                />
              </label>
              {draft.logoUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setPendingRemoval({
                      title: 'Confirm Remove Website Logo',
                      label: 'Remove Website Logo Photo',
                      confirmLabel: 'Verify & Remove Logo',
                      action: () => patchDraft({ logoUrl: '' }),
                    })
                  }
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Logo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Website Functions Show/Hide Toggles */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">
            2. Website Functions Visibility (Enable / Hide)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Turn individual landing page features on or off at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              key: 'showTracker' as const,
              title: 'Phone Number Tracker',
              desc: 'Client number search & live status update',
            },
            {
              key: 'showPosterSlider' as const,
              title: 'Running Poster Slider',
              desc: 'Auto-sliding recruitment & notice posters',
            },
            {
              key: 'showContactSection' as const,
              title: 'Contact Numbers Strip',
              desc: 'Hotline call & WhatsApp desk section',
            },
            {
              key: 'showLoginButton' as const,
              title: 'Top Bar Login Button',
              desc: 'Staff & Admin sign-in button in header',
            },
          ].map((item) => {
            const active = draft[item.key];
            return (
              <label
                key={item.key}
                className={`p-3.5 border rounded-xl cursor-pointer flex items-start gap-3 transition-colors ${
                  active ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => patchDraft({ [item.key]: e.target.checked })}
                  className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Hero & Tracker Copy */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hero Top Label
            </label>
            <input
              type="text"
              value={draft.heroKicker}
              onChange={(e) => patchDraft({ heroKicker: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hero Main Headline
            </label>
            <input
              type="text"
              value={draft.heroTitle}
              onChange={(e) => patchDraft({ heroTitle: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hero Subtitle
            </label>
            <textarea
              rows={2}
              value={draft.heroSubtitle}
              onChange={(e) => patchDraft({ heroSubtitle: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phone Input Label
            </label>
            <input
              type="text"
              value={draft.trackerTitle}
              onChange={(e) => patchDraft({ trackerTitle: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Input Placeholder
              </label>
              <input
                type="text"
                value={draft.trackerPlaceholder}
                onChange={(e) => patchDraft({ trackerPlaceholder: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Track Button Label
              </label>
              <input
                type="text"
                value={draft.trackerButtonLabel}
                onChange={(e) => patchDraft({ trackerButtonLabel: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Running Poster Slider Manager */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              3. Running Poster Slider ({draft.posters.length} Posters)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Add new slides, upload poster photos, change captions/links, reorder, or remove posters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span>Slide Speed:</span>
              <select
                value={draft.posterAutoSlideMs}
                onChange={(e) => patchDraft({ posterAutoSlideMs: Number(e.target.value) })}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
              >
                <option value={3000}>3.0 sec</option>
                <option value={4500}>4.5 sec</option>
                <option value={6000}>6.0 sec</option>
                <option value={8000}>8.0 sec</option>
              </select>
            </label>
            <button
              type="button"
              onClick={addPosterSlide}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Poster Slide</span>
            </button>
          </div>
        </div>

        {draft.posters.length === 0 ? (
          <div className="p-8 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center">
            <p className="text-sm text-slate-600">
              No poster slides configured. Click &ldquo;Add Poster Slide&rdquo; to add a banner poster.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {draft.posters.map((slide, idx) => (
              <div
                key={slide.id}
                className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
              >
                {/* Poster Image Preview + Upload */}
                <div className="lg:col-span-4 space-y-2.5">
                  <div className="aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-900 relative">
                    {slide.imageUrl ? (
                      <img
                        src={slide.imageUrl}
                        alt={slide.alt || slide.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                        No Image
                      </div>
                    )}
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-950/75 text-white rounded">
                      Slide #{idx + 1}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:border-blue-700 text-slate-800 rounded-lg cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5 text-blue-700" />
                      <span>
                        {uploadingTarget === `poster_${slide.id}`
                          ? 'Uploading...'
                          : 'Upload Photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingTarget !== null}
                        onChange={(e) => handlePosterImageUpload(slide.id, e)}
                        className="sr-only"
                      />
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => movePoster(idx, -1)}
                        aria-label="Move poster up"
                        className="p-1.5 text-slate-600 hover:bg-white disabled:opacity-35 rounded border border-slate-200 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === draft.posters.length - 1}
                        onClick={() => movePoster(idx, 1)}
                        aria-label="Move poster down"
                        className="p-1.5 text-slate-600 hover:bg-white disabled:opacity-35 rounded border border-slate-200 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingRemoval({
                            title: 'Confirm Remove Poster Slide',
                            label: `Poster Slide #${idx + 1}: ${slide.title || 'Untitled Poster'}`,
                            confirmLabel: 'Verify & Remove',
                            action: () => removePoster(slide.id),
                          })
                        }
                        aria-label={`Remove poster ${slide.title}`}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-red-200 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Poster Text & Action Controls */}
                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kicker / Country Tag
                    </label>
                    <input
                      type="text"
                      value={slide.kicker}
                      onChange={(e) => updatePoster(slide.id, { kicker: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Poster Headline *
                    </label>
                    <input
                      type="text"
                      required
                      value={slide.title}
                      onChange={(e) => updatePoster(slide.id, { title: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Short Description
                    </label>
                    <textarea
                      rows={2}
                      value={slide.subtitle}
                      onChange={(e) => updatePoster(slide.id, { subtitle: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Button Label
                    </label>
                    <input
                      type="text"
                      value={slide.actionLabel}
                      onChange={(e) => updatePoster(slide.id, { actionLabel: e.target.value })}
                      placeholder="e.g. Check Your File"
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Button Link (#track-status, #contact, tel:...)
                    </label>
                    <input
                      type="text"
                      value={slide.actionHref}
                      onChange={(e) => updatePoster(slide.id, { actionHref: e.target.value })}
                      placeholder="#track-status"
                      className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Contact Numbers & Office Address Manager */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              4. Contact Numbers & Office Info ({draft.contacts.length} Entries)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Add, edit, or remove clickable phone hotlines, WhatsApp numbers, and office address details.
            </p>
          </div>
          <button
            type="button"
            onClick={addContactItem}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Contact Number</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Section Heading
            </label>
            <input
              type="text"
              value={draft.contactSectionTitle}
              onChange={(e) => patchDraft({ contactSectionTitle: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Office Address
            </label>
            <input
              type="text"
              value={draft.officeAddress}
              onChange={(e) => patchDraft({ officeAddress: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Office Hours
            </label>
            <input
              type="text"
              value={draft.officeHours}
              onChange={(e) => patchDraft({ officeHours: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Footer Hotline Number
            </label>
            <input
              type="text"
              value={draft.footerHotline}
              onChange={(e) => patchDraft({ footerHotline: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="space-y-3">
          {draft.contacts.map((item) => (
            <div
              key={item.id}
              className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
            >
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                <select
                  value={item.type}
                  onChange={(e) =>
                    updateContact(item.id, {
                      type: e.target.value as 'phone' | 'whatsapp',
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="phone">Phone Call</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Label</label>
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateContact(item.id, { label: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Number *</label>
                <input
                  type="text"
                  required
                  value={item.value}
                  onChange={(e) => updateContact(item.id, { value: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Button</label>
                <input
                  type="text"
                  value={item.actionLabel}
                  onChange={(e) => updateContact(item.id, { actionLabel: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setPendingRemoval({
                      title: 'Confirm Remove Contact Number',
                      label: `${item.label || 'Contact'}: ${item.value}`,
                      confirmLabel: 'Verify & Remove',
                      action: () => removeContact(item.id),
                    })
                  }
                  aria-label={`Remove contact ${item.label}`}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Save Bar */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || uploadingTarget !== null}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{saving ? 'Saving Website...' : 'Save Website Changes'}</span>
        </button>
      </div>

      <PasswordConfirmModal
        open={pendingRemoval !== null}
        title={pendingRemoval?.title || 'Password Required to Remove'}
        itemLabel={pendingRemoval?.label || ''}
        confirmLabel={pendingRemoval?.confirmLabel || 'Verify & Remove'}
        onClose={() => setPendingRemoval(null)}
        onConfirm={async () => {
          if (pendingRemoval) {
            await pendingRemoval.action();
          }
        }}
      />
    </form>
  );
}
