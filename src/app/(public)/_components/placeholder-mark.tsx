import type { ContentText } from "../_content/landing";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Texte du fichier de contenu (docs/LANDING_PAGE.md § 2) : un texte encore
 * provisoire (`placeholder: true`) porte un repère discret en développement,
 * jamais en production.
 */
export function ContentTextView({ content }: { content: ContentText }) {
  return (
    <>
      {content.text}
      {content.placeholder && !IS_PRODUCTION ? (
        <span className="ml-2 rounded-sm border border-dashed border-warning px-1.5 text-xs text-text-muted">
          provisoire
        </span>
      ) : null}
    </>
  );
}
