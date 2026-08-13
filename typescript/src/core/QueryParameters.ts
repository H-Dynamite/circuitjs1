/** Browser-native replacement for client/QueryParameters.java. */
export class QueryParameters {
  private readonly map = new Map<string, string>();

  public constructor(search = globalThis.location?.search ?? "") {
    const values = new URLSearchParams(search);
    values.forEach((value, key) => {
      this.map.set(key, value);
    });
  }

  public getValue(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  public getBooleanValue(key: string, defaultValue: boolean): boolean {
    const value = this.getValue(key);
    if (value === null) {
      return defaultValue;
    }
    return value === "1" || value.toLowerCase() === "true";
  }
}
