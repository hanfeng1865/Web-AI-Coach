const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_RE = /\bhttps?:\/\/[^\s]+/gi;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const LONG_NUMBER_RE = /\b\d{5,}\b/g;
const MONEY_RE = /[$€¥£]\s?\d[\d,.]*/g;

export function redactText(input) {
  if (!input) {
    return "";
  }

  return String(input)
    .replace(EMAIL_RE, "[email]")
    .replace(URL_RE, "[url]")
    .replace(DOMAIN_RE, "[site]")
    .replace(MONEY_RE, "[amount]")
    .replace(LONG_NUMBER_RE, "[number]")
    .trim();
}

export function redactArray(items, limit = 12) {
  return (items || [])
    .map((item) => {
      if (typeof item === "string") {
        return redactText(item);
      }

      return {
        ...item,
        label: redactText(item.label),
        text: redactText(item.text)
      };
    })
    .filter((item) => {
      if (typeof item === "string") {
        return item.length > 0;
      }

      return Boolean(item.label || item.text);
    })
    .slice(0, limit);
}

export function buildRedactionSummary(snapshot) {
  return {
    urlShared: false,
    inputValuesShared: false,
    rawDomShared: false,
    redactedFields: [
      "emails",
      "urls",
      "domains",
      "long numbers",
      "currency values",
      "input values"
    ],
    counts: {
      leftNavItems: snapshot.leftNavItems.length,
      visibleModules: snapshot.visibleModules.length,
      primaryActions: snapshot.primaryActions.length,
      notices: snapshot.notices.length
    }
  };
}
