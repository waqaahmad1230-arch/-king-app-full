import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useCreatorProfile, cleanProfilePhoto } from '../services/creatorProfileService';

interface CreatorAvatarProps {
  uid?: string | null;
  fallbackPhoto?: string | null;
  fallbackName?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}

export default function CreatorAvatar({
  uid,
  fallbackPhoto,
  fallbackName,
  className = "w-9 h-9 sm:w-10 sm:h-10",
  onClick,
  title,
}: CreatorAvatarProps) {
  const { photoURL: livePhoto, displayName } = useCreatorProfile(uid);
  const [imgError, setImgError] = useState(false);

  // Live photo from publicProfiles/{uid} has highest priority (supports instant sync when user updates photo)
  // Fall back to clean snapshot fallbackPhoto if live photo not yet loaded or unavailable
  const rawTargetPhoto = livePhoto || cleanProfilePhoto(fallbackPhoto);
  const resolvedPhoto = cleanProfilePhoto(rawTargetPhoto);

  useEffect(() => {
    setImgError(false);
  }, [resolvedPhoto]);

  const name = displayName || fallbackName || "Creator";
  const initial = name.trim().charAt(0).toUpperCase() || "";

  return (
    <div
      onClick={onClick}
      className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center relative select-none ${className}`}
      title={title || name}
    >
      {resolvedPhoto && !imgError ? (
        <img
          src={resolvedPhoto}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        // Neutral default avatar (NO KING logo or crown badge; clean neutral avatar)
        <div className="w-full h-full rounded-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border border-slate-600/60 flex items-center justify-center text-slate-300 font-bold text-xs shadow-inner">
          {initial ? (
            <span className="font-semibold text-slate-200">{initial}</span>
          ) : (
            <User className="w-1/2 h-1/2 text-slate-400" />
          )}
        </div>
      )}
    </div>
  );
}

export function CreatorDisplayName({ uid, fallback = "Creator" }: { uid?: string | null; fallback?: string }) {
  const { displayName } = useCreatorProfile(uid);
  return <>{displayName || fallback}</>;
}

