import { describe, expect, it } from 'vitest';
import {
  approveVariant,
  carryDecisions,
  mergeProposal,
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

  /**
   * The point of the change: a decision per change, not a gate on all of them.
   * A cleared box falls back to the source CV's own wording, so the output is
   * still only ever cited-and-proposed text or the user's own.
   */
  it('keeps the source wording for a change that was declined', () => {
    const variant = createEvidenceVariant({
      sourceCv: cvFixture(),
      sourceOffer: offerFixture(),
      language: 'en',
      response: response()
    });

    // The fixture rewrites the summary as two claims; the headline it leaves
    // alone, so it is not a change at all and never appears as a decision.
    expect(variant.acceptedChangeIds).toContain('summary:0');
    expect(variant.acceptedChangeIds).toContain('summary:1');

    const withoutFirstClaim = rebuildVariant(
      variant,
      variant.proposal,
      variant.acceptedChangeIds.filter((id) => id !== 'summary:0')
    );

    // The declined claim is dropped; the one still ticked is still applied.
    expect(withoutFirstClaim.output.role_description).toBe(
      variant.proposal.summaryClaims[1].text
    );
    expect(() => approveVariant(withoutFirstClaim)).not.toThrow();
  });

  it('approves a variant with every change declined, leaving the CV as written', () => {
    const variant = createEvidenceVariant({
      sourceCv: cvFixture(),
      sourceOffer: offerFixture(),
      language: 'en',
      response: response()
    });

    const declined = rebuildVariant(variant, variant.proposal, []);
    const source = cvFixture();

    expect(declined.output.skills.role).toBe(source.skills.role);
    // Not blanked: declining every claim asks to keep the summary, not to lose it.
    expect(declined.output.role_description).toBe(source.role_description);
    expect(approveVariant(declined).reviewState).toBe('approved');
  });

  /**
   * Regenerating one paragraph must not silently redo the other four sections,
   * nor reinstate a change the reader had already declined elsewhere.
   */
  it('adopts only the regenerated section and keeps decisions on the rest', () => {
    const variant = createEvidenceVariant({
      sourceCv: cvFixture(),
      sourceOffer: offerFixture(),
      language: 'en',
      response: response()
    });

    const withoutSkills = rebuildVariant(
      variant,
      variant.proposal,
      variant.acceptedChangeIds.filter((id) => id !== 'skills')
    );

    const fresh = proposalFixture();
    fresh.summaryClaims[0].text = 'I build accessible React interfaces.';
    fresh.headline.text = 'Completely Different Headline';

    const merged = mergeProposal(withoutSkills.proposal, fresh, ['summary']);

    expect(merged.summaryClaims[0].text).toBe('I build accessible React interfaces.');
    // Untouched sections come from the variant being refreshed, not the new call.
    expect(merged.headline).toEqual(withoutSkills.proposal.headline);
    expect(merged.skills).toEqual(withoutSkills.proposal.skills);
    expect(merged.experience).toEqual(withoutSkills.proposal.experience);

    const next = rebuildVariant(withoutSkills, merged, withoutSkills.acceptedChangeIds);
    const carried = carryDecisions(
      requiredChangeIds(next),
      requiredChangeIds(withoutSkills),
      withoutSkills.acceptedChangeIds,
      ['summary']
    );

    // The declined skills change stays declined; the regenerated summary is on.
    expect(carried).not.toContain('skills');
    expect(carried).toContain('summary:0');
  });

  it('starts with every change applied, freezes approval, and resets it after editing', () => {
    const variant = createEvidenceVariant({
      sourceCv: cvFixture(),
      sourceOffer: offerFixture(),
      language: 'en',
      response: response()
    });

    // A fresh variant is fully applied, so its preview is the tailored CV and
    // approving needs no ceremony first.
    expect(variant.acceptedChangeIds).toEqual(requiredChangeIds(variant));

    const reviewed = variant;
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
      'application-language',
      'master-cv',
      'job-offer'
    ]);
  });
});
