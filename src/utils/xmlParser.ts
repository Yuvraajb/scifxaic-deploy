export interface AtomEntry {
  id: string;
  title: string;
  summary: string;
  updated: string;
  link: string;
  companyName: string;
  cik: string;
  filingType: string;
}

export function parseAtomFeed(xmlText: string): AtomEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) return [];

  const entries = Array.from(doc.querySelectorAll('entry'));
  return entries.map((entry) => {
    const getText = (tag: string) => entry.querySelector(tag)?.textContent?.trim() ?? '';
    const link =
      entry.querySelector('link[rel="alternate"]')?.getAttribute('href') ??
      entry.querySelector('link')?.getAttribute('href') ??
      '';

    // EDGAR Atom feeds embed company info in the <content> block as text
    const content = getText('content');
    const companyMatch = content.match(/company-name[^>]*>([^<]+)</i) ??
      content.match(/\nCompany:\s*(.+)/i);
    const cikMatch = content.match(/cik[^>]*>(\d+)/i) ??
      getText('id').match(/(\d{10})/);
    const typeMatch = content.match(/type[^>]*>([^<]+)</i) ??
      getText('title').match(/\b(8-K|10-K|10-Q)\b/i);

    // The <title> format is usually: "Company Name (CIK) (filing-type)"
    const titleText = getText('title');
    const titleCompanyMatch = titleText.match(/^([^(]+)/);

    return {
      id: getText('id') || link,
      title: titleText,
      summary: getText('summary').replace(/<[^>]+>/g, '').trim(),
      updated: getText('updated'),
      link,
      companyName:
        companyMatch?.[1]?.trim() ??
        titleCompanyMatch?.[1]?.trim() ??
        'Unknown',
      cik: cikMatch?.[1]?.padStart(10, '0') ?? '',
      filingType: typeMatch?.[1]?.toUpperCase() ?? '',
    };
  });
}
