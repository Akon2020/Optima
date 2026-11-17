import type { Metadata } from "next";

import { ContentTextView } from "../_components/placeholder-mark";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";
import { LEGAL } from "../_content/landing";

export const metadata: Metadata = {
  title: LEGAL.title,
  alternates: { canonical: "/mentions-legales" },
};

/** Mentions légales (docs/LANDING_PAGE.md § 3, ligne 10 ; D-068). */
export default function LegalNoticePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader anchorsBase="/" />
      <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-3xl font-bold sm:text-4xl">{LEGAL.title}</h1>
          <div className="mt-10 space-y-10">
            {LEGAL.sections.map((section, index) => (
              <section key={section.title} aria-labelledby={`mention-${index}`}>
                <h2 id={`mention-${index}`} className="text-xl font-semibold">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-text-muted">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph.text}>
                      <ContentTextView content={paragraph} />
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter anchorsBase="/" />
    </div>
  );
}
