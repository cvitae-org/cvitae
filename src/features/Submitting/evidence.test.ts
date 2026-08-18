import { describe, expect, it } from 'vitest';
import {
  approveVariant,
  buildCvFactCatalog,
  createEvidenceVariant,
  protectedFieldIssues,
  rebuildVariant,
  requiredChangeIds,
  validateEvidenceProposal,
  variantStalenessReasons
} from './evidence';
import {
  cvFixture,
  offerFixture,
  proposalFixture
} from '@/test/fixtures/evidence';

const response = () => ({
  version: 'evidence-v2' as const,
  proposal: proposalFixture(),
  provider: 'mock',
  model: 'mock-model',
  promptVersion: 'test',
  generatedAt: '2026-02-03T04:05:06.000Z'
});

describe('snapshot-scoped evidence variants', () => {
  it('materializes only allowed fields and keeps protected facts', () => {
    const source = cvFixture();
    const variant = createEvidenceVariant({
      sourceCv: source,
      sourceOffer: offerFixture(),
      language: 'en',
      response: response()
    });
    expect(variant.output.role_description).toContain('accessible React interfaces');
    expect(variant.output.experience[0].highlights).toHaveLength(1);
    expect(variant.output.personal).toEqual(source.personal);
    expect(variant.output.experience.map(({ company, title, started, finished }) => ({ company, title, started, finished }))).toEqual(
      source.experience.map(({ company, title, started, finished }) => ({ company, title, started, finished }))
    );
    expect(protectedFieldIssues(source, variant.output)).toEqual([]);
  });

  it('preserves an omitted job and makes an explicit empty selection removable', () => {
    const source = cvFixture();
    const omitted = proposalFixture();
    omitted.experience = omitted.experience.slice(0, 1);
    const omittedVariant = createEvidenceVariant({
      sourceCv: source,
      sourceOffer: offerFixture(),
      language: 'en',
      response: { ...response(), proposal: omitted }
    });
    expect(omittedVariant.output.experience[1].highlights).toEqual(
      source.experience[1].highlights
    );

    const explicit = proposalFixture();
    explicit.experience[1].bullets = [];
    const explicitVariant = createEvidenceVariant({
      sourceCv: source,
      sourceOffer: offerFixture(),
      language: 'en',
      response: { ...response(), proposal: explicit }
    });
    expect(explicitVariant.output.experience[1].highlights).toEqual([]);
    expect(requiredChangeIds(explicitVariant)).toContain('experience:1:selection');
  });

  it('rejects invalid evidence, cross-job evidence, fabricated numbers and technologies', () => {
    const catalog = buildCvFactCatalog(cvFixture(), 'en');
    const offer = offerFixture();

    const invalidId = proposalFixture();
    invalidId.skills[0].evidenceId = 'skill:missing';
    expect(validateEvidenceProposal(invalidId, catalog, offer.requirements).join(' ')).toContain(
      'not a CV skill evidence id'
    );

    const crossJob = proposalFixture();
    crossJob.experience[0].bullets[0].evidenceIds.push('experience:1:bullet:0');
    expect(validateEvidenceProposal(crossJob, catalog, offer.requirements).join(' ')).toContain(
      'evidence from another job'
    );

    const unknownJob = proposalFixture();
    unknownJob.experience.push({ jobIndex: 99, bullets: [] });
    expect(validateEvidenceProposal(unknownJob, catalog, offer.requirements).join(' ')).toContain(
      'unknown job 99'
    );

    const number = proposalFixture();
    number.summaryClaims[0].text = 'I delivered interfaces to 2M users with 40% gains.';
    expect(validateEvidenceProposal(number, catalog, offer.requirements).join(' ')).toContain(
      'unsupported numeric claim'
    );

    const technology = proposalFixture();
    technology.summaryClaims[0].text = 'I deploy React services with Kubernetes.';
    expect(validateEvidenceProposal(technology, catalog, offer.requirements).join(' ')).toContain(
      'unsupported technology "kubernetes"'
    );

    const unrelatedTechnology = proposalFixture();
    unrelatedTechnology.experience[0].bullets[0].text =
      'Built accessible React interfaces and deployed them to AWS.';
    expect(
      validateEvidenceProposal(unrelatedTechnology, catalog, offer.requirements).join(' ')
    ).toContain('unsupported technology "aws"');
  });

  it('rejects unsupported seniority inflation', () => {
    const proposal = proposalFixture();
    proposal.headline.text = 'Principal Frontend Developer';
    const issues = validateEvidenceProposal(
      proposal,
      buildCvFactCatalog(cvFixture(), 'en'),
      offerFixture().requirements
    );
    expect(issues.join(' ')).toContain('inflates unsupported seniority');
  });

  it('requires explicit acceptance, freezes approval, and resets approval after editing', () => {
    const variant = createEvidenceVariant({
      sourceCv: cvFixture(),
      sourceOffer: offerFixture(),
      language: 'en',
      response: response()
    });
    expect(() => approveVariant(variant)).toThrow(/Review and accept/);

    const reviewed = { ...variant, acceptedChangeIds: requiredChangeIds(variant) };
    const approved = approveVariant(reviewed);
    expect(approved.reviewState).toBe('approved');

    const tampered = {
      ...reviewed,
      output: {
        ...reviewed.output,
        skills: { ...reviewed.output.skills, role: 'Unsupported output' }
      }
    };
    expect(() => approveVariant(tampered)).toThrow(/does not match the reviewed proposal/);

    const proposal = proposalFixture();
    proposal.summaryClaims[0].text = 'I build accessible React interfaces.';
    const edited = rebuildVariant(approved, proposal);
    expect(edited.reviewState).toBe('draft');
    expect(edited.approvedAt).toBeUndefined();
  });

  it('reports every unsent staleness reason independently', () => {
    const variant = createEvidenceVariant({
      sourceCv: cvFixture(),
      sourceOffer: offerFixture(),
      language: 'en',
      response: response()
    });
    const changedCv = cvFixture();
    changedCv.role_description += ' Changed.';
    const changedOffer = offerFixture();
    changedOffer.position = 'Full-stack Developer';
    expect(variantStalenessReasons(variant, changedCv, changedOffer, 'pl')).toEqual([
      'application language changed',
      'master CV changed',
      'job offer changed'
    ]);
  });
});
