"use client";

import { useBuilderStore } from "@/lib/store";
import { newId } from "@/lib/resume/defaults";

const inputCls =
  "w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none";
const labelCls = "block text-[11px] font-medium text-zinc-500 mb-0.5";

export function ContactEditor() {
  const contact = useBuilderStore((s) => s.doc.contact);
  const headline = useBuilderStore((s) => s.doc.headline ?? "");
  const setContact = useBuilderStore((s) => s.setContact);
  const setHeadline = useBuilderStore((s) => s.setHeadline);
  const addLink = useBuilderStore((s) => s.addLink);
  const updateLink = useBuilderStore((s) => s.updateLink);
  const removeLink = useBuilderStore((s) => s.removeLink);

  return (
    <div className="space-y-2">
      <div>
        <label className={labelCls}>Full name</label>
        <input
          className={inputCls}
          value={contact.name}
          onChange={(e) => setContact({ name: e.target.value })}
          placeholder="Your Name"
        />
      </div>
      <div>
        <label className={labelCls}>Professional title</label>
        <input
          className={inputCls}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Python Developer"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Email</label>
          <input
            className={inputCls}
            value={contact.email}
            onChange={(e) => setContact({ email: e.target.value })}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            className={inputCls}
            value={contact.phone}
            onChange={(e) => setContact({ phone: e.target.value })}
            placeholder="+91-…"
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Location</label>
        <input
          className={inputCls}
          value={contact.location}
          onChange={(e) => setContact({ location: e.target.value })}
          placeholder="City, Country"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className={labelCls}>Other labeled details</label>
          <button
            onClick={() =>
              setContact({
                details: [
                  ...(contact.details ?? []),
                  { id: newId(), label: "", value: "" },
                ],
              })
            }
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            + Add detail
          </button>
        </div>
        <div className="space-y-1.5">
          {(contact.details ?? []).map((detail) => (
            <div key={detail.id} className="flex items-center gap-1.5">
              <input
                className={inputCls + " w-28"}
                value={detail.label}
                onChange={(e) =>
                  setContact({
                    details: (contact.details ?? []).map((candidate) =>
                      candidate.id === detail.id
                        ? { ...candidate, label: e.target.value }
                        : candidate,
                    ),
                  })
                }
                placeholder="Label"
              />
              <input
                className={inputCls}
                value={detail.value}
                onChange={(e) =>
                  setContact({
                    details: (contact.details ?? []).map((candidate) =>
                      candidate.id === detail.id
                        ? { ...candidate, value: e.target.value }
                        : candidate,
                    ),
                  })
                }
                placeholder="Value"
              />
              <button
                onClick={() =>
                  setContact({
                    details: (contact.details ?? []).filter(
                      (candidate) => candidate.id !== detail.id,
                    ),
                  })
                }
                className="shrink-0 text-zinc-400 hover:text-red-500"
                title="Remove detail"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className={labelCls}>Links</label>
          <button
            onClick={addLink}
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            + Add link
          </button>
        </div>
        <div className="space-y-1.5">
          {contact.links.map((link) => (
            <div key={link.id} className="flex items-center gap-1.5">
              <input
                className={inputCls + " w-28"}
                value={link.label}
                onChange={(e) => updateLink(link.id, { label: e.target.value })}
                placeholder="Label"
              />
              <input
                className={inputCls}
                value={link.url}
                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                placeholder="https://…"
              />
              <button
                onClick={() => removeLink(link.id)}
                className="shrink-0 text-zinc-400 hover:text-red-500"
                title="Remove link"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
