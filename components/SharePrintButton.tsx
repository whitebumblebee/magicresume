"use client";

export function SharePrintButton({ name }: { name: string }) {
  return (
    <button
      onClick={() => {
        document.title = `${name || "Resume"} — Resume`;
        window.print();
      }}
      className="rounded-md bg-sky-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-800"
    >
      Download PDF
    </button>
  );
}
