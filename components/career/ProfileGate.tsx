"use client";

import { useEffect, useState } from "react";

export interface ProfileLink {
  label: string;
  url: string;
}

export interface AccountProfile {
  username: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  profession: string | null;
  phone: string | null;
  location: string | null;
  links: ProfileLink[];
  birthYear: number | null;
  profileCompletedAt: string | null;
}

/**
 * First-run profile capture.
 *
 * First + last name is what lets the server decide whether an imported resume
 * belongs to this account before any of it becomes career memory, and it is the
 * name printed on generated resumes and cover letters. Contact details and links
 * feed the cover-letter signature.
 */
const DEFERRED_KEY = "mr-profile-gate-deferred";

export function ProfileGate({
  onComplete,
}: {
  onComplete?: (profile: AccountProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profession, setProfession] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [birthYear, setBirthYear] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch("/api/profile");
      if (!response.ok) return;
      const payload = (await response.json()) as {
        profile?: AccountProfile;
        complete?: boolean;
      };
      if (!active || !payload.profile) return;
      const profile = payload.profile;
      if (payload.complete) {
        onComplete?.(profile);
        return;
      }
      // Asking is fine; trapping is not. Once dismissed, stay out of the way for
      // the rest of the session — career-memory import re-asks when it matters.
      if (sessionStorage.getItem(DEFERRED_KEY) === "1") return;
      // Prefill from whatever the auth provider already gave us.
      const [providerFirst, ...providerRest] = (profile.name ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      setUsername(profile.username ?? "");
      setFirstName(profile.firstName ?? providerFirst ?? "");
      setLastName(profile.lastName ?? providerRest.join(" "));
      setProfession(profile.profession ?? "");
      setPhone(profile.phone ?? "");
      setLocation(profile.location ?? "");
      setLinks(profile.links ?? []);
      setBirthYear(profile.birthYear ? String(profile.birthYear) : "");
      setOpen(true);
    })();
    return () => {
      active = false;
    };
  }, [onComplete]);

  const defer = () => {
    sessionStorage.setItem(DEFERRED_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          firstName,
          lastName,
          profession,
          phone,
          location,
          links: links.filter((link) => link.label.trim() && link.url.trim()),
          birthYear: birthYear.trim() ? Number(birthYear) : null,
        }),
      });
      const payload = (await response.json()) as {
        profile?: AccountProfile;
        error?: string;
      };
      if (!response.ok || !payload.profile) {
        setError(payload.error ?? "Could not save your profile.");
        return;
      }
      onComplete?.(payload.profile);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const field =
    "mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900";
  const labelClass = "block text-xs font-medium text-zinc-700";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") defer();
      }}
    >
      {/* Clicking outside dismisses, matching the Escape and Later affordances. */}
      <button
        type="button"
        aria-label="Dismiss profile setup"
        onClick={defer}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="profile-gate-title"
            className="text-lg font-bold text-zinc-950"
          >
            Complete your profile
          </h2>
          <button
            type="button"
            onClick={defer}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded px-2 text-lg leading-none text-zinc-400 hover:text-zinc-700"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          Your name identifies which resumes are yours, and it is the name
          printed on the resumes and cover letters MagicResume generates for
          you. You can do this later — we will ask again before a resume becomes
          career memory.
        </p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              First name
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                className={field}
              />
            </label>
            <label className={labelClass}>
              Last name
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                className={field}
              />
            </label>
          </div>
          <label className={labelClass}>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className={field}
              placeholder="lowercase, 3–30 characters"
            />
          </label>
          <label className={labelClass}>
            Profession
            <input
              value={profession}
              onChange={(event) => setProfession(event.target.value)}
              className={field}
              placeholder="e.g. Software Engineer, Nurse, Architect"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Phone{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                className={field}
              />
            </label>
            <label className={labelClass}>
              Location{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className={field}
                placeholder="City, Country"
              />
            </label>
          </div>
          <div>
            <span className={labelClass}>
              Links{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </span>
            <div className="mt-1 space-y-2">
              {links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    aria-label={`Link ${index + 1} label`}
                    value={link.label}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((item, position) =>
                          position === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="w-28 rounded border border-zinc-300 px-2 py-1.5 text-sm"
                    placeholder="LinkedIn"
                  />
                  <input
                    aria-label={`Link ${index + 1} URL`}
                    value={link.url}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((item, position) =>
                          position === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm"
                    placeholder="linkedin.com/in/you"
                  />
                  <button
                    type="button"
                    aria-label={`Remove link ${index + 1}`}
                    onClick={() =>
                      setLinks((current) =>
                        current.filter((_item, position) => position !== index),
                      )
                    }
                    className="rounded border border-zinc-300 px-2 text-zinc-500"
                  >
                    ×
                  </button>
                </div>
              ))}
              {links.length < 8 && (
                <button
                  type="button"
                  onClick={() =>
                    setLinks((current) => [...current, { label: "", url: "" }])
                  }
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700"
                >
                  Add link
                </button>
              )}
            </div>
          </div>
          <label className={labelClass}>
            Birth year{" "}
            <span className="font-normal text-zinc-500">(optional)</span>
            <input
              value={birthYear}
              onChange={(event) => setBirthYear(event.target.value)}
              inputMode="numeric"
              className={field}
              placeholder="1990"
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={defer}
            className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Later
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
