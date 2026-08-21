import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '../../../messages/en.json';
import pl from '../../../messages/pl.json';

type Catalog = Record<string, unknown>;

const flatten = (
  value: Catalog,
  prefix = '',
  result = new Map<string, string>()
): Map<string, string> => {
  Object.entries(value).forEach(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === 'string') result.set(path, entry);
    else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flatten(entry as Catalog, path, result);
    }
  });
  return result;
};

const argumentsOf = (message: string): string[] =>
  [...message.matchAll(/\{([A-Za-z_][\w-]*)(?:[,}])/g)]
    .map((match) => match[1])
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort();

describe('message catalogs', () => {
  const english = flatten(en);
  const polish = flatten(pl);

  it('has the same message keys in English and Polish', () => {
    expect([...polish.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('keeps ICU arguments aligned between languages', () => {
    for (const [key, message] of english) {
      expect(argumentsOf(polish.get(key) ?? ''), key).toEqual(
        argumentsOf(message)
      );
    }
  });

  it.each([
    ['en', en, english],
    ['pl', pl, polish]
  ] as const)('formats every %s message', (locale, catalog, flat) => {
    const translate = createTranslator({ locale, messages: catalog });

    for (const [key, message] of flat) {
      const values = Object.fromEntries(
        argumentsOf(message).map((argument) => [argument, 2])
      );
      expect(
        () => translate(key as never, values as never),
        key
      ).not.toThrow();
    }
  });
});
