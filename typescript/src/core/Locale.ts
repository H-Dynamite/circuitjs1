export class Locale {
  public static readonly ohmString = "\u03a9";
  public static readonly muString = "\u03bc";
  public static localizationMap = new Map<string, string>();

  public static LS(value: string | null): string | null {
    if (value === null || value.length === 0) {
      return value;
    }

    const translated = Locale.localizationMap.get(value);
    if (translated !== undefined) {
      return translated;
    }

    const marker = value.indexOf("~");
    if (marker !== value.length - 1) {
      return value;
    }

    const withoutMarker = value.substring(0, marker);
    return Locale.localizationMap.get(withoutMarker) ?? withoutMarker;
  }

  public static processLocale(data: string): Map<string, string> {
    const result = new Map<string, string>();
    for (const rawLine of data.split(/\r?\n/)) {
      const line = Locale.convertUnicodeEscapes(rawLine);
      if (line.length === 0 || line[0] !== '"') {
        continue;
      }

      const secondQuote = line.indexOf('"', 1);
      if (
        secondQuote < 0 ||
        line[secondQuote + 1] !== "=" ||
        line[secondQuote + 2] !== '"' ||
        line[line.length - 1] !== '"'
      ) {
        continue;
      }

      result.set(
        line.substring(1, secondQuote),
        line.substring(secondQuote + 3, line.length - 1)
      );
    }
    return result;
  }

  public static convertUnicodeEscapes(input: string): string {
    return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
  }

  public static weAreInUS(orCanada: boolean): boolean {
    const language = navigator.languages[0] ?? navigator.language;
    const region = language.split("-")[1]?.toUpperCase();
    return region === "US" || (orCanada && region === "CA");
  }

  public static weAreInGermany(): boolean {
    const language = navigator.languages[0] ?? navigator.language;
    return language.toUpperCase().startsWith("DE");
  }
}
