import { describe, expect, it } from "vitest";

import { buildReportDocument, buildTableDocument, escapeHtml } from "./table-document";

describe("document imprimable (EF-AUD-04)", () => {
  it("échappe tout le contenu", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    );
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(12)).toBe("12");
  });

  it("produit un tableau titré, sans balise injectée", () => {
    const html = buildTableDocument({
      title: "Journal d'audit",
      details: ["Établissement : <b>Resto</b>"],
      header: ["Date", "Action"],
      rows: [["08/11/2026", '<img src="http://pirate.test/x.png">']],
      generatedAt: "08/11/2026 à 12:00",
      columnWeights: [1, 3],
    });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("<th>Date</th><th>Action</th>");
    expect(html).toContain("&lt;img src=&quot;http://pirate.test/x.png&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain('<col style="width:25.00%"><col style="width:75.00%">');
    expect(html).toContain("1 ligne.");
  });

  it("annonce un tableau vide", () => {
    const html = buildTableDocument({
      title: "Journal",
      details: [],
      header: ["A", "B"],
      rows: [],
      generatedAt: "—",
    });
    expect(html).toContain('<td colspan="2" class="empty">Aucune entrée.</td>');
  });
});

describe("rapport en sections (EF-RAP-04)", () => {
  it("porte l'en-tête de l'établissement et échappe chaque section", () => {
    const html = buildReportDocument({
      title: "Rapport des ventes",
      establishment: ["Restaurant <i>Best</i>", "Avenue P.E. Lumumba"],
      details: ["Du 10/11/2026 au 16/11/2026"],
      sections: [
        {
          title: "Par article",
          header: ["Article", "Quantité", "Montant"],
          rows: [["Primus", 3, 12500]],
        },
        { title: "Par heure", header: ["Heure"], rows: [], emptyLabel: "Aucune vente." },
      ],
      generatedAt: "16/11/2026 à 21:00",
    });
    expect(html).toContain("Restaurant &lt;i&gt;Best&lt;/i&gt;");
    expect(html).not.toContain("<i>");
    expect(html).toContain("<h2>Par article</h2>");
    expect(html).toMatch(/<td>Primus<\/td><td>3<\/td><td>12\s500<\/td>/);
    expect(html).toContain('<td colspan="1" class="empty">Aucune vente.</td>');
  });
});
