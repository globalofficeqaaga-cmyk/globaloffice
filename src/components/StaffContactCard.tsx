import { ExternalLink, MessageCircle, Phone, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { buildWhatsAppUrl } from '../lib/api';
import type { PublicTrackedStaff, PublicUser } from '../types';

interface StaffContactCardProps {
  staff: PublicTrackedStaff | PublicUser;
  heading?: string;
}

export function StaffContactCard({ staff, heading = 'Your Assigned Coordinator' }: StaffContactCardProps) {
  const [coverError, setCoverError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const whatsappHref = staff.whatsapp ? buildWhatsAppUrl(staff.whatsapp) : '';
  const hasSocial = Boolean(staff.socialLink && staff.socialLink.trim());

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Cover banner */}
      <div className="relative h-32 bg-slate-900 overflow-hidden">
        {!coverError && staff.coverUrl ? (
          <img
            src={staff.coverUrl}
            alt={`${staff.name} cover`}
            referrerPolicy="no-referrer"
            onError={() => setCoverError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/25 to-transparent" />
        <div className="absolute top-3 left-4 text-xs font-medium text-white/90">
          {heading}
        </div>
      </div>

      {/* Profile Header */}
      <div className="px-6 pb-6">
        <div className="relative -mt-10 mb-4 flex items-end justify-between gap-4">
          <div className="w-20 h-20 rounded-xl border-4 border-white bg-slate-100 overflow-hidden shrink-0 shadow-sm">
            {!avatarError && staff.photoUrl ? (
              <img
                src={staff.photoUrl}
                alt={staff.name}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-600">
                <UserCheck className="w-7 h-7" />
              </div>
            )}
          </div>
        </div>

        <h3 className="font-display text-lg font-bold text-slate-900">{staff.name}</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          {staff.designation || 'Visa & Recruitment Coordinator'}
        </p>

        {/* Direct Contact Options */}
        <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
          {staff.phone && (
            <a
              href={`tel:${staff.phone.replace(/\s+/g, '')}`}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <span className="inline-flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-blue-700" />
                <span>Call Coordinator</span>
              </span>
              <span className="font-mono text-xs text-slate-600 tabular-nums">{staff.phone}</span>
            </a>
          )}

          {staff.whatsapp && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              <span className="inline-flex items-center gap-2.5">
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp Chat</span>
              </span>
              <span className="font-mono text-xs text-emerald-100 tabular-nums">{staff.whatsapp}</span>
            </a>
          )}

          {hasSocial && (
            <a
              href={staff.socialLink.startsWith('http') ? staff.socialLink : `https://${staff.socialLink}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              <span>Facebook / Social Profile</span>
              <ExternalLink className="w-4 h-4 shrink-0" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
