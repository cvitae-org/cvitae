import { describe, expect, it } from 'vitest';
import {
  normalizeOfferText,
  normalizeRequirements
} from './requirements';

describe('offer requirement normalization', () => {
  it('preserves safe unique ids across persistence round-trips', () => {
    const first = normalizeRequirements([
      {
        id: 'req-react',
        exactText: 'React',
        sourceQuote: 'Strong React knowledge',
        category: 'skill',
        priority: 'required'
      }
    ]);

    expect(first[0]?.id).toBe('req-react');
    expect(normalizeRequirements(first)).toEqual(first);
  });

  it('normalizes retained text without paraphrasing it', () => {
    expect(normalizeOfferText('  React\r\n\r\n\r\n  TypeScript  ')).toBe(
      'React\n\nTypeScript'
    );
  });

  it('deduplicates cited requirements and canonicalizes unknown fields', () => {
    const result = normalizeRequirements([
      { exactText: 'React', sourceQuote: 'Must know React', category: 'skill', priority: 'required' },
      { exact_text: 'react', category: 'invalid', priority: 'invalid' }
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      exactText: 'React',
      sourceQuote: 'Must know React',
      category: 'skill',
      priority: 'required'
    });
    expect(result[0].id).toMatch(/^req-/);
  });

  it('derives requirements for legacy analyses', () => {
    const result = normalizeRequirements(undefined, {
      required_skills: ['React'],
      responsibilities: ['Build UI']
    });
    expect(result.map((item) => item.category)).toEqual(['skill', 'responsibility']);
  });

  it('keeps only quotes supported by retained offer text', () => {
    const result = normalizeRequirements(
      [
        {
          exactText: 'React',
          sourceQuote: 'Invented quote',
          category: 'skill',
          priority: 'required'
        },
        {
          exactText: 'Kubernetes',
          sourceQuote: 'Invented Kubernetes requirement',
          category: 'skill',
          priority: 'required'
        }
      ],
      { required_skills: [], responsibilities: [] },
      'We require React and TypeScript.'
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ exactText: 'React', sourceQuote: 'React' });
  });
});
